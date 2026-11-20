/**
 * Walking directions over the admin-drawn walkways (map_paths).
 *
 * Shared with the website: the AI Guide's offline mode (manila-zoo/src/lib/offlineChat.ts) imports
 * this file, so phones without signal plan routes with exactly the same rules. Keep it free of
 * server-only imports.
 *
 * 1. Walkway vertices become graph nodes; vertices within SNAP_M of each other are merged so
 *    walkways drawn separately still connect. Closed walkways (and, on request, walkways that
 *    are not wheelchair accessible) are left out, so closures change routes immediately.
 * 2. The start and destination pins attach to their nearest node, and Dijkstra's algorithm
 *    finds the shortest path by distance.
 * 3. The path is turned into turn-by-turn steps in English or Tagalog.
 */

/** The walkway fields routing reads (a map_paths row on the server, a layout path on the website). */
export interface MapPath {
  name: string | null;
  isOpen: boolean;
  isAccessible: boolean;
  /** Published; an unpublished (draft) walkway is never routed along. Missing counts as published. */
  isActive?: boolean;
  geometry: { coordinates: number[][] };
}

export interface RoutePlace { id: number; name: string; lat: number; lng: number }

/** Map pins store lat/lng as numeric strings; convert one to a routing place. */
export const toPlace = (p: { id: number; name: string; lat: string; lng: string }): RoutePlace =>
  ({ id: p.id, name: p.name, lat: Number(p.lat), lng: Number(p.lng) });

export interface WalkingRoute {
  from_pin_id: number;
  from_name: string;
  to_pin_id: number;
  to_name: string;
  distance_m: number;
  walk_minutes: number;
  accessible_only: boolean;
  /** false when no walkway connects the two places and only a straight-line hint is given */
  on_paths: boolean;
  steps: string[];
  /** [lat, lng] points from start to destination, for drawing on the map */
  coordinates: [number, number][];
}

type Lang = "en" | "fil";
type Pt = { lat: number; lng: number };
type Edge = { to: number; w: number; name: string | null };

const SNAP_M = 6;             // walkway ends closer than this are treated as the same junction
const WALK_M_PER_MIN = 60;    // relaxed zoo walking pace (~3.6 km/h)
const TURN_DEG = 35;          // smaller bearing changes count as "continue straight"
const BEND_DEG = 60;          // along one walkway, smaller changes are the path curving, not a turn
const M_PER_DEG_LAT = 111_320;

function distM(a: Pt, b: Pt): number {
  const dy = (b.lat - a.lat) * M_PER_DEG_LAT;
  const dx = (b.lng - a.lng) * M_PER_DEG_LAT * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Compass bearing in degrees, 0 = north, clockwise. */
function bearing(a: Pt, b: Pt): number {
  const dy = b.lat - a.lat;
  const dx = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** Signed turn from heading a to heading b in (-180, 180]; positive = right. */
function turnAngle(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

const roundM = (m: number) => Math.max(5, Math.round(m / 5) * 5);

const CARDINAL: Record<Lang, string[]> = {
  en: ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"],
  fil: ["hilaga", "hilagang-silangan", "silangan", "timog-silangan", "timog", "timog-kanluran", "kanluran", "hilagang-kanluran"],
};
const cardinal = (deg: number, lang: Lang) => CARDINAL[lang][Math.round(deg / 45) % 8]!;

type Dir = "left" | "right" | "straight";
const dirOf = (turn: number): Dir => (Math.abs(turn) < TURN_DEG ? "straight" : turn > 0 ? "right" : "left");

const T = {
  en: {
    start: (from: string, card: string, name: string | null) => `Start at ${from} and head ${card}${name ? ` on the ${name}` : ""}.`,
    turn: (m: number, dir: Dir, name: string | null, same: boolean) =>
      dir === "straight"
        ? `Walk ${m} m, then continue straight${name ? ` onto the ${name}` : ""}.`
        : `Walk ${m} m, then turn ${dir}${name ? (same ? ` to stay on the ${name}` : ` onto the ${name}`) : ""}.`,
    arrive: (m: number, to: string, side: Dir, offPath: number) =>
      `Walk ${m} m. ${to} will be ${side === "straight" ? "straight ahead" : `on your ${side}`}` +
      (offPath >= 15 ? `, about ${roundM(offPath)} m from the walkway.` : "."),
    noPath: (to: string, m: number, card: string, from: string) =>
      `${to} is about ${m} m ${card} of ${from}. No mapped walkway connects them yet, so please follow the zoo signs.`,
    near: (to: string, m: number, card: string, from: string) => `${to} is only about ${m} m ${card} of ${from}.`,
    here: (to: string) => `You're already at ${to}.`,
  },
  fil: {
    start: (from: string, card: string, name: string | null) => `Magsimula sa ${from} at pumunta sa ${card}${name ? ` sa ${name}` : ""}.`,
    turn: (m: number, dir: Dir, name: string | null, same: boolean) => {
      const verb = { left: "kumaliwa", right: "kumanan", straight: "dumiretso" }[dir];
      if (!name) return `Maglakad ng ${m} metro, pagkatapos ay ${verb}.`;
      return same ? `Maglakad ng ${m} metro, pagkatapos ay ${verb} at manatili sa ${name}.` : `Maglakad ng ${m} metro, pagkatapos ay ${verb} papunta sa ${name}.`;
    },
    arrive: (m: number, to: string, side: Dir, offPath: number) =>
      `Maglakad ng ${m} metro. Ang ${to} ay nasa ${{ left: "inyong kaliwa", right: "inyong kanan", straight: "inyong harapan" }[side]}` +
      (offPath >= 15 ? `, mga ${roundM(offPath)} metro mula sa daanan.` : "."),
    noPath: (to: string, m: number, card: string, from: string) =>
      `Ang ${to} ay mga ${m} metro sa ${card} ng ${from}. Wala pang naka-mapang daanan papunta roon, kaya sundan ang mga karatula sa zoo.`,
    near: (to: string, m: number, card: string, from: string) => `Ang ${to} ay mga ${m} metro lamang sa ${card} ng ${from}.`,
    here: (to: string) => `Nandito na kayo sa ${to}.`,
  },
};

function buildGraph(paths: MapPath[], accessibleOnly: boolean) {
  const nodes: Pt[] = [];
  const adj = new Map<number, Edge[]>();
  const nodeFor = (p: Pt): number => {
    const i = nodes.findIndex(n => distM(n, p) <= SNAP_M);
    if (i >= 0) return i;
    nodes.push(p);
    adj.set(nodes.length - 1, []);
    return nodes.length - 1;
  };
  for (const path of paths) {
    if (!path.isOpen || path.isActive === false || (accessibleOnly && !path.isAccessible)) continue;
    const ids = path.geometry.coordinates.map(([lng, lat]) => nodeFor({ lat: lat!, lng: lng! }));
    for (let i = 1; i < ids.length; i++) {
      const a = ids[i - 1]!, b = ids[i]!;
      if (a === b) continue;
      const w = distM(nodes[a]!, nodes[b]!);
      adj.get(a)!.push({ to: b, w, name: path.name ?? null });
      adj.get(b)!.push({ to: a, w, name: path.name ?? null });
    }
  }
  return { nodes, adj };
}

function nearestNode(nodes: Pt[], p: Pt): { id: number; d: number } | null {
  let best: { id: number; d: number } | null = null;
  nodes.forEach((n, id) => {
    const d = distM(n, p);
    if (!best || d < best.d) best = { id, d };
  });
  return best;
}

/** Dijkstra; returns node ids from src to dst with the walkway name of each hop, or null if unreachable. */
function shortestPath(adj: Map<number, Edge[]>, n: number, src: number, dst: number) {
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<{ node: number; name: string | null } | null>(n).fill(null);
  const done = new Array<boolean>(n).fill(false);
  dist[src] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i;
    if (u < 0 || u === dst) break;
    done[u] = true;
    for (const e of adj.get(u) ?? []) {
      const alt = dist[u]! + e.w;
      if (alt < dist[e.to]!) { dist[e.to] = alt; prev[e.to] = { node: u, name: e.name }; }
    }
  }
  if (dist[dst] === Infinity) return null;
  const hops: { node: number; name: string | null }[] = [{ node: dst, name: null }];
  for (let cur = dst; prev[cur]; cur = prev[cur]!.node) {
    hops[hops.length - 1]!.name = prev[cur]!.name; // name of the walkway used to arrive at this node
    hops.push({ node: prev[cur]!.node, name: null });
  }
  return hops.reverse();
}

const NEAR_RANK_M = 40;

/**
 * Sort key for choosing the nearest of several places. Routes along walkways count by walking
 * distance; a place with no walkway route counts last, unless it's within NEAR_RANK_M (the visitor
 * is already there: both ends attach to the same junction, which planRoute reports as off-path).
 */
export function routeRank(route: Pick<WalkingRoute, "on_paths" | "distance_m">): number {
  return route.on_paths || route.distance_m <= NEAR_RANK_M ? route.distance_m : 1e9 + route.distance_m;
}

export function planRoute(
  from: RoutePlace,
  to: RoutePlace,
  paths: MapPath[],
  opts: { accessibleOnly?: boolean; lang?: string } = {},
): WalkingRoute {
  const lang: Lang = opts.lang === "fil" ? "fil" : "en";
  const t = T[lang];
  const accessibleOnly = !!opts.accessibleOnly;
  const base = {
    from_pin_id: from.id, from_name: from.name, to_pin_id: to.id, to_name: to.name, accessible_only: accessibleOnly,
  };
  // Direct hint when there's no usable walkway route ("none") or both ends share a junction ("near")
  const straight = (reason: "none" | "near"): WalkingRoute => {
    const d = distM(from, to);
    const hint = reason === "near" ? t.near : t.noPath;
    return {
      ...base, on_paths: false,
      distance_m: Math.round(d), walk_minutes: Math.max(1, Math.round(d / WALK_M_PER_MIN)),
      steps: [d < 10 ? t.here(to.name) : hint(to.name, roundM(d), cardinal(bearing(from, to), lang), from.name)],
      coordinates: [[from.lat, from.lng], [to.lat, to.lng]],
    };
  };

  if (from.id === to.id) return straight("near");
  const { nodes, adj } = buildGraph(paths, accessibleOnly);
  const s = nearestNode(nodes, from), e = nearestNode(nodes, to);
  if (!s || !e) return straight("none");
  if (s.id === e.id) return straight("near");
  const hops = shortestPath(adj, nodes.length, s.id, e.id);
  if (!hops) return straight("none");

  const pts = hops.map(h => nodes[h.node]!);
  // Group consecutive hops into runs: same walkway and no sharp bend (curved paths like a loop
  // around an exhibit are drawn as short straight pieces, so their gentle corners don't count)
  type Run = { name: string | null; bearing: number; length: number };
  const runs: Run[] = [];
  for (let i = 1; i < pts.length; i++) {
    const seg = { name: hops[i]!.name, bearing: bearing(pts[i - 1]!, pts[i]!), length: distM(pts[i - 1]!, pts[i]!) };
    const last = runs[runs.length - 1];
    if (last && last.name === seg.name && Math.abs(turnAngle(last.bearing, seg.bearing)) < BEND_DEG) {
      last.length += seg.length;
      last.bearing = seg.bearing;
    } else {
      runs.push({ ...seg });
    }
  }

  const steps: string[] = [t.start(from.name, cardinal(runs[0]!.bearing, lang), runs[0]!.name)];
  for (let i = 1; i < runs.length; i++) {
    const prevRun = runs[i - 1]!, run = runs[i]!;
    steps.push(t.turn(roundM(prevRun.length), dirOf(turnAngle(prevRun.bearing, run.bearing)), run.name, run.name != null && run.name === prevRun.name));
  }
  const lastRun = runs[runs.length - 1]!;
  const lastPt = pts[pts.length - 1]!;
  const side = distM(lastPt, to) < 8 ? "straight" : dirOf(turnAngle(lastRun.bearing, bearing(lastPt, to)));
  steps.push(t.arrive(roundM(lastRun.length), to.name, side, e.d));

  const onPaths = runs.reduce((sum, r) => sum + r.length, 0);
  const total = s.d + onPaths + e.d;
  return {
    ...base, on_paths: true,
    distance_m: Math.round(total), walk_minutes: Math.max(1, Math.round(total / WALK_M_PER_MIN)),
    steps,
    coordinates: [[from.lat, from.lng], ...pts.map(p => [p.lat, p.lng] as [number, number]), [to.lat, to.lng]],
  };
}
