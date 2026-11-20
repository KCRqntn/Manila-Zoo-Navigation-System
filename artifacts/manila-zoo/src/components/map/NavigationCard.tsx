import { ArrowLeft, ArrowRight, ArrowUp, Flag, Loader2, X, AlertTriangle } from "lucide-react";
import type { MapRoute } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { locationQuality, type VisitorLocation } from "@/lib/visitorLocation";

type Turn = "left" | "right" | "straight" | "arrive";

/** Which way a route step turns, read from its wording (English or Filipino, as the server writes it). */
export function stepTurn(step: string): Turn {
  if (/will be on your|nasa inyong|you have arrived|nakarating/i.test(step)) return "arrive";
  if (/turn left|kumaliwa/i.test(step)) return "left";
  if (/turn right|kumanan/i.test(step)) return "right";
  return "straight";
}

const TURN_ICON = { left: ArrowLeft, right: ArrowRight, straight: ArrowUp, arrive: Flag };

/** Straight-line distance in metres between two points (for the arrival check). */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
}

// Closer than this to the destination counts as there; a rough GPS fix gets a wider circle (up to 30 m)
const ARRIVE_M = 15;

/** Whether the visitor has reached the destination (the card and the walking footsteps both use this). */
export function hasArrived(here: VisitorLocation, destination: { lat: number; lng: number }): boolean {
  const within = here.source === "gps" ? Math.max(ARRIVE_M, Math.min(here.accuracy ?? ARRIVE_M, 30)) : ARRIVE_M;
  return metresBetween(here, destination) <= within;
}

/** Why the walking footsteps aren't moving, if they should be (live GPS navigation only). */
export type FootstepsPause = "gps_off" | "gps_lost" | null;

type Props = {
  fil: boolean;
  route: MapRoute | undefined;
  loading: boolean;
  here: VisitorLocation;
  destination: { name: string; emoji: string; lat: number; lng: number; animals: string[] };
  onStop: () => void;
  footstepsPaused?: FootstepsPause;
};

/**
 * Live navigation on the map, written for children and first-time visitors: where you're going,
 * the next turn as a big arrow, how far is left, and a clear "You've arrived". It also says how
 * the position updates: GPS follows the visitor as they walk; a tapped spot or a scanned QR code
 * stays put until they tap or scan again, and the card says so instead of pretending to track.
 */
export function NavigationCard({ fil, route, loading, here, destination, onStop, footstepsPaused = null }: Props) {
  const arrived = hasArrived(here, destination);
  // The route is re-planned from where the visitor is, so its first step is "start here, head …";
  // the next real instruction is the step after it
  const steps = route?.steps ?? [];
  const next = steps.length > 1 ? steps[1]! : steps[0];
  const turn = next ? stepTurn(next) : "straight";
  const TurnIcon = TURN_ICON[turn];
  const poorGps = here.source === "gps" && locationQuality(here) === "poor";

  return (
    <section
      aria-live="polite"
      aria-label={fil ? "Gabay sa paglalakad" : "Walking guide"}
      // Phones: beside the "My location" button; wider screens: centred at the bottom
      className="absolute bottom-2 left-16 right-2 z-[1001] rounded-3xl border-2 border-primary/30 bg-card/95 p-2.5 shadow-2xl backdrop-blur md:bottom-4 md:left-1/2 md:right-auto md:w-[28rem] md:-translate-x-1/2 md:p-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl" aria-hidden="true">{destination.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{fil ? "Papunta sa" : "Going to"}</p>
          <p className="truncate text-base font-bold leading-tight">{destination.name}</p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 rounded-full" onClick={onStop}>
          <X className="mr-1 h-4 w-4" /> {fil ? "Itigil" : "Stop"}
        </Button>
      </div>

      {arrived ? (
        <div className="mt-2 rounded-2xl bg-primary/10 p-3 text-center">
          <p className="text-lg font-bold">🎉 {fil ? "Nakarating ka na sa iyong destinasyon!" : "You have arrived at your destination!"}</p>
          <p className="text-sm font-semibold">{destination.emoji} {destination.name}</p>
          {destination.animals.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">{fil ? "Hanapin ang" : "Look for the"} {destination.animals.slice(0, 4).join(", ")}</p>
          )}
        </div>
      ) : !route ? (
        <div className="mt-3 flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {fil ? "Hinahanap ang daan…" : "Finding the way…"}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-3 rounded-2xl bg-secondary/70 p-2 md:p-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl md:h-14 md:w-14 ${turn === "arrive" ? "bg-red-600" : "bg-primary"} text-primary-foreground`} aria-hidden="true">
            <TurnIcon className="h-7 w-7 md:h-8 md:w-8" strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug">{next}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fil ? `${route.distance_m} m pa · mga ${route.walk_minutes} minutong lakad` : `${route.distance_m} m to go · about ${route.walk_minutes} min walk`}
              {loading && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
            </p>
          </div>
        </div>
      )}

      {/* How the blue dot moves, said plainly */}
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {here.source === "gps"
          ? (fil ? `📡 Sumusunod ang asul na tuldok sa GPS habang naglalakad ka (±${here.accuracy} m). Panatilihing bukas ang page na ito.`
                 : `📡 The blue dot follows GPS as you walk (±${here.accuracy} m). Keep this page open.`)
          : (fil ? "👆 Hindi kusang gagalaw ang tuldok mo. Pagdating sa susunod na karatula, i-scan ang QR code nito o i-tap kung nasaan ka."
                 : "👆 Your dot won't move by itself. At the next sign, scan its QR code or tap where you are.")}
      </p>
      {footstepsPaused && !arrived && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {footstepsPaused === "gps_off"
            ? (fil ? "Naka-pause ang mga yapak: naka-off ang GPS. Pindutin ang \"Aking lokasyon\" para ituloy." : "Footsteps paused: GPS is off. Tap \"My location\" to continue.")
            : (fil ? "Naka-pause ang mga yapak: nawala ang signal ng GPS. Itutuloy ito kapag bumalik ang signal." : "Footsteps paused: the GPS signal was lost. They'll continue when it's back.")}
        </p>
      )}
      {poorGps && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {fil ? "Malabo ang GPS dito. Mag-scan ng QR code para sa tamang ruta." : "GPS is rough here. Scan a QR code for an accurate route."}
        </p>
      )}
    </section>
  );
}
