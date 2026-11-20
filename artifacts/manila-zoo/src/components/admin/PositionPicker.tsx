import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polygon, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2 } from "lucide-react";
import { useListMapPins } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ZOO_BOUNDARY, ZOO_CENTER, isInsideZoo } from "@/lib/zooBoundary";
import { useLiveMapLayout, isPublished } from "@/components/map/ZooMapLayers";

const Zoo3DView = lazy(() => import("@/components/map/Zoo3DView"));

const pickIcon = (color: string) => L.divIcon({
  className: "",
  html: `<svg viewBox="0 0 24 32" width="26" height="34" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>`,
  iconSize: [26, 34], iconAnchor: [13, 34],
});

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  const map = useMap();
  const cb = useRef(onPick);
  cb.current = onPick;
  useEffect(() => {
    map.getContainer().style.cursor = "crosshair";
    const handler = (e: L.LeafletMouseEvent) => cb.current(e.latlng.lat, e.latlng.lng);
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [map]);
  return null;
}

/** Re-centres the map when the dialog opens on an existing position */
function Recenter({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || lat == null || lng == null) return;
    done.current = true;
    map.setView([lat, lng], Math.max(map.getZoom(), 18), { animate: false });
  }, [map, lat, lng]);
  return null;
}

/**
 * The 3D map (same as the visitor's, with the trees and facilities already placed) in pick mode:
 * a click sets the position, shown as a red pin.
 */
function Pick3D({ lat, lng, onPick, onUnsupported }: {
  lat: number | null; lng: number | null; onPick: (lat: number, lng: number) => void; onUnsupported: () => void;
}) {
  const { data: layout } = useLiveMapLayout();
  const { data: pinsData } = useListMapPins();
  const features = useMemo(() => (layout?.features ?? []).filter(f => f.is_active), [layout]);
  const paths = useMemo(() => (layout?.paths ?? []).filter(isPublished), [layout]);
  const pins = useMemo(() => (pinsData ?? []).filter(p => p.is_active).map(p => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) })), [pinsData]);
  const has = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  // Open on the existing spot, then leave the camera where the admin puts it
  const [start] = useState<[number, number] | null>(() => (has ? [lat!, lng!] : null));
  return (
    <Zoo3DView
      treeLegend
      center={start ?? ZOO_CENTER}
      zoom={start ? 19 : 17.5}
      fitZoo={!start}
      features={features}
      paths={paths}
      pins={pins}
      route={null}
      showBuildings
      showWalkways
      selectedPinId={null}
      flyTo={start}
      keepFeatureIds={null}
      onSelectPin={() => {}}
      visitor={null}
      picking
      onPick={onPick}
      onUnsupported={onUnsupported}
      droppedPin={has ? { lat: lat!, lng: lng! } : null}
    />
  );
}

/**
 * Map position for a facility or tree: click the 3D or 2D map (or drag the 2D pin) to set it, or
 * type the coordinates. The zoo fence is outlined; the server only accepts positions inside it.
 */
export function PositionPicker({ lat, lng, onChange, color = "#2D6A4F", idPrefix }: {
  lat: number | null; lng: number | null; onChange: (lat: number | null, lng: number | null) => void;
  color?: string; idPrefix: string;
}) {
  const [view, setView] = useState<"3d" | "2d">("3d");
  const [outside, setOutside] = useState(false);
  const icon = useMemo(() => pickIcon(color), [color]);
  const fence = useMemo(() => ZOO_BOUNDARY.map(([x, y]) => [y, x] as [number, number]), []);
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const pick = (a: number, b: number) => {
    if (!isInsideZoo({ lat: a, lng: b })) { setOutside(true); return; }
    setOutside(false);
    onChange(a, b);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Map position</Label>
        <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label="Map view">
          {(["3d", "2d"] as const).map(v => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
              className={`rounded px-2.5 py-1 font-medium ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {view === "3d"
          ? "Click the 3D map where it goes; the red pin marks the spot. Drag to pan, right-drag to tilt, scroll to zoom."
          : "Click the map to place it, or drag the pin."} It must be inside the zoo.
      </p>
      {outside && <p role="alert" className="text-xs font-medium text-destructive">That spot is outside the zoo. Pick a spot inside the fence.</p>}
      {view === "3d" ? (
        <div className="relative h-[420px] overflow-hidden rounded-md border">
          <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <Pick3D lat={lat} lng={lng} onPick={pick} onUnsupported={() => setView("2d")} />
          </Suspense>
        </div>
      ) : (
        <div className="relative z-0 h-56 overflow-hidden rounded-md border">
          {/* No zoom/fade animations: the dialog can close mid-animation, which makes Leaflet throw */}
          <MapContainer center={lat != null && lng != null ? [lat, lng] : ZOO_CENTER} zoom={17} maxZoom={21} zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxNativeZoom={19} maxZoom={21}
            />
            <Polygon positions={fence} pathOptions={{ color: "#2D6A4F", weight: 2, fill: false, dashArray: "4 4" }} />
            {lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && (
              <Marker position={[lat, lng]} icon={icon} draggable
                eventHandlers={{ dragend: e => { const p = (e.target as L.Marker).getLatLng(); onChange(p.lat, p.lng); } }} />
            )}
            <ClickToPlace onPick={(a, b) => onChange(a, b)} />
            <Recenter lat={lat} lng={lng} />
          </MapContainer>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={`${idPrefix}-lat`} className="text-xs">Latitude</Label>
          <Input id={`${idPrefix}-lat`} inputMode="decimal" value={lat ?? ""} onChange={e => onChange(num(e.target.value), lng)} placeholder="14.5648" />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-lng`} className="text-xs">Longitude</Label>
          <Input id={`${idPrefix}-lng`} inputMode="decimal" value={lng ?? ""} onChange={e => onChange(lat, num(e.target.value))} placeholder="120.9885" />
        </div>
      </div>
    </div>
  );
}
