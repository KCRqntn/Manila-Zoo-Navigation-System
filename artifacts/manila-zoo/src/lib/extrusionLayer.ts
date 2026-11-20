import L from "leaflet";

/**
 * 2.5D extrusion layer for Leaflet.
 *
 * Leaflet's camera always looks straight down, so true 3D (tilt/rotate) is not possible.
 * This layer fakes it the same way OSMBuildings does: each footprint is drawn on a canvas
 * as walls + roof, where the roof is pushed away from the screen center in proportion to
 * the building's height (a simple perspective projection with the camera above the center).
 * Panning therefore produces parallax, and heights scale correctly with zoom.
 */

export interface ExtrusionFeature {
  id: number;
  name: string;
  /** Outer ring as [lat, lng] pairs (closing point optional). */
  ring: [number, number][];
  /** Courtyards/openings inside the outer ring, same format. */
  holes?: [number, number][][];
  heightM: number;
  minHeightM: number;
  wallColor: string;
  roofColor: string;
}

export interface ExtrusionLayerOptions extends L.LayerOptions {
  /** Called when a visitor clicks/taps an extruded shape. */
  onClick?: (feature: ExtrusionFeature, latlng: L.LatLng) => void;
  /** Draw soft ground shadows (default true). */
  shadows?: boolean;
}

type Pt = { x: number; y: number };
// Outer ring first, then holes
type HitShape = { roofs: Pt[][]; floors: Pt[][]; walls: Pt[][] };

const PANE = "extrusionPane";
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
// Screen-space light direction (from the upper left) and matching shadow direction.
const LIGHT: Pt = { x: -0.6, y: -0.8 };
const SHADOW_LENGTH = 0.6; // shadow length relative to height

export class ExtrusionLayer extends L.Layer {
  declare options: ExtrusionLayerOptions;

  private features: ExtrusionFeature[] = [];
  private highlightId: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private shadowCanvas: HTMLCanvasElement | null = null;
  // Screen-space shapes from the last draw, nearest last, for hit testing.
  private drawn: { feature: ExtrusionFeature; hit: HitShape }[] = [];

  constructor(options: ExtrusionLayerOptions = {}) {
    super(options);
    L.setOptions(this, { shadows: true, ...options });
  }

  setFeatures(features: ExtrusionFeature[]): this {
    this.features = features;
    this.redraw();
    return this;
  }

  setHighlight(id: number | null): this {
    this.highlightId = id;
    this.redraw();
    return this;
  }

  onAdd(map: L.Map): this {
    const pane = map.getPane(PANE) ?? map.createPane(PANE);
    // Above walkways/overlays (400), below markers (600) and popups (700)
    pane.style.zIndex = "450";
    pane.style.pointerEvents = "none";

    this.canvas = L.DomUtil.create("canvas", "leaflet-zoom-hide", pane);
    this.shadowCanvas = document.createElement("canvas");

    map.on("move resize zoomend viewreset", this.redraw, this);
    map.on("click", this.handleClick, this);
    map.on("mousemove", this.handleHover, this);
    this.redraw();
    return this;
  }

  onRemove(map: L.Map): this {
    map.off("move resize zoomend viewreset", this.redraw, this);
    map.off("click", this.handleClick, this);
    map.off("mousemove", this.handleHover, this);
    this.canvas?.remove();
    this.canvas = null;
    this.shadowCanvas = null;
    this.drawn = [];
    map.getContainer().style.cursor = "";
    return this;
  }

  redraw(): void {
    const map = this._map;
    const canvas = this.canvas;
    if (!map || !canvas) return;

    // Keep the canvas pinned to the viewport while the map pane is translated.
    const size = map.getSize();
    // A hidden or collapsed map (e.g. mid-layout on phones) has nothing to draw, and a
    // zero-sized canvas would make drawImage throw
    if (size.x === 0 || size.y === 0) return;
    const dpr = window.devicePixelRatio || 1;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    if (canvas.width !== size.x * dpr || canvas.height !== size.y * dpr) {
      canvas.width = size.x * dpr;
      canvas.height = size.y * dpr;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    this.drawn = [];
    if (this.features.length === 0) return;

    const center: Pt = { x: size.x / 2, y: size.y / 2 };
    const camZ = Math.max(size.x, size.y) * 1.2; // camera height above the screen center, in px
    const metersPerPx =
      (EARTH_CIRCUMFERENCE_M * Math.cos((map.getCenter().lat * Math.PI) / 180)) / (256 * 2 ** map.getZoom());
    const toPx = (m: number) => Math.min(m / metersPerPx, camZ * 0.8);
    const lift = (p: Pt, h: number): Pt => {
      const k = camZ / (camZ - h);
      return { x: center.x + (p.x - center.x) * k, y: center.y + (p.y - center.y) * k };
    };

    const bounds = map.getBounds().pad(0.5);
    const shapes = this.features
      .filter(f => f.ring.length >= 3 && f.ring.some(ll => bounds.contains(ll)))
      .map(f => {
        const project = (ring: [number, number][]) => openRing(ring).map(ll => {
          const p = map.latLngToContainerPoint(ll);
          return { x: p.x, y: p.y };
        });
        const base = project(f.ring);
        const holes = (f.holes ?? []).map(project).filter(h => h.length >= 3);
        return { f, base, holes, h: toPx(f.heightM), minH: toPx(f.minHeightM), dist: distance(centroid(base), center) };
      })
      // Flat ground shapes (water, gardens) first, then far to near so nearer buildings overlap
      .sort((a, b) => Number(a.h > 0) - Number(b.h > 0) || b.dist - a.dist);

    if (this.options.shadows) this.drawShadows(ctx, size, shapes);

    for (const { f, base, holes, h, minH } of shapes) {
      // Each ring (outer, then holes) as floor and roof outlines
      const rings = [base, ...holes].map((ring, k) => ({
        floor: minH > 0 ? ring.map(p => lift(p, minH)) : ring,
        roof: ring.map(p => lift(p, h)),
        // Walls face away from the solid: outward on the outer ring, into the courtyard on holes
        outwardSign: (signedArea(ring) > 0 ? 1 : -1) * (k === 0 ? 1 : -1), // screen y points down
      }));
      const hit: HitShape = { roofs: rings.map(r => r.roof), floors: rings.map(r => r.floor), walls: [] };

      if (h > minH) {
        const walls = rings.flatMap(({ floor, roof, outwardSign }) => floor.map((a, i) => {
          const j = (i + 1) % floor.length;
          const b = floor[j]!;
          return { quad: [a, b, roof[j]!, roof[i]!], a, b, outwardSign, dist: distance(midpoint(a, b), center) };
        })).sort((w1, w2) => w2.dist - w1.dist);

        for (const w of walls) {
          // Outward normal of the edge, used for simple directional shading
          const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y;
          const len = Math.hypot(dx, dy) || 1;
          const n: Pt = { x: (w.outwardSign * dy) / len, y: (-w.outwardSign * dx) / len };
          const light = 0.72 + 0.28 * Math.max(0, n.x * LIGHT.x + n.y * LIGHT.y);
          fillPolygon(ctx, w.quad, shade(f.wallColor, light), "rgba(0,0,0,0.18)");
          hit.walls.push(w.quad);
        }
      }

      const highlighted = f.id === this.highlightId;
      fillRings(ctx, hit.roofs, f.roofColor, highlighted ? "#facc15" : "rgba(0,0,0,0.25)", highlighted ? 3 : 1);
      this.drawn.push({ feature: f, hit });
    }
  }

  private drawShadows(ctx: CanvasRenderingContext2D, size: L.Point, shapes: { base: Pt[]; holes: Pt[][]; h: number }[]): void {
    const sc = this.shadowCanvas;
    if (!sc) return;
    sc.width = size.x;
    sc.height = size.y;
    const sctx = sc.getContext("2d");
    if (!sctx) return;
    // Draw all shadows opaque on a scratch canvas, then composite once so overlaps don't double-darken.
    sctx.fillStyle = "#000";
    for (const { base, holes, h } of shapes) {
      const off: Pt = { x: -LIGHT.x * h * SHADOW_LENGTH, y: -LIGHT.y * h * SHADOW_LENGTH };
      const move = (ring: Pt[]) => ring.map(p => ({ x: p.x + off.x, y: p.y + off.y }));
      fillRings(sctx, [move(base), ...holes.map(move)], "#000");
      for (const ring of [base, ...holes]) {
        const moved = move(ring);
        ring.forEach((a, i) => {
          const j = (i + 1) % ring.length;
          fillPolygon(sctx, [a, ring[j]!, moved[j]!, moved[i]!], "#000");
        });
      }
    }
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.drawImage(sc, 0, 0, size.x, size.y);
    ctx.restore();
  }

  private hitTest(p: L.Point): ExtrusionFeature | null {
    for (let i = this.drawn.length - 1; i >= 0; i--) {
      const { feature, hit } = this.drawn[i]!;
      if (inRings(p, hit.roofs) || inRings(p, hit.floors) || hit.walls.some(w => pointInPolygon(p, w))) return feature;
    }
    return null;
  }

  private handleClick(e: L.LeafletMouseEvent): void {
    const f = this.hitTest(e.containerPoint);
    if (f) this.options.onClick?.(f, e.latlng);
  }

  private handleHover(e: L.LeafletMouseEvent): void {
    if (!this.options.onClick || !this._map) return;
    this._map.getContainer().style.cursor = this.hitTest(e.containerPoint) ? "pointer" : "";
  }
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

function openRing(ring: [number, number][]): [number, number][] {
  const first = ring[0], last = ring[ring.length - 1];
  return first && last && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
}

function centroid(pts: Pt[]): Pt {
  const s = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: s.x / pts.length, y: s.y / pts.length };
}

const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
function inRings(p: Pt, rings: Pt[][]): boolean {
  const [outer, ...holes] = rings;
  return !!outer && pointInPolygon(p, outer) && !holes.some(h => pointInPolygon(p, h));
}

/** Fills an outer ring with holes cut out (even-odd rule). */
function fillRings(ctx: CanvasRenderingContext2D, rings: Pt[][], fill: string, stroke?: string, lineWidth = 1): void {
  ctx.beginPath();
  for (const pts of rings) {
    if (pts.length < 3) continue;
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.closePath();
  }
  ctx.fillStyle = fill;
  ctx.fill("evenodd");
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function fillPolygon(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string, stroke?: string, lineWidth = 1): void {
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/** Scale a #rrggbb color's brightness; falls back to the input for other formats. */
function shade(hex: string, factor: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
