/**
 * Outline of the Manila Zoological & Botanical Garden (5.5 ha), [lng, lat].
 * From OpenStreetMap way 22739717 (© OpenStreetMap contributors, ODbL), surveyed 2022-04-11.
 * Copied from the web app (artifacts/manila-zoo/src/lib/zooBoundary.ts) so the server can check
 * whether a visitor's reported position is inside the zoo before routing from it, and so every
 * place, building and walkway saved to the map stays inside the fence. Keep the two copies equal.
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

/** Whether a position counts as inside Manila Zoo. Everything the navigator shows or routes must pass this. */
export function isInsideZoo(lat: unknown, lng: unknown): boolean {
  const la = Number(lat), ln = Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln) && metresOutsideZoo(la, ln) <= ZOO_EDGE_TOLERANCE_M;
}

/** Keeps only the places inside the zoo, so a stray record can never become a destination. */
export const insideZoo = <T extends { lat: unknown; lng: unknown }>(places: T[]): T[] => places.filter(p => isInsideZoo(p.lat, p.lng));

/**
 * The first [lng, lat] of a GeoJSON Polygon or LineString that lies outside the zoo, or null when the
 * whole shape is inside. Buildings and walkways are checked with this before they're saved.
 */
export function pointOutsideZoo(geometry: unknown): [number, number] | null {
  const coords = (geometry as { coordinates?: unknown } | null)?.coordinates;
  const points: unknown[] = [];
  const collect = (v: unknown) => {
    if (!Array.isArray(v)) return;
    if (typeof v[0] === "number") points.push(v);
    else v.forEach(collect);
  };
  collect(coords);
  for (const p of points) {
    const [lng, lat] = p as [number, number];
    if (!isInsideZoo(lat, lng)) return [lng, lat];
  }
  return null;
}

export const OUTSIDE_ZOO_MESSAGE = "You are currently outside Manila Zoo. Please enter the zoo to access the interactive navigation guide.";
