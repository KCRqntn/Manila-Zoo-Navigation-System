import { useEffect, useMemo, useRef } from "react";
import { useMap, Polyline, Polygon, ImageOverlay, Tooltip, CircleMarker, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMapLayout,
  useGetMapVersion,
  getGetMapLayoutQueryKey,
  getGetMapVersionQueryKey,
  getListMapPinsQueryKey,
  getGetMapConfigQueryKey,
  getSearchAnimalsQueryKey,
  type MapFeature,
  type MapPath,
  type MapConfig,
  type MapRoute,
} from "@workspace/api-client-react";
import { ExtrusionLayer, type ExtrusionFeature } from "@/lib/extrusionLayer";
import { startFootstepTrail, styleFootprint, leafletMetresPerPixel, FOOTPRINT_SVG } from "@/lib/footsteps";
import { BRIDGE_NAME } from "@/lib/architecturalPlan";
import { facilityStatus, facilityType, treeStatus, FACILITIES_KEY, PARK_AREAS_KEY, type Facility, type ParkZone } from "@/lib/parkAreas";

/** A walkway drawn as a timber footbridge: marked as a bridge in Map Management (or the original lagoon bridge). */
export const isBridgePath = (p: MapPath) => (p as { kind?: string }).kind === "bridge" || p.name === BRIDGE_NAME;
/** Published (drafts are only sent to staff); rows from before publishing existed count as published. */
export const isPublished = (x: { is_active?: boolean | null }) => x.is_active !== false;

const FEATURE_TYPE_LABELS: Record<string, string> = {
  enclosure: "Enclosure",
  building: "Building",
  facility: "Facility",
  water: "Water feature",
  landscape: "Landscape",
};

/**
 * Loads the 2.5D layout and keeps it fresh: polls the cheap /map/version endpoint and,
 * when an admin has changed anything, refetches the layout, pins and config.
 */
export function useLiveMapLayout(pollMs = 30_000) {
  const queryClient = useQueryClient();
  const layout = useGetMapLayout();
  const { data: live } = useGetMapVersion({
    query: { queryKey: getGetMapVersionQueryKey(), refetchInterval: pollMs, refetchOnWindowFocus: true },
  });

  const loadedVersion = layout.data?.version;
  useEffect(() => {
    if (live == null || loadedVersion == null || live.version === loadedVersion) return;
    queryClient.invalidateQueries({ queryKey: getGetMapLayoutQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListMapPinsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMapConfigQueryKey() });
    // Which animals live at each exhibit (an animal moved to another exhibit also bumps the version)
    queryClient.invalidateQueries({ queryKey: getSearchAnimalsQueryKey() });
    // Facilities and trees (their edits bump the version too)
    queryClient.invalidateQueries({ queryKey: FACILITIES_KEY });
    queryClient.invalidateQueries({ queryKey: PARK_AREAS_KEY });
  }, [live?.version, loadedVersion, queryClient]);

  return layout;
}

function toExtrusion(f: MapFeature): ExtrusionFeature {
  // GeoJSON is [lng, lat]; Leaflet wants [lat, lng]
  const toLatLng = (ring: number[][]) => ring.map(([lng, lat]) => [lat!, lng!] as [number, number]);
  const [outer = [], ...holes] = f.geometry.coordinates;
  return {
    id: f.id,
    name: f.name,
    ring: toLatLng(outer),
    holes: holes.map(toLatLng),
    heightM: f.height_m,
    minHeightM: f.min_height_m,
    wallColor: f.wall_color || "#bfa98a",
    roofColor: f.roof_color || "#7a9a6e",
  };
}

/** Enclosures/buildings drawn as 2.5D extrusions. Clicking one opens a popup. */
export function ExtrudedFeatures({
  features,
  highlightId = null,
  describe,
  includeDrafts = false,
  onSelect,
}: {
  features: MapFeature[];
  highlightId?: number | null;
  /** Extra popup line for a feature (e.g. linked exhibit description). */
  describe?: (feature: MapFeature) => string | null | undefined;
  /** Map Management: also draw unpublished footprints */
  includeDrafts?: boolean;
  /** Map Management: a click selects the footprint for editing instead of opening a popup */
  onSelect?: (feature: MapFeature) => void;
}) {
  const map = useMap();
  const layerRef = useRef<ExtrusionLayer | null>(null);
  const byId = useMemo(() => new Map(features.map(f => [f.id, f])), [features]);
  const lookup = useRef({ byId, describe, onSelect });
  lookup.current = { byId, describe, onSelect };

  useEffect(() => {
    const layer = new ExtrusionLayer({
      onClick: (ef, latlng) => {
        const f = lookup.current.byId.get(ef.id);
        if (!f) return;
        if (lookup.current.onSelect) { lookup.current.onSelect(f); return; }
        // Build with DOM + textContent so admin-entered names can't inject HTML
        const el = document.createElement("div");
        const title = el.appendChild(document.createElement("strong"));
        title.textContent = f.name;
        const meta = el.appendChild(document.createElement("div"));
        meta.textContent = `${FEATURE_TYPE_LABELS[f.feature_type] ?? f.feature_type} · ${f.height_m} m`;
        meta.style.color = "#6b7280";
        const extra = lookup.current.describe?.(f);
        if (extra) el.appendChild(document.createElement("div")).textContent = extra;
        L.popup().setLatLng(latlng).setContent(el).openOn(map);
      },
    });
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      layer.remove();
      layerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    layerRef.current?.setFeatures(features.filter(f => (f.is_active || includeDrafts) && f.height_m > 0).map(toExtrusion));
  }, [features, includeDrafts]);

  useEffect(() => {
    layerRef.current?.setHighlight(highlightId);
  }, [highlightId]);

  return null;
}

/**
 * Footprints with no height (the lagoon, gardens, flat yards) lying on the ground, in the same
 * colours as the 3D model's architectural look. ExtrudedFeatures only draws raised shapes, so
 * without this the 2D map left out the water and gardens the 3D map and the editor show.
 */
const FLAT_COLORS: Record<string, string> = { water: "#5d93a6", landscape: "#93ab73", enclosure: "#c9b88f" };
export function FlatFeatures({ features, includeDrafts = false, onSelect, selectedId = null }: {
  features: MapFeature[];
  /** Map Management: also draw unpublished footprints (faded) */
  includeDrafts?: boolean;
  onSelect?: (f: MapFeature) => void;
  selectedId?: number | null;
}) {
  const flat = features.filter(f => (f.is_active || includeDrafts) && !(f.height_m > 0));
  return (
    <>
      {flat.map(f => {
        const color = FLAT_COLORS[f.feature_type] ?? f.roof_color ?? "#d8d4cc";
        const rings = f.geometry.coordinates.map(ring => ring.map(([lng, lat]) => [lat!, lng!] as [number, number]));
        return (
          <Polygon key={`${f.id}:${f.name}`} positions={rings}
            pathOptions={{
              color: selectedId === f.id ? "#facc15" : color, weight: selectedId === f.id ? 3 : 1, opacity: 0.9,
              fillColor: color, fillOpacity: (f.feature_type === "water" ? 0.85 : 0.6) * (f.is_active ? 1 : 0.45),
              dashArray: f.is_active ? undefined : "4 6",
            }}
            eventHandlers={onSelect ? { click: e => { L.DomEvent.stopPropagation(e); onSelect(f); } } : undefined}>
            <Tooltip sticky>{f.name} · {FEATURE_TYPE_LABELS[f.feature_type] ?? f.feature_type}{f.is_active ? "" : " (draft, not published)"}</Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}

/** Walkways; closed paths render red and dashed so visitors avoid them. The footbridge is timber, as in 3D. */
export function Walkways({ paths, onSelect, selectedId = null }: {
  paths: MapPath[];
  /** Map Management: a click selects the walkway for editing */
  onSelect?: (p: MapPath) => void;
  selectedId?: number | null;
}) {
  const isBridge = (p: MapPath) => p.is_open && isBridgePath(p);
  // Drafts only reach staff (Map Management, or staff previewing the visitor map): drawn faded and dotted
  const draft = (p: MapPath) => !isPublished(p);
  return (
    <>
      {/* Open walkways get a darker edge under a wide cream path, so routes read first on the map */}
      {paths.filter(p => p.is_open && !draft(p)).map(p => (
        <Polyline
          key={`edge-${p.id}`}
          positions={p.geometry.coordinates.map(([lng, lat]) => [lat!, lng!] as [number, number])}
          pathOptions={{ color: isBridge(p) ? "#7a6248" : "#c9a675", weight: isBridge(p) ? 13 : 12, opacity: 0.9, lineCap: isBridge(p) ? "butt" : "round", lineJoin: "round" }}
          interactive={false}
        />
      ))}
      {paths.map(p => (
        <Polyline
          key={p.id}
          positions={p.geometry.coordinates.map(([lng, lat]) => [lat!, lng!] as [number, number])}
          pathOptions={{
            ...(draft(p)
              ? { color: "#6b7280", weight: 6, opacity: 0.7, dashArray: "2 8", lineCap: "round" as const }
              : isBridge(p)
              ? { color: "#c8a878", weight: 8, opacity: 1, lineCap: "butt" as const, lineJoin: "round" as const }
              : p.is_open
              ? { color: "#fff3d6", weight: 8, opacity: 1, lineCap: "round" as const, lineJoin: "round" as const }
              : { color: "#dc2626", weight: 5, opacity: 0.9, dashArray: "6 8" }),
            ...(selectedId === p.id ? { color: "#facc15", opacity: 1 } : {}),
          }}
          eventHandlers={onSelect ? { click: e => { L.DomEvent.stopPropagation(e); onSelect(p); } } : undefined}
        >
          <Tooltip sticky>
            {p.name || (isBridgePath(p) ? "Bridge" : "Walkway")}
            {draft(p) && " (draft, not published)"}
            {isBridge(p) && " · bridge"}
            {!p.is_open && " (closed)"}
            {p.is_open && !p.is_accessible && " (not wheelchair accessible)"}
          </Tooltip>
        </Polyline>
      ))}
    </>
  );
}

/** A facility's badge (type emoji, ringed in its status colour), as on the 3D map. */
const facilityIcon = (f: Facility, selected: boolean) => L.divIcon({
  className: "",
  html: `<div style="width:30px;height:30px;border-radius:999px;background:#fff;border:3px solid ${facilityStatus(f.status).color};display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;box-shadow:0 2px 6px rgba(0,0,0,.3);${f.status === "closed" ? "opacity:.75;" : ""}${selected ? "outline:3px solid #facc15;" : ""}">${facilityType(f.type).emoji}</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

/** Facilities from the admin's Facilities page (Park Areas), clickable, as on the 3D map. */
export function ParkFacilities2D({ facilities, selectedId = null, onSelect, onMove }: {
  facilities: Facility[]; selectedId?: number | null; onSelect?: (f: Facility) => void;
  /** Map Management: facilities can be dragged; resolve false to put one back */
  onMove?: (f: Facility, lat: number, lng: number) => Promise<boolean>;
}) {
  return (
    <>
      {facilities.map(f => (
        // Leaflet sets the title once, so a renamed facility gets a fresh marker
        <Marker key={`${f.id}:${f.name}`} position={[f.lat, f.lng]} icon={facilityIcon(f, f.id === selectedId)}
          title={isPublished(f) ? f.name : `${f.name} (draft)`} opacity={isPublished(f) ? 1 : 0.5}
          draggable={!!onMove} autoPan={!!onMove}
          eventHandlers={{
            click: () => onSelect?.(f),
            dragend: async e => {
              const m = e.target as L.Marker;
              const { lat, lng } = m.getLatLng();
              if (!(await onMove!(f, Number(lat.toFixed(7)), Number(lng.toFixed(7))))) m.setLatLng([f.lat, f.lng]);
            },
          }}>
          {!onSelect && (
            <Popup>
              <strong>{f.name}</strong>
              <div style={{ color: facilityStatus(f.status).color, fontSize: 12 }}>{facilityType(f.type).label} · {facilityStatus(f.status).label}</div>
              {f.description && <div style={{ marginTop: 4 }}>{f.description}</div>}
            </Popup>
          )}
        </Marker>
      ))}
    </>
  );
}

/** Trees from the Park Areas, a small dot in each zone's marker colour (grey ✕-style ring when dead). */
export function ParkTrees2D({ zones }: { zones: ParkZone[] }) {
  // One canvas for all the dots: hundreds of trees stay smooth on phones
  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  return (
    <>
      {zones.flatMap(z => z.trees.map(t => {
        const dead = t.status === "dead";
        return (
          <CircleMarker key={t.id} center={[t.lat, t.lng]} radius={4} renderer={renderer}
            pathOptions={{ color: dead ? "#6b7280" : "#ffffff", weight: 1.5, fillColor: dead ? "#9ca3af" : z.marker_color, fillOpacity: 0.95 }}>
            <Tooltip direction="top" offset={[0, -4]}>
              {t.species || "Tree"} · {z.name}{t.status ? ` · ${treeStatus(t.status).label}` : ""}
            </Tooltip>
          </CircleMarker>
        );
      }))}
    </>
  );
}

/** Custom floor-plan / illustrated map image, placed by its georeferenced corners. */
export function FloorPlanOverlay({ config, opacity = 0.85 }: { config?: MapConfig; opacity?: number }) {
  if (!config?.map_image_url || config.sw_lat == null || config.sw_lng == null || config.ne_lat == null || config.ne_lng == null) {
    return null;
  }
  return (
    <ImageOverlay
      url={config.map_image_url}
      bounds={[[config.sw_lat, config.sw_lng], [config.ne_lat, config.ne_lng]]}
      opacity={opacity}
    />
  );
}

/** Walking route from the chatbot / directions endpoint, drawn above walkways and 3D buildings. */
/**
 * Arrows along a route every `spacingM` metres, each pointing the way to walk: [lat, lng, bearing°]
 * (0° = north, clockwise). The first arrow sits a little after the start.
 */
export function routeArrows(points: [number, number][], spacingM = 30): [number, number, number][] {
  const out: [number, number, number][] = [];
  const M = 111_320;
  let untilNext = spacingM / 2;
  for (let i = 1; i < points.length; i++) {
    const [lat0, lng0] = points[i - 1]!, [lat1, lng1] = points[i]!;
    const cos = Math.cos((lat0 * Math.PI) / 180);
    const dx = (lng1 - lng0) * M * cos, dy = (lat1 - lat0) * M;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
    let at = untilNext;
    while (at <= len) {
      const t = at / len;
      out.push([lat0 + (lat1 - lat0) * t, lng0 + (lng1 - lng0) * t, bearing]);
      at += spacingM;
    }
    untilNext = at - len;
  }
  return out;
}

/** A white chevron in a blue circle, rotated to the walking direction. */
const arrowIcon = (bearing: number) => L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;transform:rotate(${bearing}deg)"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="11" fill="#2563eb" stroke="#fff" stroke-width="2"/><path d="M7 14l5-6 5 6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/** A red flag with the destination's name, so the end of the route can't be missed. */
const flagIcon = (name: string) => L.divIcon({
  className: "",
  html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);position:absolute;left:0;top:0;pointer-events:none"><div style="background:#dc2626;color:#fff;font:700 12px/1.2 system-ui,sans-serif;padding:3px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.35)">🏁 ${name.replace(/[<>&"]/g, "")}</div><svg viewBox="0 0 24 32" width="28" height="36" style="filter:drop-shadow(0 3px 3px rgba(0,0,0,.35))"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg></div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

/** One footprint marker; the icon's first child is turned and faded on each step (see lib/footsteps). */
const FOOTPRINT_ICON = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:20px;opacity:0;transition:opacity .2s linear">${FOOTPRINT_SVG}</div>`,
  iconSize: [14, 20],
  iconAnchor: [7, 10],
});

/**
 * Animated walking footsteps along the route, from the visitor's GPS position toward the
 * destination (live navigation only; the page decides when they're shown). `points` is [lat, lng].
 */
export function Footsteps2D({ points }: { points: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length < 2) return;
    const markers: L.Marker[] = [];
    const stop = startFootstepTrail(points, {
      metresPerPixel: () => leafletMetresPerPixel(map.getCenter().lat, map.getZoom()),
      render: prints => {
        while (markers.length < prints.length) {
          // Above the route line and arrows, below the destination flag (zIndexOffset 800)
          markers.push(L.marker([prints[markers.length]!.lat, prints[markers.length]!.lng], { icon: FOOTPRINT_ICON, interactive: false, keyboard: false, zIndexOffset: 400 }).addTo(map));
        }
        markers.forEach((m, i) => {
          const p = prints[i];
          if (p) m.setLatLng([p.lat, p.lng]);
          styleFootprint(m.getElement(), p, true);
        });
      },
    });
    return () => { stop(); markers.forEach(m => m.remove()); };
  }, [map, points]);
  return null;
}

/**
 * The walking route: a highlighted path with direction arrows, a start dot (hidden when the route
 * starts at the visitor's own blue dot) and a destination flag. The map frames the route when a new
 * destination is chosen, not every time the route is re-planned as the visitor walks.
 */
export function RouteLine({ route, fromVisitor = false }: { route: MapRoute; fromVisitor?: boolean }) {
  const map = useMap();
  const points = useMemo(
    () => route.coordinates.map(([lat, lng]) => [lat!, lng!] as [number, number]),
    [route],
  );
  const arrows = useMemo(() => (route.on_paths ? routeArrows(points) : []), [points, route.on_paths]);

  const fitKey = `${route.from_pin_id}:${route.to_pin_id}`;
  const framed = useRef<string | null>(null);
  useEffect(() => {
    if (points.length < 2 || framed.current === fitKey) return;
    framed.current = fitKey;
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 20 });
  }, [map, points, fitKey]);

  if (points.length < 2) return null;
  const start = points[0]!, end = points[points.length - 1]!;
  // Straight-line hints (no walkway) are drawn dashed so they don't look like a real path
  const dash = route.on_paths ? undefined : "4 10";
  return (
    <>
      <Polyline positions={points} pathOptions={{ color: "#ffffff", weight: 13, opacity: 0.95, dashArray: dash, lineCap: "round", lineJoin: "round" }} pane="markerPane" interactive={false} />
      <Polyline positions={points} pathOptions={{ color: "#2563eb", weight: 8, opacity: 1, dashArray: dash, lineCap: "round", lineJoin: "round" }} pane="markerPane" interactive={false} />
      {arrows.map(([lat, lng, bearing], i) => (
        <Marker key={i} position={[lat, lng]} icon={arrowIcon(bearing)} interactive={false} keyboard={false} />
      ))}
      {!fromVisitor && (
        <CircleMarker center={start} radius={7} pane="markerPane" pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -6]}>Start: {route.from_name}</Tooltip>
        </CircleMarker>
      )}
      <Marker position={end} icon={flagIcon(route.to_name)} interactive={false} keyboard={false} zIndexOffset={800} />
    </>
  );
}
