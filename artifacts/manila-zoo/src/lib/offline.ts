import { useSyncExternalStore } from "react";
import { SATELLITE_MAX_ZOOM, SATELLITE_URL } from "@/lib/satellite";
import {
  getSearchAnimalsUrl,
  getGetAnimalUrl,
  getGetAnimalGalleryUrl,
  getFetchNearbyAnimalsUrl,
  getGetFeaturedAnimalsUrl,
  getListCategoriesUrl,
  getListMapPinsUrl,
  getGetMapConfigUrl,
  getGetMapLayoutUrl,
  getSearchFaqsUrl,
  getListAnnouncementsUrl,
  getListEventsUrl,
} from "@workspace/api-client-react";

// ─── Service worker ──────────────────────────────────────────────────────────

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(err => {
      console.warn("Offline support unavailable:", err);
    });
  });
}

/** Resolves once the service worker controls this page, so prefetched files get saved. */
async function waitForServiceWorker(timeoutMs = 5000): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller) return true;
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    navigator.serviceWorker.addEventListener("controllerchange", () => { clearTimeout(timer); resolve(true); }, { once: true });
  });
}

// ─── Online status ───────────────────────────────────────────────────────────

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

// ─── "Save zoo for offline" ──────────────────────────────────────────────────

// Same tile layer and zoom range the visitor map uses (it enlarges zoom 19 for 20–21)
const TILE_SUBDOMAINS = "abc";
const TILE_ZOOMS = [16, 17, 18, 19];
const TILE_PADDING_DEG = 0.0015; // ~165 m around the outermost pins

function tileUrlsFor(bounds: { south: number; west: number; north: number; east: number }): string[] {
  const urls: string[] = [];
  const lngToX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
  const latToY = (lat: number, z: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };
  for (const z of TILE_ZOOMS) {
    for (let x = lngToX(bounds.west, z); x <= lngToX(bounds.east, z); x++) {
      for (let y = latToY(bounds.north, z); y <= latToY(bounds.south, z); y++) {
        // Leaflet picks the subdomain the same way, so the saved URL matches what the map asks for
        const s = TILE_SUBDOMAINS[Math.abs(x + y) % TILE_SUBDOMAINS.length];
        urls.push(`https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`);
        // The 3D map's aerial photo of the same spot (its realistic look)
        if (z <= SATELLITE_MAX_ZOOM) urls.push(SATELLITE_URL.replace("{z}", String(z)).replace("{y}", String(y)).replace("{x}", String(x)));
      }
    }
  }
  return urls;
}

export type SaveProgress = { done: number; total: number; failed: number };

/**
 * Downloads what a visitor needs without signal: zoo data, every animal page, photos and the
 * map tiles around the zoo. The service worker stores each response as it passes through.
 */
export async function saveZooForOffline(onProgress: (p: SaveProgress) => void): Promise<SaveProgress> {
  if (!(await waitForServiceWorker())) {
    throw new Error("Offline saving isn't supported in this browser.");
  }

  const getJson = async <T,>(url: string): Promise<T> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json() as Promise<T>;
  };

  // The two lists everything else is derived from
  const [animals, pins] = await Promise.all([
    getJson<{ id: number; image_url?: string | null }[]>(getSearchAnimalsUrl()),
    getJson<{ lat: number | string; lng: number | string }[]>(getListMapPinsUrl()),
  ]);

  const urls = new Set<string>([
    getSearchAnimalsUrl({ limit: 500 }),
    getGetFeaturedAnimalsUrl(),
    getListCategoriesUrl(),
    getGetMapConfigUrl(),
    getGetMapLayoutUrl(),
    getSearchFaqsUrl({ language: "en" }),
    getSearchFaqsUrl({ language: "fil" }),
    getListAnnouncementsUrl(),
    getListEventsUrl(),
  ]);
  for (const a of animals) {
    urls.add(getGetAnimalUrl(a.id));
    urls.add(getGetAnimalGalleryUrl(a.id));
    urls.add(getFetchNearbyAnimalsUrl(a.id));
    if (a.image_url) urls.add(a.image_url);
  }
  if (pins.length > 0) {
    const lats = pins.map(p => Number(p.lat)), lngs = pins.map(p => Number(p.lng));
    tileUrlsFor({
      south: Math.min(...lats) - TILE_PADDING_DEG, north: Math.max(...lats) + TILE_PADDING_DEG,
      west: Math.min(...lngs) - TILE_PADDING_DEG, east: Math.max(...lngs) + TILE_PADDING_DEG,
    }).forEach(u => urls.add(u));
  }

  const list = [...urls];
  const progress: SaveProgress = { done: 0, total: list.length, failed: 0 };
  onProgress({ ...progress });

  // A few at a time, to be gentle on the zoo server and the OpenStreetMap tile servers
  const CONCURRENCY = 4;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const url = list[next++]!;
      try {
        const sameOrigin = url.startsWith("/");
        const response = await fetch(url, sameOrigin ? {} : { mode: "no-cors" });
        if (sameOrigin && !response.ok) progress.failed++;
      } catch {
        progress.failed++;
      }
      progress.done++;
      onProgress({ ...progress });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return progress;
}
