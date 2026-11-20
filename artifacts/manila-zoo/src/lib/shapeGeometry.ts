/**
 * Moving and rotating map shapes (Map Management). Coordinates are GeoJSON [lng, lat]; the maths
 * runs in a local metre grid around the shape, which is exact enough at the scale of one zoo.
 */

type Pt = number[]; // [lng, lat]
const M = 111_320;

/** The middle of a set of points (their average; good enough to rotate or move a footprint around). */
export function centerOf(points: Pt[]): [number, number] {
  // A closed ring repeats its first point at the end; don't count it twice
  const pts = points.length > 1 && points[0]![0] === points[points.length - 1]![0] && points[0]![1] === points[points.length - 1]![1]
    ? points.slice(0, -1) : points;
  const lng = pts.reduce((s, p) => s + p[0]!, 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1]!, 0) / pts.length;
  return [lng, lat];
}

/** Rotates points clockwise (as on a compass) by `degrees` around `center`. */
export function rotatePoints(points: Pt[], degrees: number, center: [number, number] = centerOf(points)): Pt[] {
  if (!degrees) return points.map(p => [p[0]!, p[1]!]);
  const [cx, cy] = center;
  const cos = Math.cos((cy * Math.PI) / 180);
  const a = (-degrees * Math.PI) / 180; // clockwise on the map = negative in maths
  return points.map(([lng, lat]) => {
    const x = (lng! - cx) * M * cos, y = (lat! - cy) * M;
    const rx = x * Math.cos(a) - y * Math.sin(a), ry = x * Math.sin(a) + y * Math.cos(a);
    return [round7(cx + rx / (M * cos)), round7(cy + ry / M)];
  });
}

/** Moves points by a difference in longitude and latitude. */
export function translatePoints(points: Pt[], dLng: number, dLat: number): Pt[] {
  return points.map(([lng, lat]) => [round7(lng! + dLng), round7(lat! + dLat)]);
}

const round7 = (n: number) => Math.round(n * 1e7) / 1e7;
