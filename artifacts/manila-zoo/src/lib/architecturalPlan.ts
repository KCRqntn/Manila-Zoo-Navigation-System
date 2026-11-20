/**
 * What the 3D map's Architectural view adds from the official site plan of Manila Zoo
 * ("Plan on Site", Animal Enclosure – Habitat I – Indoor Reptile House, A. Moreta & Co., Inc.).
 *
 * The plan is a drawing without coordinates, so nothing here is surveyed. The map's own layout
 * (places, buildings, enclosures, walkways in the database) comes from OpenStreetMap outlines and
 * stays the reference: it already matches the plan's arrangement (Savanna at the Quirino × A. Mabini
 * corner, the elephant & hippo habitat, parking and gates along Quirino, the lagoon with its island in
 * the middle, the veterinary hospital and Material Recovery Facility on the east side). This file only
 * adds what the plan shows and the database lacks, placed relative to that geometry:
 *
 * - PLAN_STRUCTURES: estimated footprints, each with a note saying what it was placed against
 *   (see "Estimated structures" below for how the plan photo was georeferenced and how far to trust it).
 * - planTrees(): illustrative trees in the open ground between buildings, enclosures and walkways,
 *   as the plan's planting legend (botanical left side, middle botanical part, endemic right side)
 *   shows trees throughout. Their positions are not individual surveyed trees.
 *
 * None of this is saved to the database, routed over or used for the zoo boundary check.
 */
import { ZOO_BOUNDARY } from "./zooBoundary";

type LngLat = [number, number];

export type PlanStructure = {
  name: string;
  kind: "water" | "paving" | "building" | "facility";
  /** Polygon ring, [lng, lat] */
  ring: LngLat[];
  heightM: number;
  /** How the position was estimated */
  note: string;
};

// ─── Local metre grid around the zoo ─────────────────────────────────────────────────────────

const M_PER_DEG = 111_320;
const LAT0 = 14.5648;
const COS0 = Math.cos((LAT0 * Math.PI) / 180);
const toM = ([lng, lat]: LngLat) => [lng * M_PER_DEG * COS0, lat * M_PER_DEG] as const;
const fromM = (x: number, y: number): LngLat => [x / (M_PER_DEG * COS0), y / M_PER_DEG];

/** An ellipse with radii `rx`×`ry` metres, turned `deg` anticlockwise from east. */
function ellipse([lng, lat]: LngLat, rx: number, ry: number, deg = 0, sides = 20): LngLat[] {
  const [cx, cy] = toM([lng, lat]);
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const ring: LngLat[] = [];
  for (let i = 0; i <= sides; i++) {
    const t = ((i % sides) / sides) * 2 * Math.PI;
    const x = Math.cos(t) * rx, y = Math.sin(t) * ry;
    ring.push(fromM(cx + x * c - y * s, cy + x * s + y * c));
  }
  return ring;
}

/**
 * A strip `widthM` wide running parallel to the zoo fence, `insetM` inside it, between the fence
 * points nearest to `from` and `to`. Used for features the plan draws along the fence line.
 */
function fenceStrip(from: LngLat, to: LngLat, insetM: number, widthM: number): LngLat[] {
  const fence = ZOO_BOUNDARY.map(c => toM(c));
  // Position along the fence (segment index + fraction) nearest to a point
  const along = (p: LngLat) => {
    const [px, py] = toM(p);
    let best = { d: Infinity, s: 0 };
    for (let i = 1; i < fence.length; i++) {
      const [ax, ay] = fence[i - 1]!, [bx, by] = fence[i]!;
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d < best.d) best = { d, s: i - 1 + t };
    }
    return best.s;
  };
  const at = (s: number) => {
    const i = Math.min(Math.floor(s), fence.length - 2), t = s - i;
    const [ax, ay] = fence[i]!, [bx, by] = fence[i + 1]!;
    return [ax + t * (bx - ax), ay + t * (by - ay)] as const;
  };
  let [s0, s1] = [along(from), along(to)];
  if (s0 > s1) [s0, s1] = [s1, s0];
  const line = [at(s0), ...fence.slice(Math.floor(s0) + 1, Math.floor(s1) + 1), at(s1)];
  // Inward normal: whichever side of the first segment lies inside the fence
  const offset = (d: number) => line.map((p, i) => {
    const a = line[Math.max(0, i - 1)]!, b = line[Math.min(line.length - 1, i + 1)]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    const mid = line[0]!, probe = [mid[0] + nx, mid[1] + ny] as const;
    if (!inRing(probe, fence)) { nx = -nx; ny = -ny; }
    return fromM(p[0] + nx * d, p[1] + ny * d);
  });
  const outer = offset(insetM), inner = offset(insetM + widthM).reverse();
  return [...outer, ...inner, outer[0]!];
}

// ─── Estimated structures from the plan ──────────────────────────────────────────────────────
//
// Placed by georeferencing a photo of the plan to the surveyed fence (a perspective fit on 11
// landmarks: the four corners, Aviary, Center Island, Elephant & Hippo habitat, Savanna, Philippine
// Endemic, Veterinary Hospital, Material Recovery Facility). The plan is marked NTS (not to scale):
// the fit is within ~3–10 m around the gate and the Quirino side, but up to ~45 m off on the
// A. Mabini and estero sides, so only the gate-side structures are taken from it, and each is
// anchored to surveyed geometry rather than to the plan's coordinates.

// Guard House 1 on the plan is the map's surveyed "Gate house" (centre 120.9888513, 14.5657486,
// within 10 m of where the plan puts it); Guard House 2 stands northwest of it, by the vehicle gate.

export const PLAN_STRUCTURES: PlanStructure[] = [
  {
    name: "Cascading Fountain",
    kind: "water",
    // The plan's channel runs ~45 m along the Quirino fence beside the service road. The surveyed
    // elephant & hippo habitat comes within ~6 m of the fence there, so it sits in that gap.
    ring: fenceStrip([120.9878056, 14.565471], [120.9880693, 14.5657951], 2, 2.2),
    heightM: 0.5,
    note: "Channel along the Quirino Avenue fence, beside the service road, as on the plan. The plan draws it farther from the fence; it's moved into the gap the surveyed elephant & hippo habitat leaves.",
  },
  {
    name: "Parking",
    kind: "paving",
    ring: [[120.98853, 14.565745], [120.988355, 14.565858], [120.98842, 14.566075], [120.98864, 14.565925], [120.98853, 14.565745]],
    heightM: 0.05,
    note: "Parking lot between the reception plaza, the Driver's Lounge and the gate, as on the plan; trimmed to stay clear of the surveyed service building, plaza canopy and gate walk.",
  },
  {
    name: "Guard House 2",
    kind: "facility",
    ring: ellipse([120.9887157, 14.5659191], 3, 3, 0, 16),
    heightM: 3,
    note: "Round guard house at the vehicle gate, as on the plan, placed from the georeferenced plan (about ±10 m). Guard House 1 is the map's Gate house.",
  },
];

// ─── Footbridge over the lagoon ──────────────────────────────────────────────────────────────
//
// A timber footbridge across the narrow arm of the lagoon in front of the Primates exhibit (the gap
// between its two wings faces the water there; the arm is ~5 m wide and runs east-north-east).
// The bridge is a real walkway: the database walkway named BRIDGE_NAME (two points, one on each bank)
// is what routing uses, and the 3D model draws this arched deck along it instead of a concrete strip.
// The walkways leading to it are "Primates lakeside walk" (from the South walk) and "Lagoon footbridge
// link" (to the Food Court restroom walk).

export type BridgePart = { ring: LngLat[]; base: number; top: number; part: "deck" | "rail" };

export const BRIDGE_NAME = "Lagoon footbridge";
const BRIDGE_WIDTH_M = 3;
const BRIDGE_RISE_M = 0.8;
const BRIDGE_DECK_M = 0.3;
const BRIDGE_RAIL_M = 0.9;
const BRIDGE_RAIL_WIDTH_M = 0.12;
const BRIDGE_SEGMENTS = 10;

/** Deck slabs stepping up to the middle of the arch, with a railing along each side, from bank `a` to bank `b`. */
export function bridgeParts(a: LngLat, b: LngLat): BridgePart[] {
  const [ax, ay] = toM(a), [bx, by] = toM(b);
  const L = Math.hypot(bx - ax, by - ay);
  if (L < 1) return [];
  const ux = (bx - ax) / L, uy = (by - ay) / L;
  const cx = (ax + bx) / 2, cy = (ay + by) / 2;
  // A rectangle in the bridge's own frame: `s` along the span, `t` across it, in metres from the centre
  const quad = (s0: number, s1: number, t0: number, t1: number): LngLat[] => {
    const at = (s: number, t: number) => fromM(cx + s * ux - t * uy, cy + s * uy + t * ux);
    return [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1), at(s0, t0)];
  };
  const W = BRIDGE_WIDTH_M;
  const rise = (s: number) => BRIDGE_RISE_M * (1 - (2 * s / L) ** 2);
  const parts: BridgePart[] = [];
  for (let i = 0; i < BRIDGE_SEGMENTS; i++) {
    const s0 = -L / 2 + (i * L) / BRIDGE_SEGMENTS, s1 = s0 + L / BRIDGE_SEGMENTS;
    const top = BRIDGE_DECK_M + rise((s0 + s1) / 2);
    parts.push({ ring: quad(s0, s1, -W / 2, W / 2), base: Math.max(0, top - BRIDGE_DECK_M), top, part: "deck" });
    for (const side of [-1, 1]) {
      const t0 = side * (W / 2 - BRIDGE_RAIL_WIDTH_M), t1 = side * (W / 2);
      parts.push({ ring: quad(s0, s1, Math.min(t0, t1), Math.max(t0, t1)), base: top, top: top + BRIDGE_RAIL_M, part: "rail" });
    }
  }
  return parts;
}

// ─── Geometry tests ──────────────────────────────────────────────────────────────────────────

function inRing(p: readonly [number, number], ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToLine(p: readonly [number, number], line: readonly (readonly [number, number])[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!, [bx, by] = line[i]!;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)));
  }
  return best;
}

// ─── Illustrative trees ──────────────────────────────────────────────────────────────────────

export type PlanTree = { lng: number; lat: number; radiusM: number; trunkM: number; topM: number; shade: number };

type Shape = { type: string; ring: number[][] };

/** Small seeded random numbers, so the trees stand in the same places on every visit. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 2 ** 32;
  };
}

const TREE_SPACING_M = 10;
const WALK_CLEAR_M = 3.2;  // keeps canopies off the 4 m walkways
const FENCE_CLEAR_M = 2;

/**
 * Trees in the zoo's open ground: gardens and islands get them, and so do the leftover spaces
 * between exhibits, but never inside a building, an enclosure, the water, a walkway or a plan
 * structure. `shapes` are the map's footprints; `walkways` its walkway centre lines, [lng, lat].
 */
export function planTrees(shapes: Shape[], walkways: number[][][]): PlanTree[] {
  const rand = seeded(20221104);
  const fence = ZOO_BOUNDARY.map(c => toM(c));
  const blocked = [
    ...shapes.filter(s => s.type !== "landscape").map(s => s.ring.map(c => toM(c as LngLat))),
    ...PLAN_STRUCTURES.map(s => s.ring.map(toM)),
  ];
  const walks = walkways.map(w => w.map(c => toM(c as LngLat)));
  const xs = fence.map(c => c[0]), ys = fence.map(c => c[1]);
  const trees: PlanTree[] = [];
  for (let x = Math.min(...xs); x < Math.max(...xs); x += TREE_SPACING_M) {
    for (let y = Math.min(...ys); y < Math.max(...ys); y += TREE_SPACING_M) {
      const p = [x + (rand() - 0.5) * 7, y + (rand() - 0.5) * 7] as const;
      const radius = 2.2 + rand() * 1.6;
      const shade = Math.floor(rand() * 3);
      const tall = rand();
      if (!inRing(p, fence) || distToLine(p, fence) < FENCE_CLEAR_M + radius * 0.5) continue;
      if (walks.some(w => distToLine(p, w) < WALK_CLEAR_M + radius * 0.6)) continue;
      if (blocked.some(b => inRing(p, b) || distToLine(p, b) < radius * 0.8)) continue;
      const [lng, lat] = fromM(p[0], p[1]);
      const trunk = 2 + tall * 1.2;
      trees.push({ lng, lat, radiusM: radius, trunkM: trunk, topM: trunk + 3.5 + tall * 4, shade });
    }
  }
  return trees;
}

export { ellipse as planEllipse };
