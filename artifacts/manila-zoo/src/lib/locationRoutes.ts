import { useQuery } from "@tanstack/react-query";
import { customFetch, type MapRoute } from "@workspace/api-client-react";
import type { VisitorLocation } from "./visitorLocation";

export type NearestKind = "restroom" | "food" | "first_aid" | "exit";
export type NearestResult = {
  pin_id: number; name: string; pin_type: string; lat: number; lng: number;
  distance_m: number; walk_minutes: number; on_paths: boolean;
};

// ~11 m: a walking visitor's route is refreshed after moving about that far, not on every GPS tick
const rounded = (n: number) => n.toFixed(4);

function query(loc: VisitorLocation, extra: Record<string, string | number | boolean | undefined>) {
  const p = new URLSearchParams({ lat: String(loc.lat), lng: String(loc.lng) });
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== false) p.set(k, v === true ? "1" : String(v));
  return p.toString();
}

/** Walking route from the visitor's position to a place. */
export function useRouteFromHere(loc: VisitorLocation | null, toId: number, opts: { accessible: boolean; lang: string; enabled: boolean }) {
  return useQuery({
    queryKey: ["/api/map/route-from", loc && rounded(loc.lat), loc && rounded(loc.lng), toId, opts.accessible, opts.lang],
    queryFn: () => customFetch<MapRoute>(`/api/map/route-from?${query(loc!, { to: toId, accessible: opts.accessible, lang: opts.lang })}`),
    enabled: opts.enabled && !!loc && toId > 0,
    // While the visitor walks, keep the old route on screen until the updated one arrives
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[3] === toId ? prev : undefined),
    retry: false,
  });
}

/** Places of one kind ranked by walking distance from the visitor, plus the route to the nearest. */
export function useNearest(loc: VisitorLocation | null, kind: NearestKind | null, opts: { accessible: boolean; lang: string }) {
  return useQuery({
    queryKey: ["/api/map/nearest", kind, loc && rounded(loc.lat), loc && rounded(loc.lng), opts.accessible, opts.lang],
    queryFn: () => customFetch<{ results: NearestResult[]; route: MapRoute | null }>(
      `/api/map/nearest?${query(loc!, { kind: kind!, accessible: opts.accessible, lang: opts.lang })}`),
    enabled: !!loc && !!kind,
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === kind ? prev : undefined),
    retry: false,
  });
}

/** The server refuses positions outside the zoo; this reads how far outside, if that's the error. */
export function outsideZooMetres(error: unknown): number | null {
  const data = (error as { data?: { code?: string; metres_outside?: number } } | null)?.data;
  return data?.code === "outside_zoo" ? data.metres_outside ?? 0 : null;
}
