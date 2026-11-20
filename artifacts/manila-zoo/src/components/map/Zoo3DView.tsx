import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, Popup, NavigationControl, LngLatBounds, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
// MapLibre runs tile work in a web worker; let Vite bundle it (with its shared code) into one file
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { ChevronDown, ChevronUp, RotateCw, LocateFixed } from "lucide-react";
import type { MapFeature, MapPath, MapPin, MapRoute } from "@workspace/api-client-react";
import { pinColor } from "@/lib/pinColor";
import { placeIconElement } from "@/lib/placeIcon";
import { ZOO_BOUNDARY, ZOO_VIEW_CENTER, ZOO_VIEW_SIZE_M, metresOutsideZoo, zooBounds } from "@/lib/zooBoundary";
import { can3D } from "@/lib/browserSupport";
import { SATELLITE_ATTRIBUTION, SATELLITE_MAX_ZOOM, SATELLITE_URL } from "@/lib/satellite";
import { routeArrows } from "@/components/map/ZooMapLayers";
import { startFootstepTrail, styleFootprint, footprintElement, maplibreMetresPerPixel } from "@/lib/footsteps";
import { PLAN_STRUCTURES, planTrees, planEllipse, bridgeParts, BRIDGE_NAME, type PlanTree } from "@/lib/architecturalPlan";
import { MARKER_COLORS, SHAPES, TREE_MARKERS, shapePath, zoneOfShape, type TreeShape } from "@/lib/treeSurvey";
import { TreeLegend, STATIC_LEGEND, type LegendZone } from "@/components/map/TreeLegend";
import { facilityStatus, facilityType, treeStatus, useFacilities, useParkAreas, type Facility, type ParkZone } from "@/lib/parkAreas";

setWorkerUrl(workerUrl);

// ─── Trees of the Park Areas (admin dashboard), or the site plan's markers when offline ───

type TreePoint = { lng: number; lat: number; shape: TreeShape; color: string; dead: boolean; zone: string; species: string; status: string; notes: string };
const treeIconId = (p: Pick<TreePoint, "shape" | "color" | "dead">) => `tree-${p.dead ? "dead" : p.shape}-${p.color.toLowerCase()}`;

/** The built-in markers from the site plan (lib/treeSurvey), in the plan's colours */
const STATIC_TREES: TreePoint[] = TREE_MARKERS.map(([lng, lat, s, c]) => ({
  lng, lat, shape: SHAPES[s]!, color: MARKER_COLORS[c]!, dead: false, zone: zoneOfShape(SHAPES[s]!)?.name ?? "", species: "", status: "", notes: "",
}));

/** Trees from the Park Areas, each in its zone's marker shape and colour (✕ when dead) */
function treesFromZones(zones: ParkZone[]): TreePoint[] {
  return zones.flatMap(z => z.trees.map(t => ({
    lng: t.lng, lat: t.lat, shape: z.marker_shape, color: z.marker_color, dead: t.status === "dead",
    zone: z.name, species: t.species ?? "", status: treeStatus(t.status).label, notes: t.notes ?? "",
  })));
}

function treeGeoJSON(points: TreePoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map(p => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { icon: treeIconId(p), zone: p.zone, species: p.species, status: p.status, notes: p.notes },
    })),
  };
}

/** Adds any tree icons the map doesn't have yet */
function addTreeIcons(map: MapLibreMap, points: TreePoint[]) {
  for (const p of points) {
    const id = treeIconId(p);
    if (!map.hasImage(id)) map.addImage(id, treeIcon(p.dead ? "dead" : p.shape, p.color), { pixelRatio: 2 });
  }
}

/** A facility on the map: its type's emoji in a white disc ringed in its status colour */
function facilityElement(f: Facility): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.title = `${f.name} · ${facilityStatus(f.status).label}`;
  el.setAttribute("aria-label", `${f.name}, ${facilityType(f.type).label}, ${facilityStatus(f.status).label}`);
  el.style.cssText = `width:30px;height:30px;border-radius:999px;background:#fff;border:3px solid ${facilityStatus(f.status).color};display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer;padding:0;${f.status === "closed" ? "opacity:.75;" : ""}`;
  el.textContent = facilityType(f.type).emoji;
  return el;
}

/**
 * A pin standing on the ground: the zone's shape in its colour with a white outline (or ✕ for a dead
 * tree), on a short stem to a ground dot. Drawn at 2× for sharp edges.
 */
function treeIcon(shape: TreeShape | "dead", color: string): { width: number; height: number; data: Uint8ClampedArray } {
  const R = 2, W = 26, H = 36;
  const canvas = document.createElement("canvas");
  canvas.width = W * R; canvas.height = H * R;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(R, R);
  // Stem and ground dot
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(13, 33.5, 3.5, 1.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#3f3f46"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(13, 22); ctx.lineTo(13, 33.2); ctx.stroke();
  // Shape (24×24 path, centred in the top 26×26)
  ctx.translate(1, 0.5);
  const { d, stroke } = shape === "dead" ? { d: "M5 5 L19 19 M19 5 L5 19", stroke: true } : shapePath(shape);
  const path = new Path2D(d);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (stroke) {
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6; ctx.stroke(path);
    ctx.strokeStyle = color; ctx.lineWidth = 3.4; ctx.stroke(path);
  } else {
    ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1;
    ctx.fillStyle = color; ctx.fill(path, "evenodd");
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.8; ctx.stroke(path);
  }
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: img.width, height: img.height, data: img.data };
}

/**
 * True 3D "relief model" of the zoo (tilt, rotate, auto-orbit) using MapLibre GL, drawn from the
 * same live layout as the Leaflet map. The zoo is lit while the city around it is dimmed;
 * footprints rise to their real heights (optionally exaggerated), exhibits carry floating labels,
 * and a readout names whatever is under the cursor.
 */

/** The pin fields this view uses (the offline sample pins have only these). */
type ViewPin = Pick<MapPin, "id" | "name" | "lat" | "lng" | "color" | "pin_type" | "description" | "animal_name" | "animal_id"> & {
  /** Animals that live here, from the animal records */
  residents?: { id: number; name: string }[];
  /** Hidden from visitors (shown faded in the admin editor) */
  hidden?: boolean;
};

export type Zoo3DViewProps = {
  center: [number, number]; // [lat, lng]
  zoom: number;
  features: MapFeature[];
  paths: MapPath[];
  pins: ViewPin[];
  route?: MapRoute | null;
  showBuildings: boolean;
  showWalkways: boolean;
  selectedPinId: number | null;
  /** Move the camera here when it changes; [lat, lng] */
  flyTo: [number, number] | null;
  /** Extra popup line for a footprint (e.g. its exhibit's description) */
  describe?: (feature: MapFeature) => string | null | undefined;
  /** Footprints that stand up; the rest lie flat so a filtered category stands out (null = all) */
  keepFeatureIds: number[] | null;
  /** A pin, or a footprint linked to one, was clicked */
  onSelectPin: (pinId: number) => void;
  /** The visitor's position, drawn as a blue dot */
  visitor: { lat: number; lng: number } | null;
  /** Live navigation: animated walking footsteps along these route points ([lat, lng]); null for none */
  footsteps?: [number, number][] | null;
  /** While true, a tap on the map reports a position instead of selecting things */
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
  /** Called if this browser can't show WebGL maps, so the page can fall back to 2D */
  onUnsupported: () => void;
  /**
   * Admin editor only: makes pins draggable and saves the new position. Resolve false to put the
   * pin back (e.g. the server refused a spot outside the zoo).
   */
  onMovePin?: (pinId: number, lat: number, lng: number) => Promise<boolean>;
  /** A tap on open ground (not a place or building): the page drops a location pin there */
  onMapTap?: (lat: number, lng: number) => void;
  /** The dropped location pin, drawn in red */
  droppedPin?: { lat: number; lng: number } | null;
  /** Facilities (Park Areas) to show, e.g. under the visitor's category filter or search (null/undefined = all) */
  facilityIds?: number[] | null;
  /** Open (and reset) framing the whole zoo for this map's size, instead of at `center`/`zoom` */
  fitZoo?: boolean;
  /** Each change moves the camera back to its opening view (the page's own "Reset view") */
  resetSignal?: number;
  /** Show the Tree legend panel (tree survey zones and species). Staff map tools only; the visitor map has none. */
  treeLegend?: boolean;
};

type LabelMode = "off" | "exhibits" | "all";

// Same tile servers and subdomain choice as Leaflet, so tiles saved for offline use are reused
const TILE_URLS = ["a", "b", "c"].map(s => `https://${s}.tile.openstreetmap.org/{z}/{x}/{y}.png`);
const START_PITCH = 60;
const START_BEARING = -17;
const ZOOM_OUT = 0.5; // start wide enough to see the whole block and its sides

const ACCENT = "#7cc9b5";
// Legend colors: realistic look first, then the architectural look
const FEATURE_TYPES: { type: string; label: string; color: string; arch: string }[] = [
  { type: "enclosure", label: "Habitat", color: "#a8915f", arch: "#c9b88f" },
  { type: "building", label: "Building", color: "#efe9df", arch: "#eeebe4" },
  { type: "facility", label: "Facility", color: "#cfd4d6", arch: "#c9cbcc" },
  { type: "water", label: "Water", color: "#3d7fa6", arch: "#5d93a6" },
  { type: "landscape", label: "Garden", color: "#6f8f4e", arch: "#93ab73" },
];
const PIN_KIND: Record<string, string> = {
  animal: "Exhibit", building: "Place", food_stall: "Food", restroom: "Restroom",
  emergency: "First aid", entrance: "Entrance", exit: "Exit", facility: "Facility", other: "Place",
};

/**
 * "Architectural" look: the zoo as an architect's site model, following the official site plan
 * (A. Moreta & Co. "Plan on Site"). Rendered and plastered buildings, habitats as fenced yards of
 * packed earth, concrete walkways with kerbs, lawn between them, trees, and the lagoon, all at
 * true scale on a plain site board instead of a photo. The plan's extra structures and the trees
 * are estimated (see lib/architecturalPlan.ts); the outlines are the map's own surveyed geometry.
 */
type Light = Parameters<MapLibreMap["setLight"]>[0];
type Look = "architectural" | "realistic";
const ARCH = {
  sky: { "sky-color": "#c9d6de", "horizon-color": "#f1efea", "fog-color": "#ece9e3", "sky-horizon-blend": 0.55, "horizon-fog-blend": 0.8, "atmosphere-blend": 0 },
  // Soft daylight from the southwest, fixed to the map so shading stays true as it rotates
  light: { anchor: "map", color: "#ffffff", intensity: 0.4, position: [1.3, 225, 45] } as Light,
  outside: "#f2f0eb",   // the site board around the zoo
  site: "#b9c49d",      // lawn: the open ground of the zoo
  water: "#5d93a6",
  walk: "#dcd8cf",      // concrete
  kerb: "#a7a196",
  fence: "#56604f",
  enclosureFloor: "#c9b88f", // packed earth and grass of the habitats
  flat: "#d8d4cc",
  byType: ["match", ["get", "type"],
    "building", "#eeebe4", "facility", "#c9cbcc", "landscape", "#93ab73",
    "#eeebe4"] as unknown as string,
};
// Realistic look: the zoo's aerial photo as the ground, daylight sky, afternoon sun from the
// southwest, and everything standing at ground level in natural materials
const REAL = {
  sky: { "sky-color": "#6fa8dc", "horizon-color": "#e3edf2", "fog-color": "#dfe8ec", "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.75, "atmosphere-blend": 0 },
  light: { anchor: "map", color: "#fff4e0", intensity: 0.5, position: [1.5, 225, 40] } as Light,
  outside: "#10202a",
  water: "#3d7fa6",
  walk: "#c9c4b9",
  fence: "#3c463d",
  enclosureFloor: "#a8915f",
  flat: "#8a8f86",
  byType: ["match", ["get", "type"],
    "building", "#efe9df", "facility", "#cfd4d6", "landscape", "#6f8f4e",
    ["get", "roof"]] as unknown as string,
};

const keptExpr = (keep: number[] | null) => (keep == null ? true : ["in", ["get", "id"], ["literal", keep]]);

// Wall color: the selected exhibit in yellow, filtered-out footprints muted, the rest in the look's
// materials (architectural) or the roof colors the map editor sets (realistic)
const buildingColor = (selectedPinId: number | null, keep: number[] | null, look: Look) =>
  ["case",
    ["==", ["get", "pinId"], selectedPinId ?? -2], "#facc15",
    keptExpr(keep), look === "architectural" ? ARCH.byType : REAL.byType,
    look === "architectural" ? ARCH.flat : REAL.flat,
  ] as unknown as string;

// Habitat fence color: the selected exhibit in yellow, filtered-out ones muted
const fenceColor = (selectedPinId: number | null, keep: number[] | null, look: Look) =>
  ["case",
    ["==", ["get", "pinId"], selectedPinId ?? -2], "#facc15",
    keptExpr(keep), look === "architectural" ? ARCH.fence : REAL.fence,
    look === "architectural" ? ARCH.flat : REAL.flat,
  ] as unknown as string;

// Walkways: 4 m wide, with a slightly wider kerb under them in the architectural look
const WALK_WIDTH_M = 4;
const WALK_EDGE_M = 5;
const ROUTE_WIDTH_M = 4.6;
const FENCE_WIDTH_M = 0.5;
// Filtered-out footprints lie flat on the ground
const buildingHeight = (k: number, keep: number[] | null) =>
  ["case", keptExpr(keep), ["*", ["get", "height"], k], 0.08] as unknown as number;
// Islands (landscape shapes with height) rise from the lagoon floor; everything else from its base height
const buildingBase = (k: number, keep: number[] | null) =>
  ["case",
    ["!", keptExpr(keep)], 0,
    ["==", ["get", "type"], "landscape"], 0,
    ["*", ["get", "base"], k]] as unknown as number;
// Footprints that can be clicked to open their place, or (plan structures) to say what they are
const CLICKABLE_LAYERS = ["zoo-tree-markers", "zoo-buildings", "zoo-fences", "zoo-enclosure-floor", "zoo-plan"];
const TREE_SHADES = ["#5f7d4a", "#6e8c55", "#7f9a5f"];

function featureData(features: MapFeature[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: features.map(f => ({
      type: "Feature",
      id: f.id,
      geometry: f.geometry as unknown as GeoJSON.Polygon,
      properties: {
        id: f.id,
        name: f.name,
        type: f.feature_type,
        pinId: f.map_pin_id ?? -1,
        height: f.height_m,
        base: f.min_height_m,
        roof: f.roof_color || "#7a9a6e",
      },
    })),
  };
}

/**
 * A line as a strip of polygons [lng, lat] of the given width: one quad per segment plus a small
 * octagon at each vertex for rounded joins. Lines drawn flat would be hidden under the raised block,
 * so walkways and the route are extruded like thin slabs instead.
 */
function strip(coords: number[][], widthM: number): GeoJSON.MultiPolygon {
  const half = widthM / 2;
  const polys: number[][][][] = [];
  const toDeg = (lat: number) => ({ lat: 1 / 111_320, lng: 1 / (111_320 * Math.cos((lat * Math.PI) / 180)) });
  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i] as [number, number];
    const d = toDeg(lat);
    const ring: number[][] = [];
    for (let k = 0; k <= 8; k++) {
      const a = (k % 8) * (Math.PI / 4);
      ring.push([lng + Math.cos(a) * half * d.lng, lat + Math.sin(a) * half * d.lat]);
    }
    polys.push([ring]);
    if (i === 0) continue;
    const [lng0, lat0] = coords[i - 1] as [number, number];
    const dx = (lng - lng0) / d.lng, dy = (lat - lat0) / d.lat; // meters
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const nx = (-dy / len) * half * d.lng, ny = (dx / len) * half * d.lat;
    polys.push([[[lng0 + nx, lat0 + ny], [lng + nx, lat + ny], [lng - nx, lat - ny], [lng0 - nx, lat0 - ny], [lng0 + nx, lat0 + ny]]]);
  }
  return { type: "MultiPolygon", coordinates: polys };
}

function pathData(paths: MapPath[], widthM = WALK_WIDTH_M): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: paths.map(p => ({
      type: "Feature",
      geometry: strip(p.geometry.coordinates, widthM),
      properties: { name: p.name ?? "Walkway", open: p.is_open },
    })),
  };
}

function routeData(route?: MapRoute | null): GeoJSON.FeatureCollection {
  const coords = (route?.coordinates ?? []).map(([lat, lng]) => [lng!, lat!]);
  return {
    type: "FeatureCollection",
    features: coords.length >= 2 ? [{ type: "Feature", geometry: strip(coords, ROUTE_WIDTH_M), properties: {} }] : [],
  };
}

/**
 * Enclosure outlines as thin walls (realistic look), so an enclosure reads as a fenced yard
 * on the aerial photo instead of a solid block hiding the animals' ground.
 */
function fenceData(features: MapFeature[]): GeoJSON.FeatureCollection {
  const yards = featureData(features.filter(f => f.feature_type === "enclosure" && f.height_m > 0));
  return {
    ...yards,
    features: yards.features.map(f => ({ ...f, geometry: strip((f.geometry as GeoJSON.Polygon).coordinates[0]!, FENCE_WIDTH_M) })),
  };
}

/** The zoo's grounds: the lawn everything in the architectural look stands on. */
const ZOO_SITE: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ZOO_BOUNDARY] } };

/** Structures the official site plan shows that the map's layout doesn't have yet (estimated positions). */
const PLAN_DATA: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: PLAN_STRUCTURES.map((s, i) => ({
    type: "Feature",
    id: i,
    geometry: { type: "Polygon", coordinates: [s.ring] },
    properties: {
      name: s.name, kind: s.kind, height: s.heightM, note: s.note,
      color: { water: ARCH.water, paving: "#8e9195", building: "#eeebe4", facility: "#c9cbcc" }[s.kind],
    },
  })),
};

/** Walkways marked as bridges in Map Management (and the original lagoon footbridge) */
const isBridgeWalk = (p: MapPath) => p.is_open && ((p as { kind?: string }).kind === "bridge" || p.name === BRIDGE_NAME);

/** Footbridges (arched timber deck slabs and railings), one per segment of each bridge walkway. */
function bridgeData(paths: MapPath[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: paths.filter(isBridgeWalk).flatMap(walk => {
      const c = walk.geometry.coordinates;
      // A straight bridge spans its two ends; a bent one gets an arched span per segment
      const spans = c.length <= 2 ? [[c[0]!, c[c.length - 1]!]] : c.slice(1).map((pt, i) => [c[i]!, pt]);
      return spans.flatMap(([a, b]) => bridgeParts([a![0]!, a![1]!], [b![0]!, b![1]!])).map(p => ({
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [p.ring] },
        properties: { name: walk.name || "Bridge", base: p.base, top: p.top, color: p.part === "deck" ? "#c8a878" : "#7a6248" },
      }));
    }),
  };
}

/** Walkways drawn as concrete strips: all but the open bridges, which the bridge models stand for. */
const stripPaths = (paths: MapPath[]) => paths.filter(p => !isBridgeWalk(p));

/** Illustrative trees as trunks and canopies, placed in the open ground of the live layout. */
function treeData(features: MapFeature[], paths: MapPath[]): { trunks: GeoJSON.FeatureCollection; canopies: GeoJSON.FeatureCollection } {
  const trees = planTrees(
    features.map(f => ({ type: f.feature_type, ring: f.geometry.coordinates[0] ?? [] })),
    paths.map(p => p.geometry.coordinates),
  );
  const at = (t: PlanTree, r: number, sides: number): GeoJSON.Polygon => ({ type: "Polygon", coordinates: [planEllipse([t.lng, t.lat], r, r, 0, sides)] });
  return {
    trunks: { type: "FeatureCollection", features: trees.map(t => ({ type: "Feature", geometry: at(t, 0.25, 6), properties: { top: t.trunkM + 0.5 } })) },
    canopies: {
      type: "FeatureCollection",
      features: trees.map(t => ({ type: "Feature", geometry: at(t, t.radiusM, 10), properties: { base: t.trunkM, top: t.topM, color: TREE_SHADES[t.shade] } })),
    },
  };
}

// Everything outside the zoo, so the surroundings can be dimmed like the sea around a relief model
const OUTSIDE_ZOO: GeoJSON.Feature = {
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], ZOO_BOUNDARY] },
};
const ZOO_OUTLINE: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ZOO_BOUNDARY } };

const EARTH_R = 6_371_008.8;
function metersBetween([lng1, lat1]: number[], [lng2, lat2]: number[]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2! - lat1!), dLng = toRad(lng2! - lng1!);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1!)) * Math.cos(toRad(lat2!)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}
function areaHectares(ring: [number, number][]): number {
  const lat0 = (ring[0]![1] * Math.PI) / 180;
  const xy = ring.map(([lng, lat]) => [((lng * Math.PI) / 180) * EARTH_R * Math.cos(lat0), ((lat * Math.PI) / 180) * EARTH_R]);
  let a = 0;
  for (let i = 0; i < xy.length - 1; i++) a += xy[i]![0]! * xy[i + 1]![1]! - xy[i + 1]![0]! * xy[i]![1]!;
  return Math.abs(a) / 2 / 10_000;
}
const ZOO_AREA_HA = areaHectares(ZOO_BOUNDARY);

// 16 lets a phone-width map fit the whole zoo when it opens
const MIN_ZOOM = 16;
const MAX_ZOOM = 19.5;
/** How far past the whole-zoo frame a visitor can zoom out (zoom levels; 0.5 ≈ the zoo at 70% size) */
const ZOOM_OUT_SLACK = 0.5;
/**
 * How far the camera can pan: the zoo plus a small margin, [[west, south], [east, north]]. The map is
 * a guide to Manila Zoo only, so the surrounding city stays off screen (and masked) rather than browsable.
 * The margin is wider than the 2D map's because the tilted camera looks past its own center.
 */
const ZOO_PAN_BOUNDS: [[number, number], [number, number]] = (() => {
  const [[s, w], [n, e]] = zooBounds(150);
  return [[w, s], [e, n]];
})();

/**
 * The opening camera that frames the whole zoo (ZOO_VIEW_BOX, the same frame as the 2D map) in a
 * w×h map: zoom from the box's size, then the target nudged south, because at the 60° tilt the near
 * (south) half is drawn larger, which pushes the zoo toward the bottom and leaves empty space above.
 */
function zooHomeCamera(w: number, h: number): { center: [number, number]; zoom: number } {
  const [vw, vh] = ZOO_VIEW_SIZE_M;
  const [lat, lng] = ZOO_VIEW_CENTER;
  // Tilted, the north-south depth looks about 60% as tall; margins keep the labels and corner controls clear
  const mPerPx = Math.max(vw / (w * 0.88), (vh * 0.62) / (h * 0.72));
  const fit = Math.log2((78271.517 * Math.cos((lat * Math.PI) / 180)) / mPerPx);
  const southM = vh * 0.12;
  return { center: [lng, lat - southM / 111_320], zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit)) };
}

function pinElement(pin: ViewPin): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", pin.name);
  // White badge with the place's icon, ringed in its category color
  el.style.cssText = `display:flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border-radius:50%;border:3px solid ${pinColor(pin)};box-shadow:0 3px 8px rgba(0,0,0,.35);cursor:pointer;background:#fff`;
  el.append(placeIconElement(pin, 17));
  return el;
}

/** A red map pin for a dropped location. */
function droppedPinElement(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "width:30px;height:40px;pointer-events:none;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))";
  el.innerHTML = '<svg viewBox="0 0 24 32" width="30" height="40"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>';
  return el;
}

/** Floating name with a leader line down to the pin, like a peak label on a relief model. */
function labelElement(name: string, subtitle: string): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:none";
  const chip = document.createElement("div");
  chip.style.cssText = "background:rgba(255,255,255,.95);color:#1f3a2d;padding:4px 11px;border-radius:999px;text-align:center;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,.18);border:1.5px solid rgba(0,0,0,.06)";
  const title = document.createElement("div");
  title.style.cssText = "font:600 12px/1.25 Fredoka,'Plus Jakarta Sans',system-ui,sans-serif";
  title.textContent = name;
  const sub = document.createElement("div");
  sub.style.cssText = "font:600 9px/1.3 system-ui,sans-serif;letter-spacing:.06em;color:#4f8a6c;text-transform:uppercase";
  sub.textContent = subtitle;
  chip.append(title, sub);
  const leader = document.createElement("div");
  leader.style.cssText = "width:2px;height:26px;border-radius:2px;background:rgba(31,58,45,.45)";
  root.append(chip, leader);
  return root;
}

type Readout = { lat: number; lng: number; what: string };

export default function Zoo3DView(props: Zoo3DViewProps) {
  const { center, zoom, features, paths, pins, route, showBuildings, showWalkways, selectedPinId, flyTo, describe, onUnsupported, keepFeatureIds, onSelectPin, visitor, picking, onPick } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const labelsRef = useRef<Marker[]>([]);
  // Latest props for event handlers registered once at load
  const describeRef = useRef(describe);
  describeRef.current = describe;
  const featuresRef = useRef(features);
  featuresRef.current = features;
  const onSelectPinRef = useRef(onSelectPin);
  onSelectPinRef.current = onSelectPin;
  const onMovePinRef = useRef(props.onMovePin);
  onMovePinRef.current = props.onMovePin;
  const onMapTapRef = useRef(props.onMapTap);
  onMapTapRef.current = props.onMapTap;
  const droppedRef = useRef<Marker | null>(null);
  const pickingRef = useRef(picking);
  pickingRef.current = picking;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const visitorRef = useRef<Marker | null>(null);
  // Direction arrows along the route and the destination flag
  const routeMarkersRef = useRef<Marker[]>([]);
  const framedRouteRef = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // True heights (1×) by default; the slider can exaggerate them
  const [exaggeration, setExaggeration] = useState(1);
  const [labelMode, setLabelMode] = useState<LabelMode>("exhibits");
  const [autoRotate, setAutoRotate] = useState(false);
  // Starts folded so the map itself has the room; visitors open it for the model settings
  const [panelOpen, setPanelOpen] = useState(false);
  const [readout, setReadout] = useState<Readout | null>(null);
  // "model" covers (architectural) or darkens (realistic) the city so the zoo stands out; "city" shows it
  const [surroundings, setSurroundings] = useState<"model" | "city">("model");
  // The architectural site model, from the official site plan, is the main look
  const [look, setLook] = useState<Look>("architectural");
  const arch = look === "architectural";
  // Tree survey markers from the site plan, and their legend panel
  const [showTreeMarkers, setShowTreeMarkers] = useState(true);
  const [treeLegendOpen, setTreeLegendOpen] = useState(false);
  // Facilities and Park Areas from the admin dashboard; polled so changes show up within 30 seconds
  const parkAreas = useParkAreas(30_000);
  const facilitiesQuery = useFacilities(30_000);
  const zones = parkAreas.data;
  const treePoints = useMemo(() => (zones ? treesFromZones(zones) : STATIC_TREES), [zones]);
  const legendZones = useMemo<LegendZone[]>(() => zones
    ? zones.map(z => ({ name: z.name, shape: z.marker_shape, color: z.marker_color, species: z.legend_species.map(name => ({ name, color: z.marker_color })) }))
    : STATIC_LEGEND, [zones]);
  const treeCounts = useMemo(() => treePoints.reduce<Record<string, number>>((acc, p) => { acc[p.zone] = (acc[p.zone] ?? 0) + 1; return acc; }, {}), [treePoints]);
  const facilityMarkersRef = useRef<Marker[]>([]);

  const stats = useMemo(() => {
    const walkwayM = paths.reduce((sum, p) => {
      const c = p.geometry.coordinates;
      let m = 0;
      for (let i = 1; i < c.length; i++) m += metersBetween(c[i - 1]!, c[i]!);
      return sum + m;
    }, 0);
    const tallest = features.reduce<MapFeature | null>((t, f) => (!t || f.height_m > t.height_m ? f : t), null);
    return { exhibits: pins.filter(p => p.pin_type === "animal").length, walkwayM, tallest };
  }, [paths, features, pins]);

  // Create the map once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Too old for MapLibre (e.g. iOS 15.3 or older): show the 2D map instead of a broken 3D one
    if (!can3D) { onUnsupported(); return; }
    let map: MapLibreMap;
    const home = homeCamera();
    try {
      map = new MapLibreMap({
        container,
        center: home.center,
        zoom: home.zoom,
        pitch: START_PITCH,
        bearing: START_BEARING,
        maxPitch: 75,
        // Zoom limits: from the whole zoo with its surrounding streets (16.5) to a close look at one
        // exhibit (19.5); further in, the model's blocks fill the screen, further out it's just the city
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        // Panning stays around the zoo
        maxBounds: ZOO_PAN_BOUNDS,
        // One finger moves the map, pinch zooms and two-finger twist/drag rotates and tilts, on every
        // device. On phones the map is 65% of the screen, so the page scrolls from the rest of it.
        cooperativeGestures: false,
        canvasContextAttributes: { antialias: true },
        style: {
          version: 8,
          // Sky behind the tilted model and the sun, for the starting look
          sky: arch ? ARCH.sky : REAL.sky,
          light: arch ? ARCH.light : REAL.light,
          sources: {
            osm: {
              type: "raster",
              tiles: TILE_URLS,
              tileSize: 256,
              maxzoom: 19,
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
            satellite: {
              type: "raster",
              tiles: [SATELLITE_URL],
              tileSize: 256,
              maxzoom: SATELLITE_MAX_ZOOM,
              attribution: SATELLITE_ATTRIBUTION,
            },
          },
          // Street map behind the architectural model when the city is shown, aerial photo for the
          // realistic look (a hidden layer loads no tiles)
          layers: [
            { id: "osm", type: "raster", source: "osm", layout: { visibility: "none" } },
            { id: "satellite", type: "raster", source: "satellite", layout: { visibility: arch ? "none" : "visible" } },
          ],
        },
      });
    } catch {
      onUnsupported(); // no WebGL 2 in this browser
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");

    let setUpDone = false;
    const setUp = () => {
      if (setUpDone) return;
      setUpDone = true;
      map.addSource("zoo-outside", { type: "geojson", data: OUTSIDE_ZOO });
      map.addSource("zoo-outline", { type: "geojson", data: ZOO_OUTLINE });
      map.addSource("zoo-site", { type: "geojson", data: ZOO_SITE });
      map.addSource("zoo-features", { type: "geojson", data: featureData([]) });
      map.addSource("zoo-paths", { type: "geojson", data: pathData([]) });
      map.addSource("zoo-paths-edge", { type: "geojson", data: pathData([], WALK_EDGE_M) });
      map.addSource("zoo-route", { type: "geojson", data: routeData(null) });
      map.addSource("zoo-fences", { type: "geojson", data: fenceData([]) });
      map.addSource("zoo-plan", { type: "geojson", data: PLAN_DATA });
      map.addSource("zoo-bridge", { type: "geojson", data: bridgeData([]) });
      const noTrees = treeData([], []);
      map.addSource("zoo-tree-trunks", { type: "geojson", data: noTrees.trunks });
      map.addSource("zoo-tree-canopies", { type: "geojson", data: noTrees.canopies });

      // Cover or dim the city, lay the zoo's lawn (architectural look), then outline the zoo
      map.addLayer({ id: "zoo-outside", type: "fill", source: "zoo-outside", paint: { "fill-color": ARCH.outside, "fill-opacity": 1 } });
      map.addLayer({ id: "zoo-site", type: "fill", source: "zoo-site", paint: { "fill-color": ARCH.site, "fill-opacity": 1 } });
      map.addLayer({
        id: "zoo-outline-glow", type: "line", source: "zoo-outline",
        paint: { "line-color": ACCENT, "line-width": 10, "line-blur": 8, "line-opacity": 0.45 },
      });
      map.addLayer({ id: "zoo-outline", type: "line", source: "zoo-outline", paint: { "line-color": ACCENT, "line-width": 1.5 } });

      // Everything stands on the ground: the lagoon, garden beds, habitat yards, walkways (kerb
      // under concrete), the route, then buildings, fences and trees. Paints per look are set below.
      map.addLayer({
        id: "zoo-water", type: "fill-extrusion", source: "zoo-features",
        filter: ["==", ["get", "type"], "water"],
        paint: { "fill-extrusion-color": ARCH.water, "fill-extrusion-height": 0.15, "fill-extrusion-opacity": 1 },
      });
      map.addLayer({
        id: "zoo-ground", type: "fill-extrusion", source: "zoo-features",
        filter: ["all", ["<=", ["get", "height"], 0], ["!=", ["get", "type"], "water"]],
        paint: { "fill-extrusion-color": ARCH.byType, "fill-extrusion-height": 0.05 },
      });
      // Each habitat's yard, inside its fence
      map.addLayer({
        id: "zoo-enclosure-floor", type: "fill-extrusion", source: "zoo-features",
        filter: ["==", ["get", "type"], "enclosure"],
        paint: { "fill-extrusion-color": ARCH.enclosureFloor, "fill-extrusion-height": 0.1, "fill-extrusion-opacity": 1 },
      });
      // Estimated structures from the official site plan (fountain, parking, guard house)
      map.addLayer({
        id: "zoo-plan", type: "fill-extrusion", source: "zoo-plan",
        paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["get", "height"], "fill-extrusion-vertical-gradient": true },
      });
      map.addLayer({
        id: "zoo-walkways-edge", type: "fill-extrusion", source: "zoo-paths-edge",
        filter: ["==", ["get", "open"], true],
        paint: { "fill-extrusion-color": ARCH.kerb, "fill-extrusion-height": 0.2 },
      });
      map.addLayer({
        id: "zoo-walkways", type: "fill-extrusion", source: "zoo-paths",
        filter: ["==", ["get", "open"], true],
        paint: { "fill-extrusion-color": ARCH.walk, "fill-extrusion-height": 0.3 },
      });
      map.addLayer({
        id: "zoo-walkways-closed", type: "fill-extrusion", source: "zoo-paths",
        filter: ["==", ["get", "open"], false],
        paint: { "fill-extrusion-color": "#f87171", "fill-extrusion-height": 0.3 },
      });
      // Footbridge over the lagoon, standing above the water
      map.addLayer({
        id: "zoo-bridge", type: "fill-extrusion", source: "zoo-bridge",
        paint: {
          "fill-extrusion-color": ["get", "color"], "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "top"],
          "fill-extrusion-vertical-gradient": true,
        },
      });
      map.addLayer({
        id: "zoo-route", type: "fill-extrusion", source: "zoo-route",
        paint: { "fill-extrusion-color": "#3b82f6", "fill-extrusion-height": 0.7 },
      });
      map.addLayer({
        id: "zoo-buildings", type: "fill-extrusion", source: "zoo-features",
        filter: [">", ["get", "height"], 0],
        paint: {
          "fill-extrusion-color": buildingColor(null, null, look),
          "fill-extrusion-height": buildingHeight(1, null),
          "fill-extrusion-base": buildingBase(1, null),
          "fill-extrusion-opacity": 1,
          "fill-extrusion-vertical-gradient": true,
        },
      });
      // Illustrative trees (architectural look): a thin trunk under a round canopy
      map.addLayer({
        id: "zoo-tree-trunks", type: "fill-extrusion", source: "zoo-tree-trunks",
        paint: { "fill-extrusion-color": "#7a6248", "fill-extrusion-height": ["get", "top"] },
      });
      map.addLayer({
        id: "zoo-tree-canopies", type: "fill-extrusion", source: "zoo-tree-canopies",
        paint: {
          "fill-extrusion-color": ["get", "color"], "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "top"],
          "fill-extrusion-vertical-gradient": true,
        },
      });
      // Habitat fences, standing to the enclosure's height
      map.addLayer({
        id: "zoo-fences", type: "fill-extrusion", source: "zoo-fences",
        paint: {
          "fill-extrusion-color": fenceColor(null, null, look),
          "fill-extrusion-height": buildingHeight(1, null),
          "fill-extrusion-base": buildingBase(1, null),
          "fill-extrusion-vertical-gradient": true,
        },
      });

      // Tree survey markers from the site plan: pins standing on the ground, above the model, small
      // enough at the zoo-wide view not to cover the buildings
      // (the site plan's markers until the Park Areas load, see the effect below)
      addTreeIcons(map, STATIC_TREES);
      map.addSource("zoo-tree-markers", { type: "geojson", data: treeGeoJSON(STATIC_TREES) });
      map.addLayer({
        id: "zoo-tree-markers", type: "symbol", source: "zoo-tree-markers",
        layout: {
          "icon-image": ["get", "icon"],
          "icon-anchor": "bottom",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 16.5, 0.42, 18, 0.62, 19.5, 0.95],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-pitch-alignment": "viewport",
          "icon-rotation-alignment": "viewport",
          // Nearer pins drawn over farther ones
          "symbol-z-order": "viewport-y",
        },
      });

      // Clicking a footprint opens its place's details; shapes without a place just show their name
      // Picking a position: any tap on the map is where the visitor is standing
      map.on("click", e => {
        if (pickingRef.current) { onPickRef.current(e.lngLat.lat, e.lngLat.lng); return; }
        // Open ground drops a location pin; buildings and places keep their own click
        if (onMapTapRef.current && map.queryRenderedFeatures(e.point, { layers: CLICKABLE_LAYERS }).length === 0) {
          onMapTapRef.current(e.lngLat.lat, e.lngLat.lng);
        }
      });
      map.on("click", CLICKABLE_LAYERS, e => {
        if (pickingRef.current) return;
        const hit = e.features?.[0];
        if (!hit) return;
        // A tree marker: its planting zone from the plan's legend
        if (hit.layer.id === "zoo-tree-markers") {
          const root = document.createElement("div");
          root.className = "font-sans";
          const title = document.createElement("strong");
          const species = String(hit.properties["species"] ?? "");
          title.textContent = species || "Tree";
          const zoneLine = document.createElement("p");
          zoneLine.className = "text-sm text-gray-600 mt-1";
          const status = String(hit.properties["status"] ?? "");
          zoneLine.textContent = [String(hit.properties["zone"] ?? ""), status].filter(Boolean).join(" · ");
          root.append(title, zoneLine);
          const notes = String(hit.properties["notes"] ?? "");
          if (notes) {
            const n = document.createElement("p");
            n.className = "text-sm mt-1";
            n.textContent = notes;
            root.append(n);
          }
          if (!species) {
            const p = document.createElement("p");
            p.className = "text-xs text-gray-500 mt-1";
            p.textContent = "Species not recorded yet. See the tree legend for this zone's species.";
            root.append(p);
          }
          new Popup({ offset: 14 }).setLngLat(e.lngLat).setDOMContent(root).addTo(map);
          return;
        }
        const pinId = Number(hit.properties["pinId"]);
        if (pinId > 0) { onSelectPinRef.current(pinId); return; }
        const root = document.createElement("div");
        root.className = "font-sans";
        const title = document.createElement("strong");
        title.textContent = String(hit.properties["name"] ?? "");
        root.append(title);
        // Plan structures say they're estimated; map footprints can carry their place's description
        const feature = hit.layer.id === "zoo-plan" ? undefined : featuresRef.current.find(f => f.id === hit.properties["id"]);
        const extra = hit.layer.id === "zoo-plan"
          ? `From the official site plan; position estimated. ${hit.properties["note"] ?? ""}`
          : feature ? describeRef.current?.(feature) : null;
        if (extra) {
          const p = document.createElement("p");
          p.className = "text-sm text-gray-600 mt-1";
          p.textContent = extra;
          root.append(p);
        }
        new Popup({ offset: 8 }).setLngLat(e.lngLat).setDOMContent(root).addTo(map);
      });
      map.on("mouseenter", CLICKABLE_LAYERS, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", CLICKABLE_LAYERS, () => { map.getCanvas().style.cursor = ""; });

      // Readout: coordinates and what is under the cursor (at most once per frame)
      let frame = 0;
      map.on("mousemove", e => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const hits = map.queryRenderedFeatures(e.point, {
            layers: ["zoo-tree-markers", "zoo-buildings", "zoo-fences", "zoo-tree-canopies", "zoo-route", "zoo-bridge", "zoo-plan", "zoo-enclosure-floor", "zoo-walkways", "zoo-walkways-edge", "zoo-walkways-closed", "zoo-ground", "zoo-water"],
          });
          const top = hits[0];
          // Open ground is checked against the zoo's outline
          let what = metresOutsideZoo(e.lngLat.lat, e.lngLat.lng) === 0 ? "Zoo grounds" : "Outside the zoo";
          if (top) {
            const p = top.properties;
            if (top.layer.id === "zoo-tree-markers") what = `${p["species"] || "Tree"} · ${p["zone"]}${p["status"] ? ` · ${p["status"]}` : ""}`;
            else if (top.layer.id === "zoo-route") what = "Your walking route";
            else if (top.layer.id === "zoo-tree-canopies") what = "Tree (illustrative)";
            else if (top.layer.id === "zoo-bridge") what = `${BRIDGE_NAME} · over the lagoon`;
            else if (top.layer.id === "zoo-plan") what = `${p["name"]} · from site plan (estimated)`;
            else if (top.layer.id.startsWith("zoo-walkways")) what = `Walkway · ${p["name"]}${p["open"] === false ? " (closed)" : ""}`;
            else {
              const kind = FEATURE_TYPES.find(t => t.type === p["type"])?.label ?? "Area";
              what = `${p["name"]} · ${kind}${Number(p["height"]) > 0 ? ` · ${Number(p["height"])} m` : ""}`;
            }
          }
          setReadout({ lat: e.lngLat.lat, lng: e.lngLat.lng, what });
        });
      });
      map.on("mouseout", () => setReadout(null));
      setLoaded(true);
    };
    // Build the model as soon as the style is ready. "load" waits for every street tile in view,
    // so one slow or blocked tile would otherwise leave the map without its 3D model
    if (map.isStyleLoaded()) setUp();
    else {
      map.once("style.load", setUp);
      map.once("load", setUp);
    }

    // Keep the canvas sized to its box (the page layout changes between phone and desktop)
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container);

    return () => {
      resize.disconnect();
      [...markersRef.current, ...labelsRef.current].forEach(m => m.remove());
      markersRef.current = [];
      labelsRef.current = [];
      visitorRef.current?.remove();
      visitorRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // The camera starts from the first center/zoom only; later moves go through flyTo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (mapRef.current?.getSource("zoo-features") as GeoJSONSource | undefined)?.setData(featureData(features));
    (mapRef.current?.getSource("zoo-fences") as GeoJSONSource | undefined)?.setData(fenceData(features));
  }, [loaded, features]);

  // Trees fill the open ground left by the live layout, so they follow any change made in the map editor
  useEffect(() => {
    if (!loaded) return;
    const trees = treeData(features, paths);
    (mapRef.current?.getSource("zoo-tree-trunks") as GeoJSONSource | undefined)?.setData(trees.trunks);
    (mapRef.current?.getSource("zoo-tree-canopies") as GeoJSONSource | undefined)?.setData(trees.canopies);
  }, [loaded, features, paths]);

  useEffect(() => {
    if (!loaded) return;
    (mapRef.current?.getSource("zoo-paths") as GeoJSONSource | undefined)?.setData(pathData(stripPaths(paths)));
    (mapRef.current?.getSource("zoo-paths-edge") as GeoJSONSource | undefined)?.setData(pathData(stripPaths(paths), WALK_EDGE_M));
    (mapRef.current?.getSource("zoo-bridge") as GeoJSONSource | undefined)?.setData(bridgeData(paths));
  }, [loaded, paths]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    (map.getSource("zoo-route") as GeoJSONSource | undefined)?.setData(routeData(route));
    // Straight-line hints (no walkway) are drawn faded so they don't look like a real path
    map.setPaintProperty("zoo-route", "fill-extrusion-opacity", route && !route.on_paths ? 0.55 : 1);
    // Tall enclosure walls would hide the route, so they turn see-through while one is shown
    map.setPaintProperty("zoo-buildings", "fill-extrusion-opacity", route ? 0.45 : 1);
    const coords = (route?.coordinates ?? []).map(([lat, lng]) => [lng!, lat!] as [number, number]);
    // Frame the route when a new destination is chosen, not on every re-plan while the visitor walks
    const fitKey = route ? `${route.from_pin_id}:${route.to_pin_id}` : null;
    if (coords.length >= 2 && fitKey !== framedRouteRef.current) {
      framedRouteRef.current = fitKey;
      const bounds = coords.reduce((b, c) => b.extend(c), new LngLatBounds(coords[0], coords[0]));
      // Once the map has settled (its size can still change as the page lays out), leaving room at
      // the bottom for the walking guide card
      const frame = () => map.fitBounds(bounds, { padding: { top: 90, bottom: 210, left: 40, right: 40 }, maxZoom: 19.5, duration: 800 });
      if (map.loaded()) setTimeout(frame, 300); else map.once("idle", frame);
    }
    if (!route) framedRouteRef.current = null;

    // Arrows lying flat on the ground, pointing the way to walk, and a flag at the destination
    routeMarkersRef.current.forEach(m => m.remove());
    routeMarkersRef.current = [];
    if (route && coords.length >= 2) {
      const points = route.coordinates.map(([lat, lng]) => [lat!, lng!] as [number, number]);
      if (route.on_paths) {
        for (const [lat, lng, bearing] of routeArrows(points)) {
          const el = document.createElement("div");
          el.setAttribute("aria-hidden", "true");
          el.style.pointerEvents = "none";
          el.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="11" fill="#2563eb" stroke="#fff" stroke-width="2"/><path d="M7 14l5-6 5 6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          routeMarkersRef.current.push(new Marker({ element: el, rotation: bearing, rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([lng, lat]).addTo(map));
        }
      }
      const flag = document.createElement("div");
      flag.setAttribute("aria-label", `Destination: ${route.to_name}`);
      flag.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:none";
      const label = document.createElement("div");
      label.style.cssText = "background:#dc2626;color:#fff;font:700 12px/1.2 system-ui,sans-serif;padding:3px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.35)";
      label.textContent = `🏁 ${route.to_name}`;
      flag.append(label);
      flag.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 24 32" width="28" height="36" style="filter:drop-shadow(0 3px 3px rgba(0,0,0,.35))"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>');
      routeMarkersRef.current.push(new Marker({ element: flag, anchor: "bottom" }).setLngLat(coords[coords.length - 1]!).addTo(map));
    }
    // Tree canopies would hide the route too
    map.setPaintProperty("zoo-tree-canopies", "fill-extrusion-opacity", route ? 0.4 : 1);
    map.setPaintProperty("zoo-tree-markers", "icon-opacity", route ? 0.45 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    for (const id of ["zoo-walkways", "zoo-walkways-closed"]) map.setLayoutProperty(id, "visibility", showWalkways ? "visible" : "none");
    // Kerbs in both looks, like the architectural model
    map.setLayoutProperty("zoo-walkways-edge", "visibility", showWalkways ? "visible" : "none");
  }, [loaded, showWalkways, arch]);

  useEffect(() => {
    if (!loaded) return;
    mapRef.current?.setLayoutProperty("zoo-tree-markers", "visibility", showTreeMarkers ? "visible" : "none");
  }, [loaded, showTreeMarkers]);

  // Trees added, edited or removed in Park Areas
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    addTreeIcons(map, treePoints);
    (map.getSource("zoo-tree-markers") as GeoJSONSource | undefined)?.setData(treeGeoJSON(treePoints));
  }, [loaded, treePoints]);

  // Facilities: one marker each, with a popup (photo, type, status, description)
  useEffect(() => {
    const map = mapRef.current;
    facilityMarkersRef.current.forEach(m => m.remove());
    facilityMarkersRef.current = [];
    if (!loaded || !map) return;
    const only = props.facilityIds ? new Set(props.facilityIds) : null;
    for (const f of (facilitiesQuery.data ?? []).filter(f => !only || only.has(f.id))) {
      const root = document.createElement("div");
      root.className = "font-sans max-w-[220px]";
      if (f.photo_url) {
        const img = document.createElement("img");
        img.src = f.photo_url; img.alt = ""; img.className = "mb-2 h-24 w-full rounded object-cover";
        root.append(img);
      }
      const title = document.createElement("strong");
      title.textContent = f.name;
      const meta = document.createElement("p");
      meta.className = "text-xs mt-0.5";
      meta.style.color = facilityStatus(f.status).color;
      meta.textContent = `${facilityType(f.type).label} · ${facilityStatus(f.status).label}`;
      root.append(title, meta);
      if (f.description) {
        const p = document.createElement("p");
        p.className = "text-sm text-gray-600 mt-1";
        p.textContent = f.description;
        root.append(p);
      }
      const el = facilityElement(f);
      // While picking a position, a click goes through to the map instead of opening the popup
      if (picking) el.style.pointerEvents = "none";
      const marker = new Marker({ element: el, anchor: "center" }).setLngLat([f.lng, f.lat]);
      if (!picking) marker.setPopup(new Popup({ offset: 16 }).setDOMContent(root));
      marker.addTo(map);
      // Faded while a walking route is shown, like the trees
      // Drafts (staff only) are faded like hidden places
      marker.getElement().style.opacity = f.is_active === false ? "0.45" : route ? "0.5" : f.status === "closed" ? "0.75" : "1";
      facilityMarkersRef.current.push(marker);
    }
    return () => { facilityMarkersRef.current.forEach(m => m.remove()); facilityMarkersRef.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, facilitiesQuery.data, route, picking, props.facilityIds?.join(",") ?? "all"]);

  const keepKey = keepFeatureIds?.join(",") ?? "all";
  useEffect(() => {
    if (!loaded) return;
    mapRef.current?.setPaintProperty("zoo-buildings", "fill-extrusion-color", buildingColor(selectedPinId, keepFeatureIds, look));
    mapRef.current?.setPaintProperty("zoo-fences", "fill-extrusion-color", fenceColor(selectedPinId, keepFeatureIds, look));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, selectedPinId, keepKey, look]);

  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    for (const id of ["zoo-buildings", "zoo-fences"]) {
      map.setPaintProperty(id, "fill-extrusion-height", buildingHeight(exaggeration, keepFeatureIds));
      map.setPaintProperty(id, "fill-extrusion-base", buildingBase(exaggeration, keepFeatureIds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, exaggeration, keepKey]);

  // Architectural (site model from the official plan, on a plain board) or realistic (natural
  // materials on the aerial photo): sky, sun, ground, surroundings, materials and which layers show.
  // In both, habitats are fenced yards and gardens lie flat; everything stands at true ground level.
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    const show = (id: string, on: boolean) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    const city = surroundings === "city";
    map.setSky(arch ? ARCH.sky : REAL.sky);
    map.setLight(arch ? ARCH.light : REAL.light);
    // The architectural model stands on a plain site board; "Show city" puts the street map under it
    show("osm", arch && city);
    show("satellite", !arch);
    map.setPaintProperty("zoo-outside", "fill-color", arch ? ARCH.outside : REAL.outside);
    map.setPaintProperty("zoo-outside", "fill-opacity", arch ? (city ? 0.35 : 1) : (city ? 0 : 0.55));
    show("zoo-site", arch);
    // Water: solid in the model; a light wash over the photo's real lagoon
    map.setPaintProperty("zoo-water", "fill-extrusion-color", arch ? ARCH.water : REAL.water);
    map.setPaintProperty("zoo-water", "fill-extrusion-opacity", arch ? 1 : 0.45);
    // Gardens and habitat yards: solid materials in the model; tints so the photo shows through
    map.setPaintProperty("zoo-ground", "fill-extrusion-color", arch ? ARCH.byType : REAL.byType);
    map.setPaintProperty("zoo-ground", "fill-extrusion-opacity", arch ? 1 : 0.3);
    map.setPaintProperty("zoo-enclosure-floor", "fill-extrusion-color", arch ? ARCH.enclosureFloor : REAL.enclosureFloor);
    map.setPaintProperty("zoo-enclosure-floor", "fill-extrusion-opacity", arch ? 1 : 0.3);
    // Walkways: concrete with kerbs in the model; a see-through concrete wash over the photo's real paths
    map.setPaintProperty("zoo-walkways", "fill-extrusion-color", arch ? ARCH.walk : REAL.walk);
    map.setPaintProperty("zoo-walkways", "fill-extrusion-opacity", arch ? 1 : 0.55);
    map.setFilter("zoo-buildings", ["all", [">", ["get", "height"], 0], ["!", ["in", ["get", "type"], ["literal", ["enclosure", "landscape"]]]]]);
    map.setFilter("zoo-ground", ["any", ["==", ["get", "type"], "landscape"], ["all", ["<=", ["get", "height"], 0], ["!=", ["get", "type"], "water"]]]);
    for (const id of ["zoo-buildings", "zoo-ground", "zoo-water", "zoo-fences", "zoo-enclosure-floor", "zoo-bridge"]) show(id, showBuildings);
    // The plan's extra structures and the trees show in both looks, so the 3D view has everything
    // the architectural view has
    for (const id of ["zoo-plan", "zoo-tree-trunks", "zoo-tree-canopies"]) show(id, showBuildings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, look, surroundings, showBuildings]);

  // Slow orbit; any drag, scroll or touch hands control back to the visitor
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !autoRotate) return;
    let raf = 0;
    const step = () => { map.setBearing(map.getBearing() + 0.12); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    const stop = () => setAutoRotate(false);
    map.on("mousedown", stop);
    map.on("touchstart", stop);
    map.on("wheel", stop);
    return () => {
      cancelAnimationFrame(raf);
      map.off("mousedown", stop);
      map.off("touchstart", stop);
      map.off("wheel", stop);
    };
  }, [loaded, autoRotate]);

  // Rebuild markers only when the pins themselves change, not on every render
  const pinsKey = pins.map(p => `${p.id}:${p.lat}:${p.lng}:${p.name}:${p.color}:${p.pin_type}:${p.hidden ? 1 : 0}:${(p.residents ?? []).map(r => r.name).join(",")}`).join("|");
  const heightsKey = features.map(f => `${f.map_pin_id}:${f.height_m}`).join("|");

  // Pins as HTML markers (they stay upright and clickable when the map is tilted)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    const editable = !!onMovePinRef.current;
    markersRef.current = pins.map(pin => {
      const el = pinElement(pin);
      if (pin.hidden) el.style.opacity = "0.45";
      let dragging = false;
      el.addEventListener("click", e => { e.stopPropagation(); if (!dragging) onSelectPinRef.current(pin.id); });
      const marker = new Marker({ element: el, draggable: editable }).setLngLat([pin.lng, pin.lat]).addTo(map);
      if (editable) {
        el.title = `${pin.name}${pin.hidden ? " (hidden)" : ""}: drag to move, click to edit`;
        marker.on("dragstart", () => { dragging = true; });
        marker.on("dragend", async () => {
          const { lat, lng } = marker.getLngLat();
          const ok = await onMovePinRef.current!(pin.id, Number(lat.toFixed(7)), Number(lng.toFixed(7)));
          if (!ok) marker.setLngLat([pin.lng, pin.lat]);
          // The click that ends a drag shouldn't also open the editor
          setTimeout(() => { dragging = false; }, 100);
        });
      }
      return marker;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsKey]);

  // While picking a position, clicks on a pin go through to the map (the spot under it is picked)
  useEffect(() => {
    markersRef.current.forEach(m => { m.getElement().style.pointerEvents = picking ? "none" : ""; });
  }, [picking, pinsKey]);

  // The dropped location pin (red), where the visitor tapped open ground
  const dropped = props.droppedPin ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (!dropped) { droppedRef.current?.remove(); droppedRef.current = null; return; }
    if (!droppedRef.current) {
      droppedRef.current = new Marker({ element: droppedPinElement(), anchor: "bottom" }).setLngLat([dropped.lng, dropped.lat]).addTo(map);
    } else {
      droppedRef.current.setLngLat([dropped.lng, dropped.lat]);
    }
  }, [loaded, dropped?.lat, dropped?.lng]);

  // Floating labels above exhibits (or every place)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    labelsRef.current.forEach(m => m.remove());
    // Places whose label an admin turned off (Map Management) never get one
    const labelled = pins.filter(p => (p as { show_label?: boolean }).show_label !== false);
    const shown = labelMode === "off" ? [] : labelMode === "exhibits" ? labelled.filter(p => p.pin_type === "animal") : labelled;
    labelsRef.current = shown.map(pin => {
      const h = featuresRef.current.find(f => f.map_pin_id === pin.id)?.height_m ?? 0;
      const n = pin.residents?.length ?? 0;
      const subtitle = n > 0
        ? `${PIN_KIND[pin.pin_type] ?? "Place"} · ${n} ${n === 1 ? "animal" : "animals"}`
        : `${PIN_KIND[pin.pin_type] ?? "Place"}${h > 0 ? ` · ${h} m` : ""}`;
      return new Marker({ element: labelElement(pin.name, subtitle), anchor: "bottom", offset: [0, -9] })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsKey, heightsKey, labelMode]);

  // The visitor's blue dot (with a soft pulse)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!visitor) { visitorRef.current?.remove(); visitorRef.current = null; return; }
    if (!visitorRef.current) {
      const el = document.createElement("div");
      el.setAttribute("aria-label", "You are here");
      el.style.cssText = "position:relative;width:22px;height:22px;pointer-events:none";
      el.innerHTML = '<span style="position:absolute;inset:-9px;border-radius:50%;background:rgba(37,99,235,.25);animation:visitor-pulse 1.8s ease-out infinite"></span>'
        + '<span style="position:absolute;inset:0;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"></span>';
      visitorRef.current = new Marker({ element: el }).setLngLat([visitor.lng, visitor.lat]).addTo(map);
    } else {
      visitorRef.current.setLngLat([visitor.lng, visitor.lat]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitor?.lat, visitor?.lng]);

  // Animated walking footsteps along the route (live navigation), lying flat on the ground and
  // turned with the map, so they follow the walkway in any camera angle
  const footsteps = props.footsteps;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !footsteps || footsteps.length < 2) return;
    const markers: Marker[] = [];
    const stop = startFootstepTrail(footsteps, {
      metresPerPixel: () => maplibreMetresPerPixel(map.getCenter().lat, map.getZoom()),
      render: prints => {
        while (markers.length < prints.length) {
          const p = prints[markers.length]!;
          markers.push(new Marker({ element: footprintElement(), rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([p.lng, p.lat]).addTo(map));
        }
        markers.forEach((m, i) => {
          const p = prints[i];
          if (p) m.setLngLat([p.lng, p.lat]).setRotation(p.bearing);
          styleFootprint(m.getElement(), p, false);
        });
      },
    });
    return () => { stop(); markers.forEach(m => m.remove()); };
  }, [loaded, footsteps]);


  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = picking ? "crosshair" : "";
  }, [picking]);

  useEffect(() => {
    if (!flyTo) return;
    mapRef.current?.flyTo({ center: [flyTo[1], flyTo[0]], zoom: 19, pitch: START_PITCH });
  }, [flyTo]);

  // Where the camera opens and resets: framing the whole zoo, or the page's own spot
  function homeCamera(): { center: [number, number]; zoom: number } {
    const el = containerRef.current;
    if (props.fitZoo && el && el.clientWidth > 0 && el.clientHeight > 0) return zooHomeCamera(el.clientWidth, el.clientHeight);
    return { center: [center[1], center[0]], zoom: zoom - ZOOM_OUT };
  }

  const resetView = (duration = 1200) => {
    setAutoRotate(false);
    mapRef.current?.easeTo({ ...homeCamera(), pitch: START_PITCH, bearing: START_BEARING, duration });
  };

  const resetSignal = props.resetSignal ?? 0;
  useEffect(() => {
    if (resetSignal) resetView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // When the map frames the whole zoo, zooming out stops a little past that frame (for this screen
  // size), so the zoo stays the main thing on screen instead of shrinking into the surrounding city
  // and water. Recomputed when the map is resized (rotating a phone, opening a side panel).
  useEffect(() => {
    const map = mapRef.current, el = containerRef.current;
    if (!props.fitZoo || !map || !el) return;
    const apply = () => {
      if (el.clientWidth <= 0 || el.clientHeight <= 0) return;
      map.setMinZoom(Math.max(MIN_ZOOM, zooHomeCamera(el.clientWidth, el.clientHeight).zoom - ZOOM_OUT_SLACK));
    };
    apply();
    map.on("resize", apply);
    return () => { map.off("resize", apply); };
  }, [props.fitZoo]);

  const walkway = stats.walkwayM >= 1000 ? { v: (stats.walkwayM / 1000).toFixed(2), u: "km" } : { v: Math.round(stats.walkwayM).toString(), u: "m" };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className={`h-full w-full ${arch ? "bg-[#f2f0eb]" : "bg-[#dfe8ec]"}`} />

      {/* Viewing angles: one tap instead of right-dragging (which phones can't do); on phones the
          walking guide card takes this corner while a route is shown */}
      <div role="group" aria-label="View angle" className={`absolute bottom-10 right-3 z-10 flex-col gap-1 rounded-xl border bg-card/95 p-1 shadow-lg backdrop-blur ${route ? "hidden md:flex" : "flex"}`}>
        {[
          { label: "Tilted", pitch: START_PITCH, bearing: START_BEARING },
          { label: "Top-down", pitch: 0, bearing: 0 },
          { label: "Low angle", pitch: 75, bearing: START_BEARING },
        ].map(v => (
          <button key={v.label} type="button"
            onClick={() => mapRef.current?.easeTo({ pitch: v.pitch, bearing: v.bearing, duration: 800 })}
            className="rounded-lg px-2.5 py-1 text-xs font-medium hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            {v.label}
          </button>
        ))}
        <button type="button"
          onClick={() => resetView(1000)}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          Reset
        </button>
      </div>

      {/* Interaction hints */}
      <div className={`pointer-events-none absolute right-3 top-36 hidden text-right text-xs leading-5 sm:block ${arch ? "text-slate-600" : "text-white/85 drop-shadow"}`}>
        <div>Drag · pan</div>
        <div>Right-drag · tilt &amp; orbit</div>
        <div>Scroll · zoom</div>
      </div>

      {/* Model panel. Open, it's taller than a phone's map, so it stops above the map's bottom edge
          and its settings scroll inside it (the title row stays put to close it again) */}
      <div className={`absolute left-3 top-16 z-10 flex max-h-[calc(100%-5rem)] flex-col rounded-xl border border-border bg-card/95 text-card-foreground shadow-2xl backdrop-blur ${panelOpen ? "w-[min(18rem,calc(100%-1.5rem))]" : "w-auto"}`}>
        <button
          type="button"
          onClick={() => setPanelOpen(o => !o)}
          aria-expanded={panelOpen}
          className="flex w-full shrink-0 items-center justify-between gap-2 px-4 pt-3 pb-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded-xl"
        >
          <span>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{arch ? "Architectural view" : "3D view"} · Malate, Manila</span>
            <span className="block text-xl font-bold leading-tight">Manila Zoo</span>
          </span>
          {panelOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {panelOpen && (
          // overscroll-contain: reaching the end of the list doesn't start scrolling the page
          <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 [touch-action:pan-y]">

            <p className="text-xs leading-relaxed text-muted-foreground">
              {arch
                ? "A site model of the Manila Zoological & Botanical Garden following the official site plan. Buildings, habitats, walkways and the lagoon use the map's surveyed outlines at true height."
                : "The Manila Zoological & Botanical Garden in 3D on an aerial photo. Buildings stand at their real heights, and enclosures show as fenced yards."}
            </p>
            {(
              <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Estimated from the plan: the cascading fountain, parking and Guard House 2. The round model trees
                are illustrative; the coloured tree markers come from the site plan{props.treeLegend ? " (see Tree legend)" : ""}.
                Click one for details.
              </p>
            )}

            <dl className="grid grid-cols-3 gap-2 border-y border-border py-3 font-mono tabular-nums">
              <div>
                <dt className="sr-only">Area</dt>
                <dd className="text-base font-semibold">{ZOO_AREA_HA.toFixed(1)} <span className="text-xs text-muted-foreground">ha</span></dd>
                <dd className="font-sans text-[11px] text-muted-foreground">Area</dd>
              </div>
              <div>
                <dt className="sr-only">Exhibits</dt>
                <dd className="text-base font-semibold">{stats.exhibits}</dd>
                <dd className="font-sans text-[11px] text-muted-foreground">Exhibits</dd>
              </div>
              <div>
                <dt className="sr-only">Walkways</dt>
                <dd className="text-base font-semibold">{walkway.v} <span className="text-xs text-muted-foreground">{walkway.u}</span></dd>
                <dd className="font-sans text-[11px] text-muted-foreground">Walkways</dd>
              </div>
            </dl>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label htmlFor="zoo3d-exaggeration" className="text-sm font-medium">Height exaggeration</label>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{exaggeration.toFixed(1)}×</span>
              </div>
              <input
                id="zoo3d-exaggeration"
                type="range"
                min={1}
                max={5}
                step={0.5}
                value={exaggeration}
                onChange={e => setExaggeration(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div>
              <div className="mb-1.5 text-sm font-medium" id="zoo3d-labels">Labels</div>
              <div role="group" aria-labelledby="zoo3d-labels" className="grid grid-cols-3 overflow-hidden rounded-md border border-border font-mono text-xs">
                {(["off", "exhibits", "all"] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={labelMode === m}
                    onClick={() => setLabelMode(m)}
                    className={`py-1.5 capitalize transition-colors ${labelMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-sm font-medium" id="zoo3d-look">Look</div>
              <div role="group" aria-labelledby="zoo3d-look" className="grid grid-cols-2 overflow-hidden rounded-md border border-border font-mono text-xs">
                {([["architectural", "Architectural"], ["realistic", "Realistic"]] as const).map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={look === value}
                    onClick={() => setLook(value)}
                    className={`py-1.5 transition-colors ${look === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-sm font-medium" id="zoo3d-surroundings">Surroundings</div>
              <div role="group" aria-labelledby="zoo3d-surroundings" className="grid grid-cols-2 overflow-hidden rounded-md border border-border font-mono text-xs">
                {([["model", "Model only"], ["city", "Show city"]] as const).map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={surroundings === value}
                    onClick={() => setSurroundings(value)}
                    className={`py-1.5 transition-colors ${surroundings === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => resetView()}
                className="flex items-center justify-center gap-1.5 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <LocateFixed className="h-4 w-4" /> Reset view
              </button>
              <button
                type="button"
                aria-pressed={autoRotate}
                onClick={() => setAutoRotate(r => !r)}
                className={`flex items-center justify-center gap-1.5 rounded-full border py-2 text-sm font-semibold transition-colors ${autoRotate ? "border-primary bg-primary/15 text-primary" : "border-primary/60 text-primary hover:bg-primary/10"}`}
              >
                <RotateCw className="h-4 w-4" /> {autoRotate ? "Stop" : "Auto-rotate"}
              </button>
            </div>

            <div>
              <div className="mb-1.5 font-mono text-[10px] tracking-[0.18em] text-muted-foreground">FEATURE TYPES</div>
              <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                {FEATURE_TYPES.map(t => (
                  <li key={t.type} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: arch ? t.arch : t.color }} /> {t.label}
                  </li>
                ))}
              </ul>
              {stats.tallest && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Tallest: <span className="text-foreground">{stats.tallest.name}</span>{" "}
                  <span className="font-mono tabular-nums">{stats.tallest.height_m} m</span>
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tree survey legend (zones and species from the site plan); a side panel or a bottom sheet.
          Staff map tools only: the visitor map shows the trees without the legend. */}
      {props.treeLegend && (
        <TreeLegend
          open={treeLegendOpen} onOpen={() => setTreeLegendOpen(true)} onClose={() => setTreeLegendOpen(false)}
          showMarkers={showTreeMarkers} onShowMarkers={setShowTreeMarkers} counts={treeCounts} zones={legendZones}
        />
      )}

      {/* Hover readout */}
      {readout && (
        <div className="pointer-events-none absolute bottom-16 left-3 z-10 rounded-lg border border-border bg-card/95 px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground shadow-lg">
          <div>
            <span className="text-muted-foreground">N</span> <span className="text-foreground">{readout.lat.toFixed(5)}°</span>{" "}
            <span className="text-muted-foreground">E</span> <span className="text-foreground">{readout.lng.toFixed(5)}°</span>
          </div>
          <div className="mt-0.5 font-sans text-foreground">{readout.what}</div>
        </div>
      )}
    </div>
  );
}
