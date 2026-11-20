import { isInsideZoo } from "./zooBoundary";

/**
 * Animated walking footsteps along a navigation route, shared by the 2D (Leaflet) and 3D (MapLibre)
 * maps. Alternating left and right footprints appear one step at a time along the route's actual
 * walkway geometry, from its start (the visitor's own GPS position) toward the destination, then
 * the walk starts over. Only the newest few prints are shown, fading out behind the walker.
 *
 * The engine only computes where each print goes; each map draws them with its own markers. It runs
 * on a timer of a few steps a second (not every animation frame), skips steps while the tab is
 * hidden, and never places a print outside Manila Zoo. With "reduce motion" turned on in the
 * visitor's system settings, still footprints are drawn along the route instead of the animation.
 */

export type Footprint = {
  lat: number;
  lng: number;
  /** Walking direction, degrees clockwise from north */
  bearing: number;
  left: boolean;
  /** 0 (gone) to 1 */
  opacity: number;
};

type TrailOptions = {
  /** Ground metres per screen pixel at the moment, so steps stay readable at any zoom */
  metresPerPixel: () => number;
  /** Draw these prints (the list may be shorter than before: hide the rest) */
  render: (prints: Footprint[]) => void;
};

const STEP_MS = 230;          // one footprint every ~0.23 s: a brisk, readable walking rhythm
const TRAIL = 7;              // prints visible at once
const END_HOLD_STEPS = 5;     // pause at the destination before the walk starts over
const STRIDE_PX = 22;         // aim for a step about this far apart on screen
const MIN_STRIDE_M = 0.8, MAX_STRIDE_M = 8;
const STATIC_EVERY = 4;       // reduced motion: one print every few strides
const MAX_STATIC = 60;
const M_PER_DEG = 111_320;

/** 2D (Leaflet, 256 px tiles): ground metres per pixel at a latitude and zoom. */
export const leafletMetresPerPixel = (lat: number, zoom: number) => (156_543.033_92 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
/** 3D (MapLibre, 512 px tiles): ground metres per pixel at a latitude and zoom. */
export const maplibreMetresPerPixel = (lat: number, zoom: number) => (78_271.516_96 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A route as a measured line: the point and walking direction at any distance along it. */
function measure(points: [number, number][]) {
  const lat0 = points[0]![0];
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const xy = points.map(([lat, lng]) => [(lng - points[0]![1]) * M_PER_DEG * cos, (lat - lat0) * M_PER_DEG] as const);
  const cum = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1]! + Math.hypot(xy[i]![0] - xy[i - 1]![0], xy[i]![1] - xy[i - 1]![1]));
  const total = cum[cum.length - 1]!;

  /** Position `d` metres along the route, shifted `side` metres to the walker's right (negative: left) */
  const at = (d: number, side: number): Omit<Footprint, "left" | "opacity"> => {
    const dist = Math.max(0, Math.min(total, d));
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < dist) i++;
    const segLen = cum[i]! - cum[i - 1]! || 1;
    const t = (dist - cum[i - 1]!) / segLen;
    const [x0, y0] = xy[i - 1]!, [x1, y1] = xy[i]!;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    // The walker's right-hand side is the direction rotated 90° clockwise: (dy, -dx)
    const x = x0 + dx * t + (dy / len) * side, y = y0 + dy * t + (-dx / len) * side;
    return {
      lat: lat0 + y / M_PER_DEG,
      lng: points[0]![1] + x / (M_PER_DEG * cos),
      bearing: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360,
    };
  };
  return { total, at };
}

/**
 * Starts the footsteps along `points` ([lat, lng], from the visitor to the destination) and
 * returns a function that stops them and clears the prints.
 */
export function startFootstepTrail(points: [number, number][], opts: TrailOptions): () => void {
  if (points.length < 2) return () => opts.render([]);
  const path = measure(points);
  if (path.total < 1) return () => opts.render([]);

  const strideNow = () => Math.min(MAX_STRIDE_M, Math.max(MIN_STRIDE_M, STRIDE_PX * opts.metresPerPixel()));
  const print = (k: number, stride: number, opacity: number): Footprint | null => {
    const left = k % 2 === 0;
    // Feet sit a little either side of the walking line
    const p = path.at(k * stride, (left ? -1 : 1) * Math.max(0.25, stride * 0.22));
    return isInsideZoo(p) ? { ...p, left, opacity } : null;
  };

  // Reduced motion: still footprints along the route, no animation
  if (prefersReducedMotion()) {
    const stride = strideNow();
    const every = Math.max(STATIC_EVERY, Math.ceil(path.total / stride / MAX_STATIC));
    const prints: Footprint[] = [];
    for (let k = 1; k * stride <= path.total && prints.length < MAX_STATIC; k += every) {
      const p = print(k, stride, 0.9);
      if (p) prints.push(p);
    }
    opts.render(prints);
    return () => opts.render([]);
  }

  let stride = strideNow();
  let steps = Math.max(1, Math.floor(path.total / stride));
  let k = 0;          // the newest step taken
  let hold = 0;       // steps waited at the destination
  const tick = () => {
    if (typeof document !== "undefined" && document.hidden) return; // nobody is watching: don't walk
    if (k >= steps) {
      // At the destination: the trail fades out, then the walk starts over (re-measured for the zoom)
      hold++;
      if (hold > END_HOLD_STEPS) {
        hold = 0; k = 0;
        stride = strideNow();
        steps = Math.max(1, Math.floor(path.total / stride));
      }
    } else {
      k++;
    }
    const fade = k >= steps ? Math.max(0, 1 - hold / END_HOLD_STEPS) : 1;
    const prints: Footprint[] = [];
    for (let j = 0; j < TRAIL; j++) {
      const step = k - j;
      if (step < 1) break;
      const p = print(step, stride, (1 - j / TRAIL) * fade);
      if (p && p.opacity > 0.02) prints.push(p);
    }
    opts.render(prints);
  };
  tick();
  const timer = setInterval(tick, STEP_MS);
  return () => { clearInterval(timer); opts.render([]); };
}

/**
 * One footprint (a right foot pointing up, 14×20); mirror it with scaleX(-1) for the left foot.
 * White with a dark-blue outline, so it reads on the blue route line and on the map around it.
 */
export const FOOTPRINT_SVG =
  '<svg viewBox="0 0 14 20" width="14" height="20" aria-hidden="true" style="display:block;overflow:visible;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.45))">'
  + '<path d="M8 1C11.5 1.2 12.5 4.5 12 8C11.6 10.8 10.4 12.3 9.4 13.2L5 13.2C4.4 11.6 3.2 10 3.3 7.4C3.4 3.8 5 .9 8 1Z" fill="#fff" stroke="#1e3a8a" stroke-width="1.6"/>'
  + '<ellipse cx="7.2" cy="16.6" rx="2.7" ry="2.6" fill="#fff" stroke="#1e3a8a" stroke-width="1.6"/></svg>';

/** The element a map marker shows for one footprint; its first child is turned and faded per step. */
export function footprintElement(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "width:14px;height:20px;pointer-events:none";
  el.innerHTML = `<div style="width:14px;height:20px;opacity:0;transition:opacity .2s linear">${FOOTPRINT_SVG}</div>`;
  return el;
}

/**
 * Turns and fades a footprint element's inner part. `mapRotates` is false for maps that rotate the
 * marker themselves (MapLibre's setRotation), true for maps that don't (Leaflet).
 */
export function styleFootprint(el: HTMLElement | null | undefined, p: Footprint | undefined, mapRotates: boolean) {
  const inner = el?.firstElementChild as HTMLElement | null | undefined;
  if (!inner) return;
  if (!p) { inner.style.opacity = "0"; return; }
  inner.style.transform = `${mapRotates ? `rotate(${p.bearing}deg) ` : ""}scaleX(${p.left ? -1 : 1})`;
  inner.style.opacity = p.opacity.toFixed(2);
}
