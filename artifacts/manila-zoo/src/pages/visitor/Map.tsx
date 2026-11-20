import React, { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListMapPins, useGetMapConfig, useGetMapRoute, useSearchAnimals, useListEvents, getGetMapRouteQueryKey, type MapFeature } from "@workspace/api-client-react";
import { Loader2, Search, MapPin as MapPinIcon, Navigation, Footprints, X, ArrowUpDown, Accessibility, ArrowRight, Flag, CircleDot, Crosshair } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QrScannerPanel } from "@/components/QrScannerPanel";
import { LocationPanel } from "@/components/map/LocationPanel";
import { NavigationCard, hasArrived, type FootstepsPause } from "@/components/map/NavigationCard";
import { useRouteFromHere, useNearest, outsideZooMetres, type NearestKind } from "@/lib/locationRoutes";
import { useLiveMapLayout, ExtrudedFeatures, FlatFeatures, Walkways, FloorPlanOverlay, RouteLine, Footsteps2D, ParkFacilities2D, ParkTrees2D, isPublished } from "@/components/map/ZooMapLayers";
import { useFacilities, useParkAreas, facilityType, facilityStatus, type Facility } from "@/lib/parkAreas";
import { useAppCtx } from "../../contexts/AppContext";
import { BackButton } from "@/components/layout/BackButton";
import { SaveOfflineButton } from "@/components/map/SaveOfflineButton";
import { AnimalImage } from "@/components/AnimalImage";
import { pinColor } from "@/lib/pinColor";
import { PlaceIconView, placeIconHtml } from "@/lib/placeIcon";
import { formatCoords, copyCoords } from "@/lib/coords";
import { useVisitorLocation, setVisitorLocation, useGpsTracking, isInsideZoo, type VisitorLocation } from "@/lib/visitorLocation";
import { ZOO_BOUNDARY, ZOO_VIEW_BOX, ZOO_VIEW_CENTER, zooBounds, OUTSIDE_ZOO_TEXT, WALKING_GUIDE_OUTSIDE_TEXT } from "@/lib/zooBoundary";
import { useToast } from "@/hooks/use-toast";

// The 3D view (MapLibre GL, ~1 MB) loads only when it is shown
const Zoo3DView = lazy(() => import("@/components/map/Zoo3DView"));

import { MapContainer, TileLayer, Marker, Circle, Polygon, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconShadowUrl from "leaflet/dist/images/marker-shadow.png";
import { can3D } from "@/lib/browserSupport";
import { photoUrl } from "@/lib/photoUrl";

L.Icon.Default.mergeOptions({ iconUrl, shadowUrl: iconShadowUrl });

// The 2D map shows Manila Zoo only: it can't be panned or zoomed out past the zoo, and the
// streets around it are greyed out behind a mask with the zoo's outline cut out of it.
const ZOO_RING: [number, number][] = ZOO_BOUNDARY.map(([lng, lat]) => [lat, lng]);
const WORLD_RING: [number, number][] = [[-85, -180], [-85, 180], [85, 180], [85, -180]];
// Panning: the fence plus a narrow margin (no drifting off into the estero or the streets)
const MAP_BOUNDS = zooBounds(50);
const MIN_ZOOM_2D = 16;
// Opening view: the whole zoo (same frame as the 3D map), sized to the screen
const VIEW_PADDING: [number, number] = [16, 16];
/** How far past the whole-zoo frame a visitor can zoom out (zoom levels; 0.5 ≈ the zoo at 70% size) */
const ZOOM_OUT_SLACK = 0.5;

/** Frames the whole zoo again each time `signal` changes (the "Reset view" button) */
function FitZoo2D({ signal }: { signal: number }) {
  const map = useMap();
  useEffect(() => { if (signal) map.flyToBounds(ZOO_VIEW_BOX, { padding: VIEW_PADDING, duration: 0.8 }); }, [signal, map]);
  return null;
}

/**
 * Zooming out stops a little past the whole-zoo frame for this screen size, so the zoo stays the main
 * thing on screen instead of shrinking into the greyed-out streets and the estero around it.
 * Recomputed when the map is resized (rotating a phone, opening a side panel).
 */
function ZooZoomLimit2D() {
  const map = useMap();
  useEffect(() => {
    const apply = () => {
      const size = map.getSize();
      if (size.x <= 0 || size.y <= 0) return;
      const fit = map.getBoundsZoom(L.latLngBounds(ZOO_VIEW_BOX), false, L.point(VIEW_PADDING[0] * 2, VIEW_PADDING[1] * 2));
      map.setMinZoom(Math.max(MIN_ZOOM_2D, Math.floor((fit - ZOOM_OUT_SLACK) * 4) / 4));
    };
    apply();
    map.on("resize", apply);
    return () => { map.off("resize", apply); };
  }, [map]);
  return null;
}

type MapView = "2d" | "3d";
const VIEW_KEY = "zoo:mapView";
function savedView(): MapView {
  // Older phones can't run the 3D map; they always get 2D
  if (!can3D) return "2d";
  try { return localStorage.getItem(VIEW_KEY) === "2d" ? "2d" : "3d"; } catch { return "3d"; }
}

// Filter chips: one kind of place at a time. Footprints of other kinds lie flat on the map.
type CategoryId = "all" | "animals" | "buildings" | "food" | "restrooms" | "gates";
const CATEGORIES: { id: CategoryId; emoji: string; en: string; fil: string; pinTypes: string[]; featureTypes: string[] }[] = [
  { id: "all", emoji: "🌏", en: "All", fil: "Lahat", pinTypes: [], featureTypes: [] },
  { id: "animals", emoji: "🦁", en: "Animals", fil: "Mga Hayop", pinTypes: ["animal"], featureTypes: ["enclosure"] },
  { id: "buildings", emoji: "🏛️", en: "Buildings & facilities", fil: "Gusali at pasilidad", pinTypes: ["building", "emergency", "facility", "other"], featureTypes: ["building", "facility"] },
  { id: "food", emoji: "🍔", en: "Food", fil: "Pagkain", pinTypes: ["food_stall"], featureTypes: [] },
  { id: "restrooms", emoji: "🚻", en: "Restrooms", fil: "CR", pinTypes: ["restroom"], featureTypes: [] },
  { id: "gates", emoji: "🚪", en: "Gates", fil: "Pasukan", pinTypes: ["entrance", "exit"], featureTypes: [] },
];
// Water and gardens are part of the ground, so they stay as they are under any filter
const ALWAYS_SHOWN_FEATURES = ["water", "landscape"];
// Which filter chip a facility (admin → Facilities) belongs to; the rest are buildings & facilities
const facilityCategory = (f: Facility): CategoryId => (f.type === "restroom" ? "restrooms" : "buildings");

const PIN_KIND: Record<string, { emoji: string; en: string; fil: string }> = {
  animal: { emoji: "🦁", en: "Animal exhibit", fil: "Kulungan ng hayop" },
  building: { emoji: "🏛️", en: "Building", fil: "Gusali" },
  food_stall: { emoji: "🍔", en: "Food", fil: "Pagkain" },
  restroom: { emoji: "🚻", en: "Restroom", fil: "CR" },
  emergency: { emoji: "⛑️", en: "First aid & admin", fil: "First aid at opisina" },
  entrance: { emoji: "🚪", en: "Entrance", fil: "Pasukan" },
  exit: { emoji: "🚪", en: "Exit", fil: "Labasan" },
  facility: { emoji: "ℹ️", en: "Facility", fil: "Pasilidad" },
  other: { emoji: "📍", en: "Visitor location", fil: "Lugar para sa bisita" },
};
const kindOf = (pinType: string) => PIN_KIND[pinType] ?? { emoji: "📍", en: "Place", fil: "Lugar" };

type Resident = { id: number; name: string; image_url?: string | null; scientific_name?: string | null };
type Place = {
  id: number; name: string; lat: number; lng: number; pin_type: string; color?: string | null;
  description?: string | null; animal_name?: string | null; animal_id?: number | null; is_active: boolean;
  residents: Resident[];
};

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo(center, zoom); }, [center, zoom, map]);
  return null;
}

// The visitor's blue dot with a pulsing ring (the ring is decoration; the dot is the position)
const VISITOR_ICON = L.divIcon({
  className: "visitor-dot",
  html: '<div style="position:relative;width:22px;height:22px"><span style="position:absolute;inset:-9px;border-radius:50%;background:rgba(37,99,235,.25);animation:visitor-pulse 1.8s ease-out infinite"></span><span style="position:absolute;inset:0;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"></span></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/** The visitor on the 2D map, with a circle showing how uncertain a GPS fix is. */
function VisitorDot2D({ loc }: { loc: VisitorLocation }) {
  return (
    <>
      {loc.source === "gps" && loc.accuracy != null && (
        <Circle center={[loc.lat, loc.lng]} radius={loc.accuracy} pathOptions={{ color: "#2563eb", weight: 1, fillColor: "#3b82f6", fillOpacity: 0.12 }} interactive={false} />
      )}
      <Marker position={[loc.lat, loc.lng]} icon={VISITOR_ICON} title="You are here" interactive={false} zIndexOffset={1000} />
    </>
  );
}

const DROPPED_ICON = L.divIcon({
  className: "",
  html: '<svg viewBox="0 0 24 32" width="30" height="40" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>',
  iconSize: [30, 40],
  iconAnchor: [15, 40],
});

/** A tap on open ground on the 2D map drops a location pin (when not picking a position). */
function DropPinOnMap2D({ active, onDrop }: { active: boolean; onDrop: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => { if (active) onDrop(e.latlng.lat, e.latlng.lng); } });
  return null;
}

/** The dropped location pin's card: its coordinates, copy, or "I'm here". No links out: this is a zoo guide only. */
function DroppedPinCard({ pin, fil, onClose, onImHere }: { pin: { lat: number; lng: number }; fil: boolean; onClose: () => void; onImHere: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="dialog" aria-label={fil ? "Naka-pin na lokasyon" : "Dropped pin"}
      className="absolute bottom-20 left-1/2 z-[1001] w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl border bg-card/95 p-3 shadow-xl backdrop-blur animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-start gap-2">
        <MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{fil ? "Naka-pin na lokasyon" : "Dropped pin"}</p>
          <p className="font-mono text-sm tabular-nums">{formatCoords(pin.lat, pin.lng)}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-full" onClick={onClose} aria-label={fil ? "Alisin ang pin" : "Remove pin"}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={async () => { setCopied(await copyCoords(pin.lat, pin.lng)); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? (fil ? "Nakopya!" : "Copied!") : (fil ? "Kopyahin" : "Copy")}
        </Button>
        <Button size="sm" className="h-8 rounded-full" onClick={onImHere}>
          <CircleDot className="mr-1 h-3.5 w-3.5" /> {fil ? "Nandito ako" : "I'm here"}
        </Button>
      </div>
    </div>
  );
}

/** While picking, a tap on the 2D map sets the visitor's position. */
function PickOnMap2D({ active, onPick }: { active: boolean; onPick: (lat: number, lng: number) => void }) {
  const map = useMapEvents({ click: e => { if (active) onPick(e.latlng.lat, e.latlng.lng); } });
  useEffect(() => { map.getContainer().style.cursor = active ? "crosshair" : ""; }, [active, map]);
  return null;
}

/** Details of the clicked place, on the right of the map (a bottom sheet on phones). */
function PlaceDetails({ place, fil, onClose, onDirectionsTo, onStartHere }: {
  place: Place; fil: boolean; onClose: () => void; onDirectionsTo: () => void; onStartHere: () => void;
}) {
  const kind = kindOf(place.pin_type);
  return (
    <aside
      aria-label={place.name}
      className="absolute inset-x-2 bottom-2 z-[1001] max-h-[65%] overflow-y-auto rounded-3xl border bg-card/95 p-4 shadow-2xl backdrop-blur animate-in slide-in-from-bottom-4 md:inset-x-auto md:bottom-auto md:right-14 md:top-16 md:max-h-[calc(100%-9rem)] md:w-80 md:slide-in-from-right-4"
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ background: `${pinColor(place)}33` }} aria-hidden="true">
          <PlaceIconView place={place} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight">{place.name}</h2>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{fil ? kind.fil : kind.en}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={onClose} aria-label={fil ? "Isara" : "Close"}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {(place as { image_url?: string | null }).image_url && (
        <img src={photoUrl((place as { image_url?: string }).image_url!, 640)} alt={place.name} loading="lazy" decoding="async"
          className="mb-3 aspect-video w-full rounded-2xl object-cover"
          onError={e => {
            // Small copy failed: try the original photo once, then hide it
            const original = (place as { image_url?: string }).image_url!;
            if (e.currentTarget.src !== original) e.currentTarget.src = original; else e.currentTarget.style.display = "none";
          }} />
      )}
      {place.description && <p className="mb-4 text-sm text-muted-foreground">{place.description}</p>}
      <p className="-mt-2 mb-4 flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground" title={fil ? "Mga coordinate" : "Coordinates"}>
        <MapPinIcon className="h-3.5 w-3.5 shrink-0" /> {formatCoords(place.lat, place.lng)}
      </p>
      <PlaceEvents pinId={place.id} fil={fil} />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button className="rounded-full" onClick={onDirectionsTo}>
          <Flag className="mr-1.5 h-4 w-4" /> {fil ? "Pumunta rito" : "Go here"}
        </Button>
        <Button variant="outline" className="rounded-full" onClick={onStartHere}>
          <CircleDot className="mr-1.5 h-4 w-4" /> {fil ? "Nandito ako" : "I'm here"}
        </Button>
      </div>

      {place.residents.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {fil ? "Mga hayop dito" : "Animals here"}
          </h3>
          <ul className="space-y-2">
            {place.residents.map(r => (
              <li key={r.id}>
                <Link href={`/animals/${r.id}`} className="group flex items-center gap-3 rounded-2xl border bg-background/60 p-2 transition-colors hover:border-primary/40 hover:bg-secondary">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {r.image_url
                      ? <AnimalImage src={r.image_url} alt={r.name} className="h-full w-full object-cover" iconClassName="w-6 h-6" sizes="48px" />
                      : <div className="flex h-full w-full items-center justify-center text-xl">🐾</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.name}</p>
                    {r.scientific_name && <p className="truncate text-xs italic text-muted-foreground">{r.scientific_name}</p>}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

/** Details of a clicked facility (from the admin's Facilities page): type, status, photo, description. */
function FacilityDetails({ facility, fil, onClose, onStartHere }: { facility: Facility; fil: boolean; onClose: () => void; onStartHere: () => void }) {
  const type = facilityType(facility.type), status = facilityStatus(facility.status);
  return (
    <aside
      aria-label={facility.name}
      className="absolute inset-x-2 bottom-2 z-[1001] max-h-[65%] overflow-y-auto rounded-3xl border bg-card/95 p-4 shadow-2xl backdrop-blur animate-in slide-in-from-bottom-4 md:inset-x-auto md:bottom-auto md:right-14 md:top-16 md:max-h-[calc(100%-9rem)] md:w-80 md:slide-in-from-right-4"
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-2xl" aria-hidden="true">{type.emoji}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight">{facility.name}</h2>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{type.label}</p>
          <p className="mt-0.5 text-xs font-semibold" style={{ color: status.color }}>{status.label}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={onClose} aria-label={fil ? "Isara" : "Close"}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {facility.photo_url && (
        <img src={photoUrl(facility.photo_url, 640)} alt={facility.name} loading="lazy" decoding="async"
          className="mb-3 aspect-video w-full rounded-2xl object-cover"
          onError={e => { if (e.currentTarget.src !== facility.photo_url) e.currentTarget.src = facility.photo_url!; else e.currentTarget.style.display = "none"; }} />
      )}
      {facility.description && <p className="mb-4 text-sm text-muted-foreground">{facility.description}</p>}
      <p className="mb-4 flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground">
        <MapPinIcon className="h-3.5 w-3.5 shrink-0" /> {formatCoords(facility.lat, facility.lng)}
      </p>
      <Button variant="outline" className="w-full rounded-full" onClick={onStartHere}>
        <CircleDot className="mr-1.5 h-4 w-4" /> {fil ? "Nandito ako" : "I'm here"}
      </Button>
    </aside>
  );
}

/** Upcoming events an admin linked to this place (Events dataset → "Map place"). */
function PlaceEvents({ pinId, fil }: { pinId: number; fil: boolean }) {
  const { data } = useListEvents();
  const now = Date.now();
  const here = (Array.isArray(data) ? data : [])
    .filter(e => (e as { pin_id?: number | null }).pin_id === pinId && new Date(e.end_date ?? e.start_date ?? 0).getTime() >= now)
    .slice(0, 3);
  if (here.length === 0) return null;
  return (
    <div className="mb-4 rounded-2xl border bg-background/60 p-3">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fil ? "Mga kaganapan dito" : "Events here"}</h3>
      <ul className="space-y-1 text-sm">
        {here.map(e => {
          const cancelled = (e as { status?: string }).status === "cancelled";
          return (
            <li key={e.id} className={cancelled ? "text-muted-foreground line-through" : ""}>
              <span className="font-medium">{e.title}</span>
              {e.start_date && <span className="text-xs text-muted-foreground"> · {new Date(e.start_date).toLocaleString(fil ? "fil-PH" : "en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
              {cancelled && <span className="ml-1 text-xs font-semibold text-destructive no-underline">{fil ? "KANSELADO" : "CANCELLED"}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Pick a place, grouped by kind, for the From/To direction controls. */
function PlacePicker({ id, value, onChange, places, placeholder, fil, meLabel, byAnimal = false }: {
  id: string; value: string; onChange: (v: string) => void; places: Place[]; placeholder: string; fil: boolean;
  /** Adds "My location" (value "me") at the top */
  meLabel?: string;
  /** Also lists every animal by name ("Zebra" → its exhibit), for visitors who don't know exhibit names */
  byAnimal?: boolean;
}) {
  const groups = Object.entries(
    places.reduce<Record<string, Place[]>>((acc, p) => ((acc[p.pin_type] ??= []).push(p), acc), {}),
  );
  // Animal choices carry their exhibit's id ("a:<animal>:<pin>"); choosing one selects the exhibit
  const animalChoices = byAnimal
    ? places.flatMap(p => p.residents.map(r => ({ value: `a:${r.id}:${p.id}`, label: r.name, exhibit: p.name }))).sort((a, b) => a.label.localeCompare(b.label))
    : [];
  return (
    <Select value={value} onValueChange={v => onChange(v.startsWith("a:") ? v.split(":")[2]! : v)}>
      <SelectTrigger id={id} className="h-10 rounded-xl bg-background">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {meLabel && <SelectItem value="me">📍 {meLabel}</SelectItem>}
        {animalChoices.length > 0 && (
          <SelectGroup>
            <SelectLabel>🐾 {fil ? "Mga hayop (ayon sa pangalan)" : "Animals by name"}</SelectLabel>
            {animalChoices.map(a => (
              <SelectItem key={a.value} value={a.value}>{a.label} <span className="text-muted-foreground">· {a.exhibit}</span></SelectItem>
            ))}
          </SelectGroup>
        )}
        {groups.map(([type, list]) => (
          <SelectGroup key={type}>
            <SelectLabel>{kindOf(type).emoji} {fil ? kindOf(type).fil : kindOf(type).en}</SelectLabel>
            {list.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The visitor map. With no props it is the visitor website's /map page. The admin portal's Navigation
 * Demo reuses it with `basePath` (so route links stay on the demo page) and `heightClass` (to fit under
 * the demo controls); there the position comes from a simulated walk (see lib/visitorLocation demo mode).
 */
export default function InteractiveMap({ basePath = "/map", heightClass = "md:h-[calc(100vh-4rem)]" }: { basePath?: string; heightClass?: string; params?: unknown } = {}) {
  const { data: pinsData, isLoading: pinsLoading } = useListMapPins();
  // Published places only: signed-in staff also receive hidden ones (for the admin editor), but the
  // visitor map always shows what visitors see
  const pins = (Array.isArray(pinsData) ? pinsData : []).filter(p => p.is_active !== false);
  const { data: mapConfig, isLoading: configLoading } = useGetMapConfig();
  // Which animals live at each exhibit, from the animal records (animals.location_id)
  const { data: animalsData } = useSearchAnimals({ limit: 500 });
  // 2.5D footprints + walkways; auto-refreshes when an admin changes the layout
  const { data: layout } = useLiveMapLayout();
  // Published footprints only (signed-in staff also receive hidden ones, for the editor)
  const features = useMemo(() => (layout?.features ?? []).filter(f => f.is_active), [layout]);
  const paths = useMemo(() => (layout?.paths ?? []).filter(isPublished), [layout]);
  // Facilities and Park Area trees from the admin dashboard, polled like the 3D map (same queries)
  const { data: facilitiesData } = useFacilities(30_000);
  const { data: zones } = useParkAreas(30_000);
  const facilities = useMemo(() => (facilitiesData ?? []).filter(f => isPublished(f) && isInsideZoo(f)), [facilitiesData]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
  const [showTrees, setShowTrees] = useState(true);
  const [show3D, setShow3D] = useState(true);
  // 3D = tilted MapLibre view; 2D = the Leaflet map (top-down with building heights)
  const [view, setView] = useState<MapView>(savedView);
  const chooseView = (v: MapView) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked; the choice just isn't remembered */ }
  };
  const [showWalkways, setShowWalkways] = useState(true);
  const [selectedPinId, setSelectedPinId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<CategoryId>("all");
  const [selectedLocation, setSelectedLocation] = useState<[number, number] | null>(null);
  // "Reset view": both maps frame the whole zoo again
  const [resetSignal, setResetSignal] = useState(0);
  const [, setLocation] = useLocation();
  const { language } = useAppCtx();
  const fil = language === "fil";
  const searchParams = new URLSearchParams(useSearch());
  const urlAnimalId = searchParams.get("animal");
  // A place to focus (/map?place=<pinId>), from ZooBot's "Show on map"
  const urlPlaceId = searchParams.get("place");

  // Walking route: /map?from=<pinId|me>&to=<pinId>[&accessible=1], from the chatbot, the direction
  // controls or "find nearest". "me" is the visitor's own position and follows them as they walk.
  const fromIsMe = searchParams.get("from") === "me";
  const routeFrom = Number(searchParams.get("from"));
  const routeTo = Number(searchParams.get("to"));
  const accessible = searchParams.get("accessible") === "1";
  const hasRoute = (fromIsMe || routeFrom > 0) && routeTo > 0;
  const routeParams = { from: routeFrom, to: routeTo, accessible, lang: language };
  const { data: pinRoute, isFetching: pinRouteLoading } = useGetMapRoute(routeParams, {
    query: { enabled: hasRoute && !fromIsMe, queryKey: getGetMapRouteQueryKey(routeParams) },
  });

  // Where the visitor is: GPS, a spot they picked, or a scanned QR code. Never assumed.
  const here = useVisitorLocation();
  const hereInside = here ? isInsideZoo(here) : false;
  const [tracking, setTracking] = useState(false);
  const gps = useGpsTracking(tracking);
  const [picking, setPicking] = useState(false);
  // A location pin the visitor dropped by tapping open ground, with its coordinates
  const [droppedPin, setDroppedPin] = useState<{ lat: number; lng: number } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [needLocation, setNeedLocation] = useState(false);
  const [nearestKind, setNearestKind] = useState<NearestKind | null>(null);
  const [pendingNearest, setPendingNearest] = useState(false);
  const centerOnNextFix = React.useRef(false);
  // On phones the map sits above the panels, so starting to pick a spot brings it back on screen
  const mapAreaRef = React.useRef<HTMLDivElement>(null);
  const startPicking = () => {
    const next = !picking;
    setPicking(next);
    setDetailsOpen(false);
    setDroppedPin(null);
    if (next) mapAreaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const { toast } = useToast();
  const meRoute = useRouteFromHere(here, routeTo, { accessible, lang: language, enabled: hasRoute && fromIsMe && hereInside });
  const route = fromIsMe ? (hereInside ? meRoute.data : undefined) : pinRoute;
  const routeLoading = fromIsMe ? meRoute.isFetching : pinRouteLoading;

  const animals = Array.isArray(animalsData) ? animalsData : [];
  const places: Place[] = useMemo(() => {
    const residentsByPin = new Map<number, Resident[]>();
    for (const a of animals) {
      if (a.location_id == null) continue;
      residentsByPin.set(a.location_id, [...(residentsByPin.get(a.location_id) ?? []), a]);
    }
    // Only places inside the zoo are shown, searchable or routable. Always the admin's own places:
    // no built-in stand-ins (offline, the saved copy of this same list is used)
    return pins
      .filter(p => p.is_active && isInsideZoo(p))
      .map(p => ({ ...p, residents: residentsByPin.get(p.id) ?? [] })) as Place[];
  }, [pins, animals]);

  // Direction controls start from the visitor's own position when it's known; otherwise "From" stays
  // empty and asks, instead of quietly assuming the visitor is at the entrance
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [wantAccessible, setWantAccessible] = useState(accessible);
  useEffect(() => {
    if (hasRoute) { setFromId(fromIsMe ? "me" : String(routeFrom)); setToId(String(routeTo)); return; }
    if (!fromId && here) setFromId("me");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRoute, fromIsMe, routeFrom, routeTo, !!here]);

  const showRoute = (from = fromId, to = toId) => {
    if (!from || !to || from === to) return;
    if (from === "me" && !here) { setNeedLocation(true); return; }
    setDetailsOpen(false);
    setLocation(`${basePath}?from=${from}&to=${to}${wantAccessible ? "&accessible=1" : ""}`);
  };
  const clearRoute = () => { setLocation(basePath); setNearestKind(null); };

  // ─── Location actions ───
  const stopTracking = () => setTracking(false);
  const myLocation = () => {
    setNeedLocation(false);
    if (here) setSelectedLocation([here.lat, here.lng]);
    centerOnNextFix.current = true;
    setTracking(true);
  };
  // A tap, a pin or a QR scan is deliberate, so it replaces GPS (which would otherwise overwrite it).
  // Only spots inside the zoo can be chosen.
  const setManual = (lat: number, lng: number, label?: string) => {
    if (!isInsideZoo({ lat, lng })) {
      toast({ title: fil ? "Pumili sa loob ng zoo" : "Choose a spot inside the zoo", description: fil ? "Sa loob lang ng Manila Zoo gumagana ang gabay." : "The navigation guide only works inside Manila Zoo." });
      return;
    }
    setTracking(false);
    setVisitorLocation({ lat, lng, source: "manual", label });
    setPicking(false);
    setNeedLocation(false);
    setFromId("me");
  };
  // If the visitor already allowed location for this site, follow their GPS straight away (no
  // prompt); a spot they tapped or a QR they scanned is kept instead, since it's more precise
  useEffect(() => {
    if (here && here.source !== "gps") return;
    navigator.permissions?.query({ name: "geolocation" as PermissionName })
      .then(status => { if (status.state === "granted") setTracking(true); })
      .catch(() => { /* Permissions API unsupported (older Safari): wait for "My location" */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Following a route from "my location" with GPS keeps GPS on, so the dot and route update as they walk
  useEffect(() => {
    if (hasRoute && fromIsMe && here?.source === "gps" && !tracking) setTracking(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRoute, fromIsMe, here?.source]);

  useEffect(() => {
    if (!here) return;
    setNeedLocation(false);
    if (centerOnNextFix.current && here.source === "gps") {
      centerOnNextFix.current = false;
      setSelectedLocation([here.lat, here.lng]);
    }
  }, [here]);

  const nearest = useNearest(here, nearestKind, { accessible: wantAccessible, lang: language });
  // Metres outside the zoo, when GPS (or the server) says the visitor isn't inside it
  const outsideBy = gps.outsideBy ?? outsideZooMetres(nearest.error) ?? outsideZooMetres(meRoute.error);

  // Leaving the zoo mid-route pauses the walking guide (no route, no footsteps outside the fence) but
  // keeps the destination, so it starts again by itself once GPS puts the visitor back inside
  const wasOutsideOnRoute = React.useRef(false);
  useEffect(() => {
    const navigating = hasRoute && fromIsMe;
    if (gps.outsideBy != null && navigating) {
      wasOutsideOnRoute.current = true;
      toast({ title: fil ? "Nasa labas ng Manila Zoo" : "Outside Manila Zoo", description: WALKING_GUIDE_OUTSIDE_TEXT[fil ? "fil" : "en"], variant: "destructive" });
    } else if (gps.outsideBy == null && navigating && wasOutsideOnRoute.current && here?.source === "gps") {
      wasOutsideOnRoute.current = false;
      toast({ title: fil ? "Nasa loob ka na ng Manila Zoo" : "You're inside Manila Zoo", description: fil ? "Itinuloy ang gabay sa paglalakad." : "The walking guide has resumed." });
    }
    if (!navigating) wasOutsideOnRoute.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps.outsideBy != null, hasRoute, fromIsMe, here?.source]);

  const findNearest = (kind: NearestKind) => {
    setNearestKind(kind);
    setCategory("all"); // the results must be visible on the map
    // Without a position, ask for one; the search then finishes as soon as one arrives
    setPendingNearest(true);
    if (!here) setNeedLocation(true);
  };
  // Once the ranking arrives, route to the nearest one
  useEffect(() => {
    const first = nearest.data?.results[0];
    if (!pendingNearest || !first || nearest.isPlaceholderData) return;
    setPendingNearest(false);
    chooseNearest(first.pin_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNearest, nearest.data, nearest.isPlaceholderData]);
  const chooseNearest = (pinId: number) => {
    setSelectedPinId(pinId);
    setDetailsOpen(false);
    setToId(String(pinId));
    setFromId("me");
    setLocation(`${basePath}?from=me&to=${pinId}${wantAccessible ? "&accessible=1" : ""}`);
  };

  useEffect(() => {
    if (urlAnimalId && places.length > 0) {
      const id = Number(urlAnimalId);
      const home = animals.find(a => a.id === id)?.location_id;
      const pin = places.find(p => p.id === home) ?? places.find(p => p.animal_id === id);
      if (pin) selectPlace(pin.id, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlAnimalId, places.length]);

  useEffect(() => {
    if (urlPlaceId && places.some(p => p.id === Number(urlPlaceId))) selectPlace(Number(urlPlaceId), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPlaceId, places.length]);

  const selectPlace = (id: number, fly = false) => {
    if (picking) {
      const p = places.find(pl => pl.id === id);
      if (p) setManual(p.lat, p.lng, p.name);
      return;
    }
    setSelectedFacilityId(null);
    setSelectedPinId(id);
    setDetailsOpen(true);
    const p = places.find(pl => pl.id === id);
    if (fly && p) setSelectedLocation([p.lat, p.lng]);
  };
  const selectFacility = (f: Facility, fly = false) => {
    if (picking) { setManual(f.lat, f.lng, f.name); return; }
    setDetailsOpen(false);
    setSelectedPinId(null);
    setSelectedFacilityId(f.id);
    if (fly) setSelectedLocation([f.lat, f.lng]);
  };

  const cat = CATEGORIES.find(c => c.id === category)!;
  const inCategory = (p: Place) => category === "all" || cat.pinTypes.includes(p.pin_type);
  const q = searchQuery.toLowerCase();
  // Searching "lion" finds the exhibit the lion lives in
  const filteredPins = places.filter(p => inCategory(p) && (!q ||
    p.name.toLowerCase().includes(q) ||
    p.animal_name?.toLowerCase().includes(q) ||
    p.residents.some(r => r.name.toLowerCase().includes(q))));
  // Facilities follow the same filter chips and search ("restroom", "fountain", "medical"…)
  const filteredFacilities = facilities.filter(f => (category === "all" || facilityCategory(f) === category) && (!q ||
    f.name.toLowerCase().includes(q) ||
    facilityType(f.type).label.toLowerCase().includes(q) ||
    f.description?.toLowerCase().includes(q)));
  // Always a list (never "all"): the 3D view loads facilities itself, and drafts must stay off this map
  const facilityIds3D = filteredFacilities.map(f => f.id);

  // Footprints that stay standing under the current filter (null = all)
  const keepFeatureIds = useMemo(() => {
    if (category === "all" || !layout) return null;
    const pinIds = new Set(places.filter(inCategory).map(p => p.id));
    return features
      .filter(f => (f.map_pin_id != null && pinIds.has(f.map_pin_id)) || cat.featureTypes.includes(f.feature_type) || ALWAYS_SHOWN_FEATURES.includes(f.feature_type))
      .map(f => f.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, features, places]);
  const features2D: MapFeature[] = features.filter(f => !keepFeatureIds || keepFeatureIds.includes(f.id));

  const selectedFacility = facilities.find(f => f.id === selectedFacilityId);
  const selectedPlace = places.find(p => p.id === selectedPinId);
  const destination = hasRoute ? places.find(p => p.id === routeTo) : undefined;

  // ─── Live walking footsteps ───
  // Shown while navigating from the visitor's own GPS position, inside the zoo, along a route on the
  // walkways, until they arrive. Turning GPS off or losing its signal pauses them (and the card says
  // why); outside the zoo there's no route, so there are none.
  const liveGpsNav = hasRoute && fromIsMe && !!here && hereInside && here.source === "gps" && !!destination;
  const arrivedThere = liveGpsNav && here && destination ? hasArrived(here, { lat: Number(destination.lat), lng: Number(destination.lng) }) : false;
  const footstepsPaused: FootstepsPause = !liveGpsNav || arrivedThere ? null : !tracking ? "gps_off" : gps.error ? "gps_lost" : null;
  const footstepsOn = liveGpsNav && !arrivedThere && !footstepsPaused && !!route?.on_paths;
  const footstepPoints = useMemo(
    () => (footstepsOn && route ? route.coordinates.map(([lat, lng]) => [lat!, lng!] as [number, number]) : null),
    [footstepsOn, route],
  );

  if (pinsLoading || configLoading) {
    return (
      <div className="flex h-[calc(100svh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Both views open framing the whole zoo (ZOO_VIEW_BOX), slightly up and right of the fence's middle
  const defaultCenter: [number, number] = ZOO_VIEW_CENTER;
  const defaultZoom = Math.max(MIN_ZOOM_2D, mapConfig?.default_zoom || 18);

  return (
    <div className={`flex flex-col md:flex-row ${heightClass}`}>
      {/* Sidebar: directions, search and places */}
      <div className="order-2 md:order-1 w-full md:w-96 border-t md:border-t-0 md:border-r bg-card/90 backdrop-blur shadow-lg z-10 flex flex-col">
        <div className="md:flex-1 md:overflow-y-auto p-4 space-y-5">
          <LocationPanel
            fil={fil}
            loc={here}
            tracking={tracking}
            gpsWaiting={gps.waiting}
            gpsError={gps.error}
            onMyLocation={myLocation}
            onStopTracking={stopTracking}
            picking={picking}
            onPick={startPicking}
            onScan={() => setScanOpen(true)}
            onClearLocation={() => { setTracking(false); setVisitorLocation(null); if (fromId === "me") setFromId(""); }}
            needLocation={needLocation}
            nearestKind={nearestKind}
            onFindNearest={findNearest}
            nearest={nearest.data}
            nearestLoading={nearest.isFetching}
            outsideBy={outsideBy}
            selectedPinId={fromIsMe ? routeTo : null}
            onChooseNearest={chooseNearest}
          />

          {/* From → To */}
          <section aria-labelledby="dir-heading" className="rounded-3xl border bg-secondary/50 p-4">
            <h2 id="dir-heading" className="mb-3 flex items-center text-base font-bold">
              <Navigation className="mr-2 h-4 w-4 text-primary" /> {fil ? "Paano pumunta" : "Get directions"}
            </h2>
            <div className="flex gap-2">
              <div className="flex-1 space-y-2">
                <div>
                  <Label htmlFor="dir-from" className="mb-1 flex items-center text-xs text-muted-foreground">
                    <CircleDot className="mr-1 h-3 w-3 text-blue-500" /> {fil ? "Mula sa" : "From"}
                  </Label>
                  <PlacePicker id="dir-from" value={fromId} onChange={setFromId} places={places} fil={fil} placeholder={fil ? "Saan ka ngayon?" : "Where are you?"} meLabel={fil ? "Aking lokasyon" : "My location"} />
                </div>
                <div>
                  <Label htmlFor="dir-to" className="mb-1 flex items-center text-xs text-muted-foreground">
                    <Flag className="mr-1 h-3 w-3 text-red-500" /> {fil ? "Papunta sa" : "To"}
                  </Label>
                  <PlacePicker id="dir-to" value={toId} onChange={setToId} places={places} fil={fil} placeholder={fil ? "Saan pupunta? (hal. Zebra)" : "Where to? (e.g. Zebra)"} byAnimal />
                </div>
              </div>
              <Button
                variant="ghost" size="icon" className="mt-6 self-center rounded-full"
                onClick={() => { setFromId(toId); setToId(fromId); }}
                aria-label={fil ? "Pagpalitin" : "Swap from and to"}
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Label htmlFor="dir-accessible" className="flex cursor-pointer items-center text-sm">
                <Accessibility className="mr-1.5 h-4 w-4" /> {fil ? "Pang-wheelchair" : "Wheelchair-friendly"}
              </Label>
              <Switch id="dir-accessible" checked={wantAccessible} onCheckedChange={setWantAccessible} />
            </div>
            <Button className="mt-3 w-full rounded-full" disabled={!fromId || !toId || fromId === toId} onClick={() => showRoute()}>
              <Footprints className="mr-2 h-4 w-4" /> {fil ? "Ipakita ang ruta" : "Show route"}
            </Button>

            {hasRoute && (
              <div className="mt-4 rounded-2xl border bg-card p-3">
                {fromIsMe && (outsideBy != null || (here && !hereInside)) ? (
                  <p className="text-sm">{WALKING_GUIDE_OUTSIDE_TEXT[fil ? "fil" : "en"]}</p>
                ) : fromIsMe && !here ? (
                  <p className="text-sm">{fil ? "Hindi namin alam kung nasaan ka. Gamitin ang GPS, pumili sa mapa, o mag-scan ng QR code sa itaas." : "We don't know where you are. Use GPS, select your location on the map, or scan a QR code above."}</p>
                ) : routeLoading && !route ? (
                  <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                ) : route && (
                  <>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">{route.from_name} → {route.to_name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {fil ? `mga ${route.distance_m} m · ${route.walk_minutes} minutong lakad` : `about ${route.distance_m} m · ${route.walk_minutes} min walk`}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-full" onClick={clearRoute} aria-label={fil ? "Alisin ang ruta" : "Clear route"}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <ol className="space-y-1.5 text-sm">
                      {route.steps.map((step, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            )}
          </section>

          {/* Search and list */}
          <section aria-labelledby="places-heading">
            <h2 id="places-heading" className="sr-only">{fil ? "Mga lugar" : "Places"}</h2>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={fil ? "Maghanap ng lugar o hayop..." : "Search places or animals..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-full pl-9"
              />
            </div>
            <div className="space-y-1">
              {filteredPins.slice(0, 12).map(pin => (
                <button
                  key={pin.id}
                  type="button"
                  onClick={() => selectPlace(pin.id, true)}
                  className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${selectedPinId === pin.id ? "bg-secondary" : "hover:bg-muted"}`}
                >
                  <PlaceIconView place={pin} className="mt-0.5" />
                  <div>
                    <div className="font-medium">{pin.name}</div>
                    {pin.residents.length > 0 && <div className="text-xs text-muted-foreground">{pin.residents.map(r => r.name).join(", ")}</div>}
                  </div>
                </button>
              ))}
              {filteredPins.length > 12 && (
                <p className="pt-1 text-center text-xs text-muted-foreground">
                  {fil ? `+${filteredPins.length - 12} pa` : `+${filteredPins.length - 12} more`}
                </p>
              )}
              {filteredPins.length === 0 && filteredFacilities.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">{fil ? "Walang nahanap" : "No places found"}</p>
              )}
            </div>
            {filteredFacilities.length > 0 && (
              <div className="mt-3 space-y-1">
                <h3 className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fil ? "Mga pasilidad" : "Facilities"}</h3>
                {filteredFacilities.slice(0, q ? 12 : 6).map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => selectFacility(f, true)}
                    className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${selectedFacilityId === f.id ? "bg-secondary" : "hover:bg-muted"}`}
                  >
                    <span aria-hidden="true" className="mt-0.5">{facilityType(f.type).emoji}</span>
                    <div>
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs" style={{ color: facilityStatus(f.status).color }}>{facilityType(f.type).label} · {facilityStatus(f.status).label}</div>
                    </div>
                  </button>
                ))}
                {filteredFacilities.length > (q ? 12 : 6) && (
                  <p className="pt-1 text-center text-xs text-muted-foreground">
                    {fil ? `+${filteredFacilities.length - (q ? 12 : 6)} pa (maghanap para makita)` : `+${filteredFacilities.length - (q ? 12 : 6)} more (search to find them)`}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="layer-walkways" className="flex cursor-pointer items-center text-sm">
                <span className="mr-2 h-1.5 w-4 rounded-full bg-amber-300" /> {fil ? "Mga daanan" : "Walkways"}
              </Label>
              <Switch id="layer-walkways" checked={showWalkways} onCheckedChange={setShowWalkways} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="layer-3d" className="flex cursor-pointer items-center text-sm">
                <span className="mr-2 h-3 w-3 rounded-sm bg-sky-300" /> {fil ? "Mga gusali" : "Buildings"}
              </Label>
              <Switch id="layer-3d" checked={show3D} onCheckedChange={setShow3D} />
            </div>
            {/* Tree layer switch for the 2D map (the visitor map has no Tree legend in either view) */}
            {view === "2d" && (
              <div className="flex items-center justify-between">
                <Label htmlFor="layer-trees" className="flex cursor-pointer items-center text-sm">
                  <span className="mr-2 h-3 w-3 rounded-full bg-green-600" /> {fil ? "Mga puno" : "Trees"}
                </Label>
                <Switch id="layer-trees" checked={showTrees} onCheckedChange={setShowTrees} />
              </div>
            )}
          </section>
        </div>

        {/* Bottom padding grows on iPhones with a home bar (env() is 0 elsewhere) */}
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t space-y-2">
          <SaveOfflineButton />
          <Button
            variant="outline"
            className="w-full rounded-full"
            onClick={() => { setSelectedLocation(null); setResetSignal(n => n + 1); setSelectedPinId(null); setSelectedFacilityId(null); setDetailsOpen(false); }}
          >
            <MapPinIcon className="w-4 h-4 mr-2" /> {fil ? "I-reset ang tanaw" : "Reset view"}
          </Button>
        </div>
      </div>

      {/* Map area */}
      <div ref={mapAreaRef} className="map-area-phone order-1 md:order-2 md:h-auto flex-none md:flex-1 relative z-0 scroll-mt-16">
        {/* View toggle + filter chips */}
        <div className="absolute left-3 right-3 top-3 z-[1000] flex items-center gap-2 md:right-14">
          <BackButton className="ml-0 h-8 rounded-full border bg-card px-3 text-foreground shadow-md hover:bg-muted" />
          <div role="group" aria-label={fil ? "Uri ng mapa" : "Map view"} className="inline-flex shrink-0 rounded-full border bg-card p-0.5 shadow-md">
            {(can3D ? (["2d", "3d"] as const) : (["2d"] as const)).map(v => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => chooseView(v)}
                className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
          <div role="group" aria-label={fil ? "Ipakita lamang" : "Show only"} className="flex gap-1.5 overflow-x-auto py-1">
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium shadow-md transition-colors ${
                  category === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-secondary"
                }`}
              >
                <span aria-hidden="true">{c.emoji}</span> {fil ? c.fil : c.en}
              </button>
            ))}
          </div>
        </div>

        {outsideBy != null && !picking && (
          <div role="alert" className="absolute left-1/2 top-16 z-[1001] w-[min(26rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 shadow-lg dark:bg-amber-950 dark:text-amber-100">
            ⚠️ {(hasRoute && fromIsMe ? WALKING_GUIDE_OUTSIDE_TEXT : OUTSIDE_ZOO_TEXT)[fil ? "fil" : "en"]}
          </div>
        )}
        {picking && (
          <div role="status" className="absolute left-1/2 top-16 z-[1001] flex -translate-x-1/2 items-center gap-3 rounded-full border bg-card px-4 py-2 text-sm font-medium shadow-lg">
            👆 {fil ? "I-tap kung nasaan ka sa mapa" : "Tap where you are on the map"}
            <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => setPicking(false)}>{fil ? "Kanselahin" : "Cancel"}</Button>
          </div>
        )}
        <Button
          size="icon"
          variant={tracking ? "default" : "secondary"}
          className="absolute bottom-4 left-3 z-[1000] h-12 w-12 rounded-full border shadow-lg"
          onClick={myLocation}
          aria-label={fil ? "Aking lokasyon" : "My location"}
          title={fil ? "Aking lokasyon" : "My location"}
        >
          {gps.waiting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />}
        </Button>

        {view === "3d" ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <Zoo3DView
              center={defaultCenter}
              zoom={defaultZoom}
              fitZoo
              resetSignal={resetSignal}
              features={features}
              paths={paths}
              facilityIds={facilityIds3D}
              pins={filteredPins}
              route={hasRoute ? route : null}
              showBuildings={show3D}
              showWalkways={showWalkways}
              selectedPinId={selectedPinId}
              flyTo={selectedLocation}
              describe={f => places.find(p => p.id === f.map_pin_id)?.description}
              keepFeatureIds={keepFeatureIds}
              onSelectPin={id => selectPlace(id)}
              visitor={here}
              footsteps={footstepPoints}
              picking={picking}
              onPick={(lat, lng) => setManual(lat, lng)}
              onUnsupported={() => setView("2d")}
              onMapTap={(lat, lng) => { if (isInsideZoo({ lat, lng })) setDroppedPin({ lat, lng }); }}
              droppedPin={droppedPin}
            />
          </Suspense>
        ) : (
          <MapContainer
            bounds={ZOO_VIEW_BOX} boundsOptions={{ padding: VIEW_PADDING }} zoomSnap={0.25}
            minZoom={MIN_ZOOM_2D} maxZoom={21}
            maxBounds={MAP_BOUNDS} maxBoundsViscosity={1}
            style={{ height: "100%", width: "100%" }} zoomControl={false}
            // One finger pans and pinch zooms on every device; on phones the page scrolls from
            // outside the map (it is 65% of the screen)
            dragging touchZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxNativeZoom={19}
              maxZoom={21}
              bounds={MAP_BOUNDS}
            />
            <ZooZoomLimit2D />
            {/* Everything outside the zoo is greyed out; only the zoo grounds are part of this map */}
            <Polygon positions={[WORLD_RING, ZOO_RING]} interactive={false} pathOptions={{ stroke: false, fillColor: "#e5e7eb", fillOpacity: 0.92 }} />
            <Polygon positions={ZOO_RING} interactive={false} pathOptions={{ color: "#15803d", weight: 2.5, fill: false }} />
            <FloorPlanOverlay config={mapConfig} />
            {/* The lagoon, gardens and flat yards lie under the walkways, as in 3D */}
            {show3D && <FlatFeatures features={features2D} />}
            {showWalkways && layout && <Walkways paths={paths} />}
            {show3D && layout && (
              <ExtrudedFeatures
                features={features2D}
                highlightId={features.find(f => f.map_pin_id != null && f.map_pin_id === selectedPinId)?.id ?? null}
                describe={f => places.find(p => p.id === f.map_pin_id)?.description}
              />
            )}
            {showTrees && zones && <ParkTrees2D zones={zones} />}
            <ParkFacilities2D facilities={filteredFacilities} selectedId={selectedFacilityId} onSelect={f => selectFacility(f)} />
            {selectedLocation && <MapUpdater center={selectedLocation} zoom={19} />}
            <FitZoo2D signal={resetSignal} />
            {hasRoute && route && <RouteLine route={route} fromVisitor={fromIsMe} />}
            <Footsteps2D points={footstepPoints} />
            {here && <VisitorDot2D loc={here} />}
            <PickOnMap2D active={picking} onPick={(lat, lng) => setManual(lat, lng)} />
            <DropPinOnMap2D active={!picking} onDrop={(lat, lng) => { if (isInsideZoo({ lat, lng })) setDroppedPin({ lat, lng }); }} />
            {droppedPin && <Marker position={[droppedPin.lat, droppedPin.lng]} icon={DROPPED_ICON} interactive={false} zIndexOffset={900} />}
            {filteredPins.map(pin => (
              <Marker
                // Leaflet sets the title once, so a renamed place gets a fresh marker
                key={`${pin.id}:${pin.name}`}
                position={[pin.lat, pin.lng]}
                title={pin.name}
                eventHandlers={{ click: () => selectPlace(pin.id) }}
                icon={L.divIcon({
                  className: "custom-pin",
                  // White badge with the place's icon, ringed in its category color
                  html: `<div style="display:flex;align-items:center;justify-content:center;background:#fff;width:34px;height:34px;border-radius:50%;border:3px solid ${pinColor(pin)};box-shadow:0 3px 8px rgba(0,0,0,.3);${selectedPinId === pin.id ? "outline:3px solid #facc15;" : ""}">${placeIconHtml(pin, 17)}</div>`,
                  iconSize: [34, 34],
                  iconAnchor: [17, 17],
                })}
              />
            ))}
          </MapContainer>
        )}

        {/* Live walking guide: route from the visitor's own position to a chosen place */}
        {hasRoute && fromIsMe && here && hereInside && destination && !detailsOpen && (
          <NavigationCard
            fil={fil}
            route={route}
            loading={routeLoading}
            here={here}
            destination={{
              name: destination.name,
              emoji: kindOf(destination.pin_type).emoji,
              lat: Number(destination.lat),
              lng: Number(destination.lng),
              animals: destination.residents.map(r => r.name),
            }}
            onStop={clearRoute}
            footstepsPaused={footstepsPaused}
          />
        )}

        {droppedPin && !picking && (
          <DroppedPinCard pin={droppedPin} fil={fil} onClose={() => setDroppedPin(null)}
            onImHere={() => { setManual(droppedPin.lat, droppedPin.lng); setDroppedPin(null); }} />
        )}

        {selectedFacility && !detailsOpen && (
          <FacilityDetails
            facility={selectedFacility}
            fil={fil}
            onClose={() => setSelectedFacilityId(null)}
            onStartHere={() => { setManual(selectedFacility.lat, selectedFacility.lng, selectedFacility.name); setSelectedFacilityId(null); }}
          />
        )}

        {detailsOpen && selectedPlace && (
          <PlaceDetails
            place={selectedPlace}
            fil={fil}
            onClose={() => { setDetailsOpen(false); setSelectedPinId(null); }}
            onDirectionsTo={() => {
              const to = String(selectedPlace.id);
              const from = fromId || (here ? "me" : "");
              setToId(to);
              if (!from) { setNeedLocation(true); return; } // ask where they are rather than guess
              if (from !== to) showRoute(from, to);
            }}
            onStartHere={() => { setManual(selectedPlace.lat, selectedPlace.lng, selectedPlace.name); setDetailsOpen(false); }}
          />
        )}

        <Dialog open={scanOpen} onOpenChange={setScanOpen}>
          <DialogContent className="max-w-md rounded-3xl">
            <DialogHeader>
              <DialogTitle>{fil ? "I-scan ang QR sa malapit" : "Scan a nearby QR code"}</DialogTitle>
              <DialogDescription>
                {fil ? "Ang QR sign sa kulungan o pasilidad ay nagsasabi kung saan ka eksakto." : "The QR sign at an exhibit or facility tells the map exactly where you're standing."}
              </DialogDescription>
            </DialogHeader>
            <QrScannerPanel mode="location" onDone={() => { setScanOpen(false); setTracking(false); setFromId("me"); }} />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
