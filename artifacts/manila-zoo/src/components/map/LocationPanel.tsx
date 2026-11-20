import React from "react";
import { formatCoords } from "@/lib/coords";
import { Crosshair, Hand, QrCode, Loader2, AlertTriangle, ShieldCheck, Footprints, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  locationQuality, isInsideZoo, GPS_ERROR_TEXT, POOR_ACCURACY_M,
  type VisitorLocation, type GpsError,
} from "@/lib/visitorLocation";
import type { NearestKind, NearestResult } from "@/lib/locationRoutes";
import { OUTSIDE_ZOO_TEXT } from "@/lib/zooBoundary";
import { inAppBrowser, locationSettingsHelp } from "@/lib/device";

const NEAREST: { kind: NearestKind; emoji: string; en: string; fil: string }[] = [
  { kind: "restroom", emoji: "🚻", en: "Restroom", fil: "CR" },
  { kind: "food", emoji: "🍔", en: "Food", fil: "Pagkain" },
  { kind: "first_aid", emoji: "⛑️", en: "First aid", fil: "First aid" },
  { kind: "exit", emoji: "🚪", en: "Exit", fil: "Labasan" },
];

type Props = {
  fil: boolean;
  loc: VisitorLocation | null;
  tracking: boolean;
  gpsWaiting: boolean;
  gpsError: GpsError | null;
  onMyLocation: () => void;
  onStopTracking: () => void;
  picking: boolean;
  onPick: () => void;
  onScan: () => void;
  onClearLocation: () => void;
  /** Highlights the panel when an action needed a location the app doesn't have */
  needLocation: boolean;
  nearestKind: NearestKind | null;
  onFindNearest: (kind: NearestKind) => void;
  nearest: { results: NearestResult[] } | undefined;
  nearestLoading: boolean;
  /** Metres outside the zoo, when GPS or the server found the visitor outside it (null: not outside) */
  outsideBy: number | null;
  selectedPinId: number | null;
  onChooseNearest: (pinId: number) => void;
};

/** Where the visitor is (and how we know), and "find the nearest restroom / food / first aid / exit". */
export function LocationPanel(p: Props) {
  const { fil, loc } = p;
  const quality = loc ? locationQuality(loc) : null;
  const outside = p.outsideBy != null || (!!loc && !isInsideZoo(loc));
  const kindLabel = NEAREST.find(n => n.kind === p.nearestKind);

  // How the position was found, stated plainly so nobody mistakes a rough GPS fix for a precise one
  const status = outside ? (
    <div role="alert" className="flex items-start gap-1.5 rounded-xl bg-amber-100 p-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {OUTSIDE_ZOO_TEXT[fil ? "fil" : "en"]}
        {p.outsideBy != null && p.outsideBy > 0 && (
          <span className="mt-1 block text-xs opacity-80">{fil ? `Mga ${p.outsideBy} m ka mula sa bakod ng zoo.` : `You're about ${p.outsideBy} m from the zoo fence.`}</span>
        )}
      </span>
    </div>
  ) : !loc ? (
    <p className="text-sm text-muted-foreground">
      {fil ? "Hindi pa namin alam kung nasaan ka. Gamitin ang GPS, pumili sa mapa, o mag-scan ng QR code sa malapit na karatula."
           : "We don't know where you are yet. Use GPS, pick your spot on the map, or scan the QR code on a nearby sign."}
    </p>
  ) : (
    <div className="space-y-1.5 text-sm">
      <p className="flex flex-wrap items-center gap-1.5 font-medium">
        {loc.source === "gps" && <>📡 {fil ? "Mula sa GPS" : "From GPS"} <span className="font-normal text-muted-foreground">· ±{loc.accuracy} m</span></>}
        {loc.source === "manual" && <>👆 {fil ? "Pinili mo sa mapa" : "Picked on the map"}{loc.label && <span className="font-normal text-muted-foreground">· {loc.label}</span>}</>}
        {loc.source === "qr" && <><ShieldCheck className="h-4 w-4 text-primary" /> {fil ? "Mula sa QR code" : "From a QR code"} <span className="font-normal text-muted-foreground">· {loc.label}</span></>}
      </p>
      <p className="font-mono text-xs tabular-nums text-muted-foreground" title={fil ? "Iyong mga coordinate" : "Your coordinates"}>
        📍 {formatCoords(loc.lat, loc.lng)}
      </p>
      {quality === "poor" ? (
        <p className="flex items-start gap-1.5 rounded-xl bg-amber-100 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {fil ? `Malabo ang GPS dito (higit ${POOR_ACCURACY_M} m). Para sa tamang ruta, pumili sa mapa o mag-scan ng QR code.`
               : `GPS is rough here (over ${POOR_ACCURACY_M} m off). For an accurate route, pick your spot on the map or scan a QR code.`}
        </p>
      ) : quality === "fair" ? (
        <p className="text-xs text-muted-foreground">
          {fil ? "Tantiya lang ang lokasyon (natatakpan ng puno at bubong ang GPS)." : "Approximate: trees and roofs make GPS less exact here."}
        </p>
      ) : null}
    </div>
  );

  return (
    <section
      aria-labelledby="loc-heading"
      className={`rounded-3xl border p-4 transition-shadow ${p.needLocation && !loc ? "border-primary bg-primary/5 ring-2 ring-primary/40" : "bg-secondary/50"}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 id="loc-heading" className="flex items-center text-base font-bold">
          <span className="mr-2 inline-block h-3 w-3 rounded-full border-2 border-white bg-blue-600 shadow" aria-hidden="true" />
          {fil ? "Nasaan ka" : "Your location"}
        </h2>
        {loc && (
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={p.onClearLocation} aria-label={fil ? "Burahin ang lokasyon" : "Clear location"}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {status}

      {p.gpsWaiting && (
        <p className="mt-2 flex items-center text-xs text-muted-foreground">
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> {fil ? "Kinukuha ang lokasyon mo…" : "Getting your location…"}
        </p>
      )}
      {p.gpsError && (
        <p role="alert" className="mt-2 rounded-xl bg-destructive/10 p-2 text-xs text-destructive">
          {GPS_ERROR_TEXT[p.gpsError][fil ? "fil" : "en"]}
          {/* Turning location back on is in a different place on iPhone and Android */}
          {p.gpsError === "denied" && <span className="mt-1 block font-medium">{locationSettingsHelp(fil ? "fil" : "en")}</span>}
          {p.gpsError !== "insecure" && inAppBrowser && (
            <span className="mt-1 block font-medium">
              {fil ? `Hinaharangan ng browser ng ${inAppBrowser} ang lokasyon: buksan ang page sa Safari o Chrome.` : `${inAppBrowser}'s built-in browser blocks location: open this page in Safari or Chrome.`}
            </span>
          )}
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button
          size="sm"
          variant={p.tracking ? "default" : "outline"}
          className="h-auto flex-col gap-1 rounded-2xl py-2 text-xs"
          onClick={p.tracking ? p.onStopTracking : p.onMyLocation}
          aria-pressed={p.tracking}
        >
          <Crosshair className="h-4 w-4" />
          {p.tracking ? (fil ? "Itigil ang GPS" : "Stop GPS") : (fil ? "Aking lokasyon" : "My location")}
        </Button>
        <Button size="sm" variant={p.picking ? "default" : "outline"} className="h-auto flex-col gap-1 rounded-2xl py-2 text-xs" onClick={p.onPick} aria-pressed={p.picking}>
          <Hand className="h-4 w-4" /> {fil ? "Pumili sa mapa" : "Select location"}
        </Button>
        <Button size="sm" variant="outline" className="h-auto flex-col gap-1 rounded-2xl py-2 text-xs" onClick={p.onScan}>
          <QrCode className="h-4 w-4" /> {fil ? "I-scan ang QR" : "Scan QR"}
        </Button>
      </div>

      {/* What the location features can and can't do inside the zoo */}
      <details className="mt-3 rounded-2xl bg-card/70 p-2.5 text-xs">
        <summary className="cursor-pointer font-medium">ℹ️ {fil ? "Gaano katumpak ang lokasyon ko?" : "How accurate is my location?"}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
          {(fil ? [
            "📡 GPS: gumagamit ng GPS ng telepono mo. Sa labas, karaniwang 5–15 m ang layo nito sa totoo; sa ilalim ng puno at bubong, maaaring 20–60 m o higit pa.",
            "Gumagalaw ang asul na tuldok tuwing may bagong GPS reading (bawat ilang segundo) habang bukas ang page na ito. Tumitigil ito kapag naka-lock ang screen o nasa ibang app ka.",
            "Hindi gumagamit ang app ng Wi-Fi o Bluetooth beacon, kaya hindi nito alam kung nasa loob ka ng gusali o kung anong palapag.",
            "Kailangan ng https:// at pahintulot sa lokasyon. Ang bilog sa paligid ng tuldok ay kung gaano kalabo ang GPS.",
            "🔳 QR code: ang pinakatumpak. I-scan ang karatula sa exhibit at alam na namin kung nasaan ka eksakto.",
            "👆 Pumili sa mapa: i-tap kung nasaan ka. Hindi ito kusang gagalaw; i-tap ulit o mag-scan habang naglalakad.",
          ] : [
            "📡 GPS uses your phone's own GPS. In the open it's usually 5–15 m off; under trees and roofs it can be 20–60 m or more.",
            "The blue dot moves with each new GPS reading (every few seconds) while this page is open. It stops when the screen is locked or you switch apps.",
            "The app doesn't use Wi-Fi or Bluetooth beacons, so it can't tell if you're inside a building or on which floor.",
            "It needs an https:// page and your permission. The circle around the dot shows how uncertain the GPS is.",
            "🔳 QR codes are the most accurate: scan the sign at an exhibit and the map knows exactly where you are.",
            "👆 Select location: tap where you are. It won't move by itself; tap again or scan a sign as you walk.",
          ]).map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </details>

      {/* Nearest facility */}
      <div className="mt-4 border-t pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fil ? "Hanapin ang pinakamalapit" : "Find the nearest"}</p>
        <Button className="mb-2 w-full rounded-full" onClick={() => p.onFindNearest("restroom")} aria-pressed={p.nearestKind === "restroom"}>
          🚻 {fil ? "Pinakamalapit na CR" : "Find Nearest Restroom"}
        </Button>
        <div className="grid grid-cols-3 gap-1.5">
          {NEAREST.slice(1).map(n => (
            <button
              key={n.kind}
              type="button"
              onClick={() => p.onFindNearest(n.kind)}
              aria-pressed={p.nearestKind === n.kind}
              className={`rounded-full border px-2 py-1.5 text-xs font-medium transition-colors ${p.nearestKind === n.kind ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"}`}
            >
              {n.emoji} {fil ? n.fil : n.en}
            </button>
          ))}
        </div>

        {p.nearestKind && !loc && !outside && (
          <p className="mt-3 rounded-xl bg-card p-2 text-xs">
            {fil ? "Sabihin muna kung nasaan ka (GPS, pumili sa mapa, o QR code) para mahanap ang pinakamalapit."
                 : "First tell us where you are (GPS, select on map, or scan a QR code) so we can find the nearest one."}
          </p>
        )}
        {p.nearestKind && outside && (
          <p className="mt-3 rounded-xl bg-card p-2 text-xs">{OUTSIDE_ZOO_TEXT[fil ? "fil" : "en"]}</p>
        )}
        {p.nearestKind && loc && !outside && p.nearestLoading && !p.nearest && (
          <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        )}
        {p.nearestKind && loc && !outside && p.nearest && (
          p.nearest.results.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">{fil ? "Walang nakatalang lugar na ganito sa mapa." : "No places of this kind are on the map yet."}</p>
          ) : (
            <ol className="mt-3 space-y-1.5" aria-label={kindLabel ? `${kindLabel.en}, nearest first` : undefined}>
              {p.nearest.results.map((r, i) => (
                <li key={r.pin_id}>
                  <button
                    type="button"
                    onClick={() => p.onChooseNearest(r.pin_id)}
                    className={`flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm transition-colors ${p.selectedPinId === r.pin_id ? "border-primary bg-card shadow-sm" : "bg-card/60 hover:bg-card"}`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="flex items-center text-xs text-muted-foreground">
                        <Footprints className="mr-1 h-3 w-3" />
                        {r.distance_m} m · {r.walk_minutes} min
                        {!r.on_paths && ` · ${fil ? "tantiyang tuwid na linya" : "straight-line estimate"}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )
        )}
      </div>
    </section>
  );
}
