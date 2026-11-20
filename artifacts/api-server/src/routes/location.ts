import { Router, type Request, type Response } from "express";
import { eq, inArray, and } from "drizzle-orm";
import { db, mapPinsTable, mapPathsTable } from "@workspace/db";
import { planRoute, routeRank, toPlace, type RoutePlace, type WalkingRoute } from "../lib/routing";
import { metresOutsideZoo, ZOO_EDGE_TOLERANCE_M, OUTSIDE_ZOO_MESSAGE, isInsideZoo, insideZoo } from "../lib/zooBoundary";

/**
 * Directions from wherever the visitor is: a GPS fix, a spot they tapped on the map, or the
 * place whose QR code they scanned. Routes follow the mapped walkways (see lib/routing.ts),
 * never a straight line through exhibits. A position outside the zoo is refused rather than
 * snapped to the nearest gate, so the visitor isn't sent off from somewhere they aren't.
 */
const router = Router();

// The visitor's position as a routing start point (id -1: it isn't a map pin)
const YOU = { en: "your location", fil: "iyong lokasyon" };

type Origin = { place: RoutePlace; lang: "en" | "fil"; accessible: boolean };

/** Reads and checks ?lat&lng; answers the request itself (and returns null) when they're unusable. */
function readOrigin(req: Request, res: Response): Origin | null {
  const lat = Number(req.query["lat"]), lng = Number(req.query["lng"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    res.status(400).json({ error: "lat and lng are required", code: "bad_location" });
    return null;
  }
  const outside = metresOutsideZoo(lat, lng);
  if (outside > ZOO_EDGE_TOLERANCE_M) {
    res.status(422).json({
      error: OUTSIDE_ZOO_MESSAGE,
      code: "outside_zoo",
      metres_outside: Math.round(outside),
    });
    return null;
  }
  const lang = req.query["lang"] === "fil" ? "fil" : "en";
  return {
    place: { id: -1, name: YOU[lang], lat, lng },
    lang,
    // Read the raw flag: coercion would turn the string "false" into true
    accessible: req.query["accessible"] === "true" || req.query["accessible"] === "1",
  };
}

const capitalizeFirst = (route: WalkingRoute): WalkingRoute => ({
  ...route,
  // "Start at your location…" reads better than "Start at Your location…" mid-sentence, but the
  // first word of the first step still needs a capital
  steps: route.steps.map((s, i) => (i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s)),
});

// GET /map/route-from?lat&lng&to=<pinId>[&accessible=1][&lang=fil]
router.get("/map/route-from", async (req, res): Promise<void> => {
  const origin = readOrigin(req, res);
  if (!origin) return;
  const toId = Number(req.query["to"]);
  if (!Number.isInteger(toId) || toId <= 0) { res.status(400).json({ error: "to (a place id) is required" }); return; }
  const [to] = await db.select().from(mapPinsTable).where(and(eq(mapPinsTable.id, toId), eq(mapPinsTable.isActive, true)));
  // Only places inside the zoo are destinations
  if (!to || !isInsideZoo(to.lat, to.lng)) { res.status(404).json({ error: "Destination not found inside Manila Zoo" }); return; }
  const paths = await db.select().from(mapPathsTable);
  res.json(capitalizeFirst(planRoute(origin.place, toPlace(to), paths, { accessibleOnly: origin.accessible, lang: origin.lang })));
});

// What "nearest restroom / food / first aid / exit" searches for
const KINDS: Record<string, string[]> = {
  restroom: ["restroom"],
  food: ["food_stall"],
  first_aid: ["emergency"],
  exit: ["exit", "entrance"], // the main entrance is also the exit
  animal: ["animal"],
};

// GET /map/nearest?lat&lng&kind=restroom[&accessible=1][&lang=fil][&limit=5]
// Every place of that kind, ranked by walking distance along the walkways, nearest first,
// with the full route to the nearest one.
router.get("/map/nearest", async (req, res): Promise<void> => {
  const origin = readOrigin(req, res);
  if (!origin) return;
  const types = KINDS[String(req.query["kind"] ?? "restroom")];
  if (!types) { res.status(400).json({ error: `kind must be one of: ${Object.keys(KINDS).join(", ")}` }); return; }
  const limit = Math.min(10, Math.max(1, Number(req.query["limit"]) || 5));

  const [allPlaces, paths] = await Promise.all([
    db.select().from(mapPinsTable).where(and(inArray(mapPinsTable.pinType, types), eq(mapPinsTable.isActive, true))),
    db.select().from(mapPathsTable),
  ]);
  const places = insideZoo(allPlaces);
  if (places.length === 0) { res.json({ results: [], route: null }); return; }

  const routes = places.map(p => ({
    pin: p,
    route: capitalizeFirst(planRoute(origin.place, toPlace(p), paths, { accessibleOnly: origin.accessible, lang: origin.lang })),
  }));
  // Places reachable along walkways come first; a straight-line hint is only a fallback
  routes.sort((a, b) => routeRank(a.route) - routeRank(b.route));

  res.json({
    results: routes.slice(0, limit).map(({ pin, route }) => ({
      pin_id: pin.id, name: pin.name, pin_type: pin.pinType, lat: Number(pin.lat), lng: Number(pin.lng),
      distance_m: route.distance_m, walk_minutes: route.walk_minutes, on_paths: route.on_paths,
    })),
    route: routes[0]!.route,
  });
});

export default router;
