import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useListMapPins } from "@workspace/api-client-react";
import { Play, Pause, Square, Shuffle, Loader2, Navigation, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAppCtx } from "@/contexts/AppContext";
import { setLocationDemoMode, setVisitorLocation, getVisitorLocation, useVisitorLocation, isInsideZoo } from "@/lib/visitorLocation";
import { useRouteFromHere } from "@/lib/locationRoutes";
import { hasArrived } from "@/components/map/NavigationCard";

// The visitor map itself, reused as is (loaded on demand like the visitor page)
const InteractiveMap = lazy(() => import("../visitor/Map"));

const BASE = "/admin/navigation-demo";
const WALK_MPS = 1.4;      // an average walking pace
const TICK_MS = 500;       // the simulated GPS sends a fix twice a second
const SPEEDS = [1, 3, 5, 10];

// Local metre grid for walking along the route
const M_PER_DEG = 111_320;
const toXY = (lat: number, lng: number, lat0: number) => [lng * M_PER_DEG * Math.cos((lat0 * Math.PI) / 180), lat * M_PER_DEG] as const;
const toLL = (x: number, y: number, lat0: number) => ({ lat: y / M_PER_DEG, lng: x / (M_PER_DEG * Math.cos((lat0 * Math.PI) / 180)) });

/**
 * The next simulated GPS fix: the visitor's position projected onto the current route, moved `step`
 * metres further along it. Following the current route (which the server recalculates as the dot moves)
 * means a wrong turn is corrected the same way it is for a real visitor.
 */
function stepAlong(route: [number, number][], here: { lat: number; lng: number }, step: number) {
  const lat0 = here.lat;
  const pts = route.map(([la, ln]) => toXY(la, ln, lat0));
  const [hx, hy] = toXY(here.lat, here.lng, lat0);
  let best = { d: Infinity, seg: 0, t: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((hx - ax) * dx + (hy - ay) * dy) / L2));
    const d = Math.hypot(hx - (ax + t * dx), hy - (ay + t * dy));
    if (d < best.d) best = { d, seg: i, t };
  }
  // Walk from the projected point (a dot that is off the path first walks back onto it)
  let [ax, ay] = pts[best.seg]!; const [bx0, by0] = pts[best.seg + 1] ?? pts[best.seg]!;
  let cx = ax + best.t * (bx0 - ax), cy = ay + best.t * (by0 - ay);
  if (best.d > 3) {
    const k = Math.min(1, step / best.d);
    const p = toLL(hx + (cx - hx) * k, hy + (cy - hy) * k, lat0);
    return { ...p, done: false };
  }
  let left = step, seg = best.seg;
  while (seg < pts.length - 1) {
    const [bx, by] = pts[seg + 1]!;
    const d = Math.hypot(bx - cx, by - cy);
    if (d >= left) { const k = left / (d || 1); return { ...toLL(cx + (bx - cx) * k, cy + (by - cy) * k, lat0), done: false }; }
    left -= d; cx = bx; cy = by; seg++;
  }
  return { ...toLL(cx, cy, lat0), done: true };
}

/** Metres left along the route from the visitor's position (the route itself refreshes only every ~11 m). */
function remainingAlong(route: [number, number][], here: { lat: number; lng: number }): number {
  const lat0 = here.lat;
  const pts = route.map(([la, ln]) => toXY(la, ln, lat0));
  const [hx, hy] = toXY(here.lat, here.lng, lat0);
  let best = { d: Infinity, seg: 0, t: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((hx - ax) * dx + (hy - ay) * dy) / L2));
    const d = Math.hypot(hx - (ax + t * dx), hy - (ay + t * dy));
    if (d < best.d) best = { d, seg: i, t };
  }
  const [ax, ay] = pts[best.seg]!, [bx, by] = pts[best.seg + 1] ?? pts[best.seg]!;
  let total = best.d + Math.hypot(bx - ax, by - ay) * (1 - best.t);
  for (let i = best.seg + 1; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
  return total;
}

/**
 * A wrong turn for "Take a wrong turn": a step backwards and to one side of the route, on whichever
 * side is farther from the destination, so the visitor really goes the wrong way and the route has to
 * bring them back.
 */
function offRoute(route: [number, number][], here: { lat: number; lng: number }, metres: number) {
  const lat0 = here.lat;
  const pts = route.map(([la, ln]) => toXY(la, ln, lat0));
  const i = Math.min(1, pts.length - 1);
  const [ax, ay] = pts[0]!, [bx, by] = pts[i]!;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len, uy = (by - ay) / len;          // direction of travel
  const [hx, hy] = toXY(here.lat, here.lng, lat0);
  const [dx, dy] = pts[pts.length - 1]!;                       // destination
  const candidates = [1, -1].map(side => {
    const x = hx - ux * metres * 0.6 + -uy * metres * side, y = hy - uy * metres * 0.6 + ux * metres * side;
    return { p: toLL(x, y, lat0), away: Math.hypot(x - dx, y - dy) };
  }).filter(c => isInsideZoo(c.p)).sort((a, b) => b.away - a.away);
  return candidates[0]?.p ?? null;
}

/**
 * Navigation Demo (admin only): shows the visitor map's live walking navigation without being at
 * Manila Zoo. A simulated GPS walks the visitor dot along the real route on the walkways, so the route,
 * turn-by-turn guide, footsteps, re-routing and arrival are the system's own. The simulated position is
 * kept in memory only and never reaches the visitor website.
 */
export default function AdminNavigationDemo() {
  // Demo mode is switched on before the map mounts and off when leaving this page
  useState(() => { setLocationDemoMode(true); return true; });
  useEffect(() => () => { setLocationDemoMode(false); }, []);

  const { toast } = useToast();
  const { language } = useAppCtx();
  const [, setLocation] = useLocation();
  const search = new URLSearchParams(useSearch());
  const { data: pinsData } = useListMapPins();
  const places = useMemo(() => (Array.isArray(pinsData) ? pinsData : [])
    .filter(p => p.is_active !== false && isInsideZoo(p))
    .sort((a, b) => a.name.localeCompare(b.name)), [pinsData]);

  const [startId, setStartId] = useState("");
  const [destId, setDestId] = useState("");
  const [accessible, setAccessible] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [arrived, setArrived] = useState(false);
  // Sensible defaults: Main Entrance to an exhibit
  useEffect(() => {
    if (!places.length || startId) return;
    const entrance = places.find(p => p.pin_type === "entrance") ?? places[0]!;
    const exhibit = places.find(p => p.pin_type === "animal" && p.id !== entrance.id) ?? places[1];
    setStartId(String(entrance.id));
    if (exhibit) setDestId(String(exhibit.id));
  }, [places, startId]);

  const here = useVisitorLocation();
  const toId = Number(search.get("to")) || 0;
  const routeAccessible = search.get("accessible") === "1";
  // Same request (and cache) as the map's own route, so both follow the same route
  const { data: route } = useRouteFromHere(here, toId, { accessible: routeAccessible, lang: language, enabled: started && search.get("from") === "me" && toId > 0 });
  const dest = places.find(p => p.id === toId);

  const latest = useRef({ route, dest, speed });
  latest.current = { route, dest, speed };

  // The simulated GPS: a fix every half second along the route
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const { route: r, dest: d, speed: s } = latest.current;
      const cur = getVisitorLocation();
      if (!r || !cur || !d || r.coordinates.length < 2) return;
      const pts = r.coordinates.map(([la, ln]) => [la!, ln!] as [number, number]);
      const next = stepAlong(pts, cur, WALK_MPS * s * (TICK_MS / 1000));
      setVisitorLocation({ lat: next.lat, lng: next.lng, source: "gps", accuracy: 5 });
      const now = getVisitorLocation();
      if (now && (next.done || hasArrived(now, { lat: Number(d.lat), lng: Number(d.lng) }))) {
        setRunning(false);
        setArrived(true);
        toast({ title: "Arrived", description: `The simulated visitor reached ${d.name}.` });
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [running, toast]);

  const start = () => {
    const s = places.find(p => String(p.id) === startId), d = places.find(p => String(p.id) === destId);
    if (!s || !d) { toast({ title: "Choose where to start and where to go", variant: "destructive" }); return; }
    if (s.id === d.id) { toast({ title: "Choose a different destination", variant: "destructive" }); return; }
    setVisitorLocation({ lat: Number(s.lat), lng: Number(s.lng), source: "gps", accuracy: 5 });
    setLocation(`${BASE}?from=me&to=${d.id}${accessible ? "&accessible=1" : ""}`);
    setStarted(true);
    setArrived(false);
    setRunning(true);
  };
  const stop = () => {
    setRunning(false);
    setStarted(false);
    setArrived(false);
    setVisitorLocation(null);
    setLocation(BASE);
  };
  const wrongTurn = () => {
    const cur = getVisitorLocation();
    if (!route || !cur) return;
    const p = offRoute(route.coordinates.map(([la, ln]) => [la!, ln!] as [number, number]), cur, 18);
    if (!p) { toast({ title: "No room to step off the route here", description: "Try again a little further along." }); return; }
    setVisitorLocation({ ...p, source: "gps", accuracy: 5 });
    toast({ title: "Wrong turn", description: "The visitor stepped off the route; watch the route update from the new position." });
  };

  const remaining = arrived ? 0 : route && here && route.coordinates.length >= 2
    ? Math.round(remainingAlong(route.coordinates.map(([la, ln]) => [la!, ln!] as [number, number]), here))
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><Navigation className="h-7 w-7 text-primary" /> Navigation Demo</h1>
        <p className="text-muted-foreground">Shows the visitor map's live walking navigation anywhere, using a simulated GPS. Only in the admin portal; visitors never see it.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Simulation</CardTitle>
          <CardDescription>Pick a start and a destination, then press Start. The dot walks the real route on the walkways.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="demo-start">Start at</Label>
              <Select value={startId} onValueChange={setStartId} disabled={started}>
                <SelectTrigger id="demo-start"><SelectValue placeholder="Choose a place" /></SelectTrigger>
                <SelectContent>{places.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-dest">Destination</Label>
              <Select value={destId} onValueChange={setDestId} disabled={started}>
                <SelectTrigger id="demo-dest"><SelectValue placeholder="Choose a place" /></SelectTrigger>
                <SelectContent>{places.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-2">
              <Switch id="demo-accessible" checked={accessible} onCheckedChange={setAccessible} disabled={started} />
              <Label htmlFor="demo-accessible">Wheelchair-friendly</Label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!started ? (
              <Button onClick={start} disabled={!startId || !destId}><Play className="mr-2 h-4 w-4" /> Start</Button>
            ) : (
              <>
                {!arrived && (
                  <Button onClick={() => setRunning(r => !r)} variant={running ? "secondary" : "default"}>
                    {running ? <><Pause className="mr-2 h-4 w-4" /> Pause</> : <><Play className="mr-2 h-4 w-4" /> Resume</>}
                  </Button>
                )}
                {!arrived && <Button variant="outline" onClick={wrongTurn} disabled={!route}><Shuffle className="mr-2 h-4 w-4" /> Take a wrong turn</Button>}
                <Button variant={arrived ? "default" : "ghost"} onClick={stop}><Square className="mr-2 h-4 w-4" /> {arrived ? "Reset demo" : "Stop simulation"}</Button>
              </>
            )}
            <div role="group" aria-label="Walking speed" className="ml-auto flex overflow-hidden rounded-md border text-sm">
              {SPEEDS.map(s => (
                <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}
                  className={`px-3 py-1.5 font-medium transition-colors ${speed === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {s}×
                </button>
              ))}
            </div>
          </div>

          {started && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              {running ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Info className="h-4 w-4" />}
              {arrived
                ? `Arrived at ${dest?.name ?? "the destination"} · simulated GPS`
                : <>{running ? "Walking" : "Paused"}{dest ? ` to ${dest.name}` : ""}{remaining != null ? ` · ${remaining} m left` : ""} · simulated GPS, {speed}× walking speed</>}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border">
        <Suspense fallback={<div className="flex h-[70vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
          <InteractiveMap basePath={BASE} heightClass="md:h-[72vh]" />
        </Suspense>
      </div>
    </div>
  );
}
