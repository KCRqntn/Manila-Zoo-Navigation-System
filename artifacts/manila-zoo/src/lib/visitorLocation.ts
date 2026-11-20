import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { metresOutsideZoo, isInsideZoo } from "./zooBoundary";

// ─── Last scanned animal (kept for the chatbot's "start from the exhibit" fallback) ──────────

const SCAN_KEY = "zoo:lastScan";
const SCAN_MAX_AGE_MS = 3 * 60 * 60 * 1000; // a scan older than a zoo visit (~3 h) no longer says where they are

export function saveScannedAnimal(animalId: number): void {
  try {
    localStorage.setItem(SCAN_KEY, JSON.stringify({ animalId, at: Date.now() }));
  } catch {
    // Storage can be unavailable (private mode)
  }
}

export function getRecentScannedAnimal(): number | null {
  try {
    const raw = localStorage.getItem(SCAN_KEY);
    if (!raw) return null;
    const { animalId, at } = JSON.parse(raw) as { animalId?: number; at?: number };
    if (typeof animalId !== "number" || typeof at !== "number" || Date.now() - at > SCAN_MAX_AGE_MS) return null;
    return animalId;
  } catch {
    return null;
  }
}

// ─── Where the visitor is now ────────────────────────────────────────────────────────────────

/**
 * The visitor's current position and how it was found. It is never assumed: it comes from the
 * phone's GPS, a spot the visitor tapped on the map, or the place whose QR code they scanned.
 */
export type VisitorLocation = {
  lat: number;
  lng: number;
  source: "gps" | "manual" | "qr";
  /** GPS only: radius in metres the phone is ~68% sure the visitor is within */
  accuracy?: number;
  /** QR only: the place the code marks */
  label?: string;
  pinId?: number;
  at: number;
};

const LOC_KEY = "zoo:visitorLocation";
const CHANGE_EVENT = "zoo:location-change";
// People walk: a fix gets stale. GPS refreshes itself while tracking; a tap or scan is a one-off.
const MAX_AGE_MS = { gps: 2 * 60 * 1000, manual: 15 * 60 * 1000, qr: 20 * 60 * 1000 };

/** GPS fixes worse than this can't tell which path the visitor is on, so the app asks for a scan or a tap. */
export const GOOD_ACCURACY_M = 25;
export const POOR_ACCURACY_M = 60;

let cached: VisitorLocation | null | undefined;

// ─── Demo mode (admin portal → Navigation Demo only) ───
// While on, the position lives in memory only: it is never saved to the browser or shared with other
// tabs, so the visitor website never sees a simulated position, and real GPS is never asked for (the
// demo page feeds simulated GPS fixes through setVisitorLocation instead).
let demoMode = false;
let demoCached: VisitorLocation | null = null;
export const isLocationDemo = () => demoMode;
export function setLocationDemoMode(on: boolean): void {
  if (demoMode === on) return;
  demoMode = on;
  demoCached = null;
  cached = undefined;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function readStored(): VisitorLocation | null {
  try {
    const raw = localStorage.getItem(LOC_KEY);
    if (!raw) return null;
    const loc = JSON.parse(raw) as VisitorLocation;
    if (typeof loc.lat !== "number" || typeof loc.lng !== "number" || !(loc.source in MAX_AGE_MS) || !isInsideZoo(loc)) return null;
    return Date.now() - loc.at > MAX_AGE_MS[loc.source] ? null : loc;
  } catch {
    return null;
  }
}

export function getVisitorLocation(): VisitorLocation | null {
  // The simulated walk updates every half second and can be paused, so it never goes stale
  if (demoMode) return demoCached;
  if (cached === undefined) cached = readStored();
  // Expire stale fixes even without a new update
  if (cached && Date.now() - cached.at > MAX_AGE_MS[cached.source]) cached = null;
  return cached;
}

/**
 * Sets (or clears, with null) the visitor's position. Only positions inside Manila Zoo are kept:
 * returns false, changing nothing, for one outside it.
 */
export function setVisitorLocation(loc: Omit<VisitorLocation, "at"> | null): boolean {
  if (loc && !isInsideZoo(loc)) return false;
  if (demoMode) {
    demoCached = loc ? { ...loc, lat: Number(loc.lat), lng: Number(loc.lng), at: Date.now() } : null;
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  }
  // Map pins arrive from the database with text coordinates ("14.5648"); store real numbers
  cached = loc ? { ...loc, lat: Number(loc.lat), lng: Number(loc.lng), at: Date.now() } : null;
  try {
    if (cached) localStorage.setItem(LOC_KEY, JSON.stringify(cached));
    else localStorage.removeItem(LOC_KEY);
  } catch {
    // Not saved across pages; still works on this one
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

function subscribe(onChange: () => void) {
  // Another tab may update it; drop the cached copy so the stored one is read again
  const onStorage = (e: StorageEvent) => {
    if (e.key !== LOC_KEY || demoMode) return;
    cached = undefined;
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The visitor's current position, re-rendering when it changes. */
export function useVisitorLocation(): VisitorLocation | null {
  return useSyncExternalStore(subscribe, getVisitorLocation, () => null);
}

/** How trustworthy a position is for routing. */
export function locationQuality(loc: VisitorLocation): "good" | "fair" | "poor" {
  if (loc.source !== "gps") return "good"; // a scanned QR code or a deliberate tap
  if ((loc.accuracy ?? Infinity) <= GOOD_ACCURACY_M) return "good";
  return (loc.accuracy ?? Infinity) <= POOR_ACCURACY_M ? "fair" : "poor";
}

export { isInsideZoo };

// ─── Live GPS tracking ───────────────────────────────────────────────────────────────────────

export type GpsError = "insecure" | "unsupported" | "denied" | "unavailable" | "timeout";

/**
 * Follows the phone's GPS with watchPosition while `active`. Browsers only allow this on HTTPS
 * or localhost; plain http:// on a phone (e.g. http://192.168…) is refused before asking.
 *
 * Fixes are only used inside Manila Zoo. A fix outside it isn't stored or shown; instead
 * `outsideBy` says how many metres outside the visitor is (null while inside or unknown).
 */
export function useGpsTracking(active: boolean) {
  const [error, setError] = useState<GpsError | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [outsideBy, setOutsideBy] = useState<number | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!active) { setOutsideBy(null); return; }
    // Demo mode: the simulated walk supplies the fixes; the real GPS stays off
    if (demoMode) { setError(null); setWaiting(false); setOutsideBy(null); return; }
    if (!window.isSecureContext) { setError("insecure"); return; }
    if (!("geolocation" in navigator)) { setError("unsupported"); return; }
    setError(null);
    setWaiting(true);
    watchId.current = navigator.geolocation.watchPosition(
      pos => {
        setWaiting(false);
        setError(null);
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy), source: "gps" as const };
        if (setVisitorLocation(fix)) { setOutsideBy(null); return; }
        // Outside the zoo: stop showing an old GPS position as if the visitor were still inside
        setOutsideBy(Math.round(metresOutsideZoo(fix.lat, fix.lng)));
        if (getVisitorLocation()?.source === "gps") setVisitorLocation(null);
      },
      err => {
        setWaiting(false);
        setError(err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable");
      },
      // High accuracy uses real GPS on phones; maximumAge lets a fix from a few seconds ago count
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setWaiting(false);
    };
  }, [active]);

  return { error, waiting, outsideBy };
}

export const GPS_ERROR_TEXT: Record<GpsError, { en: string; fil: string }> = {
  insecure: {
    en: "Location only works on a secure (https://) page. Pick your spot on the map or scan a QR code instead.",
    fil: "Gumagana lang ang lokasyon sa secure (https://) na page. Pumili sa mapa o mag-scan ng QR code.",
  },
  unsupported: {
    en: "This browser can't share your location. Pick your spot on the map or scan a QR code.",
    fil: "Hindi maibahagi ng browser na ito ang lokasyon mo. Pumili sa mapa o mag-scan ng QR code.",
  },
  denied: {
    en: "Location permission is off. Allow it in your browser settings, or pick your spot on the map / scan a QR code.",
    fil: "Naka-off ang pahintulot sa lokasyon. Payagan ito sa settings, o pumili sa mapa / mag-scan ng QR code.",
  },
  unavailable: {
    en: "Your phone couldn't get a GPS fix here (trees and roofs block it). Pick your spot on the map or scan a QR code.",
    fil: "Hindi makakuha ng GPS dito (natatakpan ng puno o bubong). Pumili sa mapa o mag-scan ng QR code.",
  },
  timeout: {
    en: "Getting your location is taking too long. Try again in the open, pick your spot on the map, or scan a QR code.",
    fil: "Matagal makuha ang lokasyon mo. Subukan sa bukas na lugar, pumili sa mapa, o mag-scan ng QR code.",
  },
};
