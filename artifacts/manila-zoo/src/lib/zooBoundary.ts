/**
 * Outline of the Manila Zoological & Botanical Garden (5.5 ha), [lng, lat].
 * From OpenStreetMap way 22739717 (© OpenStreetMap contributors, ODbL), surveyed 2022-04-11.
 */
export const ZOO_BOUNDARY: [number, number][] = [
  [120.9869537, 14.5650118],
  [120.9878686, 14.5633123],
  [120.9879275, 14.5633431],
  [120.9880007, 14.5632367],
  [120.9888273, 14.5637576],
  [120.9890451, 14.5641656],
  [120.9895573, 14.5644448],
  [120.9895682, 14.5645414],
  [120.9895764, 14.5646152],
  [120.9895237, 14.5646393],
  [120.9895487, 14.5647065],
  [120.9896417, 14.564798],
  [120.9898389, 14.5648279],
  [120.9901788, 14.5648144],
  [120.990073, 14.5650136],
  [120.9888358, 14.5658886],
  [120.9884148, 14.5661863],
  [120.9881854, 14.5658747],
  [120.988014, 14.5656695],
  [120.98787, 14.5655339],
  [120.9875854, 14.565306],
  [120.9869537, 14.5650118],
];

const M_PER_DEG = 111_320;

/** Distance in metres from a point to the zoo's outline (0 when the point is inside). */
export function metresOutsideZoo(lat: number, lng: number): number {
  let inside = false;
  let nearest = Infinity;
  const cos = Math.cos((lat * Math.PI) / 180);
  for (let i = 0, j = ZOO_BOUNDARY.length - 1; i < ZOO_BOUNDARY.length; j = i++) {
    const [xi, yi] = ZOO_BOUNDARY[i]!, [xj, yj] = ZOO_BOUNDARY[j]!;
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    // Distance to this edge, in a local metre grid
    const ax = (xj - lng) * M_PER_DEG * cos, ay = (yj - lat) * M_PER_DEG;
    const bx = (xi - lng) * M_PER_DEG * cos, by = (yi - lat) * M_PER_DEG;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return inside ? 0 : nearest;
}

/** Positions this close outside the fence still count (the gate is on the edge, and GPS drifts). */
export const ZOO_EDGE_TOLERANCE_M = 40;

/** Whether a position counts as inside Manila Zoo. The server checks the same rule (api-server/src/lib/zooBoundary.ts). */
export function isInsideZoo(loc: { lat: number | string; lng: number | string }): boolean {
  const lat = Number(loc.lat), lng = Number(loc.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && metresOutsideZoo(lat, lng) <= ZOO_EDGE_TOLERANCE_M;
}

const LNGS = ZOO_BOUNDARY.map(c => c[0]), LATS = ZOO_BOUNDARY.map(c => c[1]);

/** The middle of the zoo, [lat, lng]: where the map opens when it has nothing better. */
export const ZOO_CENTER: [number, number] = [(Math.min(...LATS) + Math.max(...LATS)) / 2, (Math.min(...LNGS) + Math.max(...LNGS)) / 2];

/**
 * What the 2D and 3D maps frame when they open (and on "Reset view"), [[south, west], [north, east]]:
 * every exhibit, walkway, facility and landmark, from the parking and Butterfly Garden in the
 * north-east to the Philippine Endemic exhibit in the west. The fence's empty southern tip along the
 * estero is left to panning, so the view sits slightly up and to the right of the fence's middle.
 */
export const ZOO_VIEW_BOX: [[number, number], [number, number]] = [[14.56372, 120.98700], [14.56618, 120.99018]];

/** The middle of ZOO_VIEW_BOX, [lat, lng] */
export const ZOO_VIEW_CENTER: [number, number] = [
  (ZOO_VIEW_BOX[0][0] + ZOO_VIEW_BOX[1][0]) / 2,
  (ZOO_VIEW_BOX[0][1] + ZOO_VIEW_BOX[1][1]) / 2,
];

/** ZOO_VIEW_BOX's size in metres, [width east-west, height north-south] */
export const ZOO_VIEW_SIZE_M: [number, number] = [
  (ZOO_VIEW_BOX[1][1] - ZOO_VIEW_BOX[0][1]) * M_PER_DEG * Math.cos((ZOO_VIEW_CENTER[0] * Math.PI) / 180),
  (ZOO_VIEW_BOX[1][0] - ZOO_VIEW_BOX[0][0]) * M_PER_DEG,
];

/**
 * How far the map can be panned: the zoo plus a margin of `padM` metres, [[south, west], [north, east]].
 * The margin only keeps the fence from touching the screen edge; nothing outside the zoo is shown on it.
 */
export function zooBounds(padM = 120): [[number, number], [number, number]] {
  const padLat = padM / M_PER_DEG, padLng = padM / (M_PER_DEG * Math.cos((ZOO_CENTER[0] * Math.PI) / 180));
  return [[Math.min(...LATS) - padLat, Math.min(...LNGS) - padLng], [Math.max(...LATS) + padLat, Math.max(...LNGS) + padLng]];
}

/** Shown when live walking navigation is on but the visitor's GPS says they're outside the zoo. */
export const WALKING_GUIDE_OUTSIDE_TEXT = {
  en: "Please enter Manila Zoo to use the interactive walking navigation guide.",
  fil: "Pumasok muna sa Manila Zoo para magamit ang interactive na gabay sa paglalakad.",
};

export const OUTSIDE_ZOO_TEXT = {
  en: "You are currently outside Manila Zoo. Please enter the zoo to access the interactive navigation guide.",
  fil: "Nasa labas ka ng Manila Zoo. Pumasok muna sa zoo para magamit ang interactive navigation guide.",
};
