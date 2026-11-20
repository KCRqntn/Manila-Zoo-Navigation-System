import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, mapPinsTable, mapConfigTable, animalsTable, mapFeaturesTable, mapPathsTable, mapLayoutMetaTable, type MapFeature, type MapConfig } from "@workspace/db";
import {
  CreateMapPinBody, GetMapPinParams, UpdateMapPinParams, UpdateMapPinBody, DeleteMapPinParams, UpdateMapConfigBody,
  CreateMapFeatureBody, UpdateMapFeatureParams, UpdateMapFeatureBody, DeleteMapFeatureParams,
  CreateMapPathBody, UpdateMapPathParams, UpdateMapPathBody, DeleteMapPathParams, GetMapRouteQueryParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middleware/requireAdmin";
import { requirePermission, verifiedUser, can, staffUser } from "../middleware/access";
import { planRoute, toPlace } from "../lib/routing";
import { metresOutsideZoo, isInsideZoo, insideZoo, pointOutsideZoo } from "../lib/zooBoundary";
import { ZOO_MAP_CONFIG } from "../data/manilaZooLayout";
import { auditReq } from "../lib/audit";
import { pool } from "@workspace/db";

/** Staff see unpublished (hidden) places and buildings too, to preview them; visitors only published ones. */
async function isStaff(req: import("express").Request): Promise<boolean> {
  if (!req.headers.authorization) return false;
  const user = await verifiedUser(req);
  return !!user && can(user, "dashboard.read");
}

/** A place must be inside the zoo fence (gates sit on the fence line, so the edge tolerance counts). */
function badPosition(lat: unknown, lng: unknown): string | null {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) return "The position isn't a valid latitude/longitude";
  if (!isInsideZoo(la, ln)) return `That position is about ${Math.round(metresOutsideZoo(la, ln))} m outside Manila Zoo. Place it inside the zoo grounds.`;
  return null;
}

/** Buildings and walkways must lie entirely inside the zoo, so no route can lead out of it. */
function badGeometry(geometry: unknown, what: string): string | null {
  const out = pointOutsideZoo(geometry);
  return out ? `Part of this ${what} (${out[1].toFixed(6)}, ${out[0].toFixed(6)}) is outside Manila Zoo. Keep it inside the zoo grounds.` : null;
}

const router = Router();

// Any edit to places, buildings, walkways or map settings first keeps an automatic version (at most hourly)
router.use(/^\/map\/(pins|features|paths|config)/, (req, _res, next) => {
  if (req.method === "GET" || req.method === "HEAD") { next(); return; }
  autoSnapshotBeforeMapEdit(null).then(() => next(), () => next());
});

// Every map write bumps this counter so visitor maps know to reload (see GET /map/version).
async function bumpMapVersion(): Promise<void> {
  await db.insert(mapLayoutMetaTable).values({ id: 1, version: 1 }).onConflictDoUpdate({
    target: mapLayoutMetaTable.id,
    set: { version: sql`${mapLayoutMetaTable.version} + 1`, updatedAt: new Date() },
  });
}

async function currentMapVersion() {
  const [meta] = await db.select().from(mapLayoutMetaTable).where(eq(mapLayoutMetaTable.id, 1));
  return { version: meta?.version ?? 0, updated_at: meta?.updatedAt ?? null };
}

/** Fields the generated request schema doesn't know yet: label visibility and the place's photo. */
function pinExtras(body: Record<string, unknown> | undefined): { showLabel?: boolean; imageUrl?: string | null } | string {
  const out: { showLabel?: boolean; imageUrl?: string | null } = {};
  if (body?.["show_label"] !== undefined) {
    if (typeof body["show_label"] !== "boolean") return "show_label must be true or false";
    out.showLabel = body["show_label"];
  }
  if (body?.["image_url"] !== undefined) {
    const v = body["image_url"];
    if (v !== null && (typeof v !== "string" || (v !== "" && !/^(https?:\/\/|\/)\S+$/.test(v)) || v.length > 1000)) return "The photo must be a web address (https://…)";
    out.imageUrl = v || null;
  }
  return out;
}

const toNum = (v: string | null | undefined) => (v == null ? null : Number(v));

const serializeFeature = (f: MapFeature) => ({ ...f, heightM: Number(f.heightM), minHeightM: Number(f.minHeightM) });

const serializeConfig = (c: MapConfig) => ({
  ...c,
  centerLat: Number(c.centerLat), centerLng: Number(c.centerLng),
  swLat: toNum(c.swLat), swLng: toNum(c.swLng), neLat: toNum(c.neLat), neLng: toNum(c.neLng),
});

router.get("/map/pins", async (req, res): Promise<void> => {
  const staff = await isStaff(req);
  const rows = await db
    .select({ pin: mapPinsTable, animal_name: animalsTable.name })
    .from(mapPinsTable)
    .leftJoin(animalsTable, eq(mapPinsTable.animalId, animalsTable.id))
    .where(staff ? undefined : eq(mapPinsTable.isActive, true))
    .orderBy(mapPinsTable.name);
  // Visitors only ever see places inside the zoo; staff also see strays, to move them back in
  const shown = staff ? rows : rows.filter(r => isInsideZoo(r.pin.lat, r.pin.lng));
  res.json(shown.map(r => ({ ...r.pin, animal_name: r.animal_name ?? null })));
});

/** A unique-name clash (Drizzle wraps the database error, so its code may be on `cause`) */
const isDuplicate = (err: unknown) => { const e = err as { code?: string; cause?: { code?: string } }; return e.code === "23505" || e.cause?.code === "23505"; };

// The kinds of place a pin can be; the dashboard groups them into categories (see lib/pinCategories.ts)
const PIN_TYPES = ["animal", "restroom", "building", "food_stall", "entrance", "exit", "emergency", "facility", "other"];
const badPinType = (t: unknown) => (t == null || PIN_TYPES.includes(String(t)) ? null : `Category must be one of: ${PIN_TYPES.join(", ")}`);
// Pins are edited with the map permission, and each change is logged with what it was before and after
const mapWrite = requirePermission("map.write");
const pinSnapshot = (p: typeof mapPinsTable.$inferSelect) => ({
  name: p.name, pin_type: p.pinType, lat: Number(p.lat), lng: Number(p.lng), description: p.description,
  animal_id: p.animalId, is_active: p.isActive, show_label: p.showLabel, color: p.color, image_url: p.imageUrl,
});

router.post("/map/pins", mapWrite, async (req, res): Promise<void> => {
  const parsed = CreateMapPinBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const badType = badPinType(parsed.data.pin_type);
  if (badType) { res.status(400).json({ error: badType }); return; }
  if (!parsed.data.name?.trim()) { res.status(400).json({ error: "Enter the place's name" }); return; }
  const bad = badPosition(parsed.data.lat, parsed.data.lng);
  if (bad) { res.status(400).json({ error: bad }); return; }
  const extra = pinExtras(req.body);
  if (typeof extra === "string") { res.status(400).json({ error: extra }); return; }
  let pin;
  try {
    [pin] = await db.insert(mapPinsTable).values({
      ...extra,
      name: parsed.data.name.trim(),
      pinType: parsed.data.pin_type ?? "animal",
      lat: String(parsed.data.lat),
      lng: String(parsed.data.lng),
      animalId: parsed.data.animal_id ?? undefined,
      description: parsed.data.description ?? undefined,
      color: parsed.data.color ?? undefined,
      icon: parsed.data.icon ?? undefined,
      // New places can start hidden, to check them on the map before visitors see them
      isActive: req.body?.is_active === false ? false : true,
    }).returning();
  } catch (err) {
    if (isDuplicate(err)) { res.status(409).json({ error: `A place called "${parsed.data.name.trim()}" already exists. Use a different name.` }); return; }
    throw err;
  }
  await bumpMapVersion();
  await auditReq(req, res, { action: "map.pin_create", resource: "map_pins", recordId: String(pin!.id), after: pinSnapshot(pin!) });
  const [animal] = pin!.animalId == null ? [] : await db.select({ name: animalsTable.name }).from(animalsTable).where(eq(animalsTable.id, pin!.animalId));
  res.status(201).json({ ...pin, animal_name: animal?.name ?? null });
});

/** What depends on a place, shown before deleting it: animals living there, its QR codes, events, building outlines. */
router.get("/admin/map/pins/:id/usage", requirePermission("dashboard.read"), async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid place" }); return; }
  const [animals, qr, events, features] = await Promise.all([
    pool.query<{ id: number; name: string }>("SELECT id, name FROM animals WHERE location_id = $1 ORDER BY name", [id]),
    pool.query<{ code: string }>("SELECT code FROM qr_codes WHERE map_pin_id = $1", [id]),
    pool.query<{ title: string }>("SELECT title FROM events WHERE pin_id = $1", [id]),
    pool.query<{ id: number; name: string }>("SELECT id, name FROM map_features WHERE map_pin_id = $1", [id]),
  ]);
  res.json({ animals: animals.rows, qr_codes: qr.rows.map(r => r.code), events: events.rows.map(r => r.title), features: features.rows });
});

/** Links a building or enclosure outline to a place (or unlinks it), from the pin dialog. */
router.put("/admin/map/pins/:id/feature", mapWrite, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const featureId = req.body?.feature_id == null ? null : Number(req.body.feature_id);
  if (!Number.isInteger(id) || (featureId !== null && !Number.isInteger(featureId))) { res.status(400).json({ error: "Invalid place or outline" }); return; }
  const before = await pool.query<{ id: number }>("SELECT id FROM map_features WHERE map_pin_id = $1", [id]);
  await pool.query("UPDATE map_features SET map_pin_id = NULL, updated_at = now() WHERE map_pin_id = $1", [id]);
  if (featureId !== null) {
    const { rowCount } = await pool.query("UPDATE map_features SET map_pin_id = $1, updated_at = now() WHERE id = $2", [id, featureId]);
    if (!rowCount) { res.status(404).json({ error: "Outline not found" }); return; }
  }
  await bumpMapVersion();
  await auditReq(req, res, { action: "map.pin_link_outline", resource: "map_pins", recordId: String(id), before: { feature_ids: before.rows.map(r => r.id) }, after: { feature_id: featureId } });
  res.json({ pin_id: id, feature_id: featureId });
});

router.get("/map/pins/:id", async (req, res): Promise<void> => {
  const params = GetMapPinParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.select({ pin: mapPinsTable, animal_name: animalsTable.name }).from(mapPinsTable).leftJoin(animalsTable, eq(mapPinsTable.animalId, animalsTable.id)).where(eq(mapPinsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Map pin not found" }); return; }
  res.json({ ...row.pin, animal_name: row.animal_name ?? null });
});

router.patch("/map/pins/:id", mapWrite, async (req, res): Promise<void> => {
  const params = UpdateMapPinParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateMapPinBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const badType = badPinType(parsed.data.pin_type);
  if (badType) { res.status(400).json({ error: badType }); return; }
  if (parsed.data.name != null && !parsed.data.name.trim()) { res.status(400).json({ error: "Enter the place's name" }); return; }
  const [cur] = await db.select().from(mapPinsTable).where(eq(mapPinsTable.id, params.data.id));
  if (!cur) { res.status(404).json({ error: "Map pin not found" }); return; }
  if (parsed.data.lat != null || parsed.data.lng != null) {
    const bad = badPosition(parsed.data.lat ?? cur.lat, parsed.data.lng ?? cur.lng);
    if (bad) { res.status(400).json({ error: bad }); return; }
  }
  const extra = pinExtras(req.body);
  if (typeof extra === "string") { res.status(400).json({ error: extra }); return; }
  const update: Partial<typeof mapPinsTable.$inferInsert> = { updatedAt: new Date(), ...extra };
  if (parsed.data.name != null) update.name = parsed.data.name.trim();
  if (parsed.data.lat != null) update.lat = String(parsed.data.lat);
  if (parsed.data.lng != null) update.lng = String(parsed.data.lng);
  if (parsed.data.pin_type != null) update.pinType = parsed.data.pin_type;
  // Explicit null clears these, so an admin can unlink an animal or remove a description
  if (parsed.data.animal_id !== undefined) update.animalId = parsed.data.animal_id;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.icon !== undefined) update.icon = parsed.data.icon;
  if (parsed.data.color != null) update.color = parsed.data.color;
  if (parsed.data.is_active != null) update.isActive = parsed.data.is_active;
  let pin;
  try {
    [pin] = await db.update(mapPinsTable).set(update).where(eq(mapPinsTable.id, params.data.id)).returning();
  } catch (err) {
    if (isDuplicate(err)) { res.status(409).json({ error: `A place called "${update.name}" already exists. Use a different name.` }); return; }
    throw err;
  }
  if (!pin) { res.status(404).json({ error: "Map pin not found" }); return; }
  await bumpMapVersion();
  // Only what changed, so the log reads "moved" or "renamed" at a glance
  const before = pinSnapshot(cur), after = pinSnapshot(pin);
  const changed = (Object.keys(after) as (keyof typeof after)[]).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (changed.length > 0) {
    const pick = (o: typeof after) => Object.fromEntries(changed.map(k => [k, o[k]]));
    const moved = changed.length <= 2 && changed.every(k => k === "lat" || k === "lng");
    await auditReq(req, res, { action: moved ? "map.pin_move" : "map.pin_update", resource: "map_pins", recordId: String(pin.id), before: { name: cur.name, ...pick(before) }, after: { name: pin.name, ...pick(after) } });
  }
  const [animal] = pin.animalId == null ? [] : await db.select({ name: animalsTable.name }).from(animalsTable).where(eq(animalsTable.id, pin.animalId));
  res.json({ ...pin, animal_name: animal?.name ?? null });
});

router.delete("/map/pins/:id", mapWrite, async (req, res): Promise<void> => {
  const params = DeleteMapPinParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [cur] = await db.select().from(mapPinsTable).where(eq(mapPinsTable.id, params.data.id));
  if (!cur) { res.status(404).json({ error: "Map pin not found" }); return; }
  // Animals living here keep their profiles but lose this exhibit (it can be set again on the Animals page);
  // its location QR codes go with it, events and outlines just lose the link
  const client = await pool.connect();
  let unlinked: string[] = [];
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ name: string }>("UPDATE animals SET location_id = NULL, updated_at = now() WHERE location_id = $1 RETURNING name", [cur.id]);
    unlinked = rows.map(r => r.name);
    await client.query("DELETE FROM map_pins WHERE id = $1", [cur.id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  await bumpMapVersion();
  await auditReq(req, res, { action: "map.pin_delete", resource: "map_pins", recordId: String(cur.id), before: pinSnapshot(cur), context: unlinked.length ? { animals_unlinked: unlinked } : undefined });
  res.sendStatus(204);
});

router.get("/map/config", async (_req, res): Promise<void> => {
  const [config] = await db.select().from(mapConfigTable).limit(1);
  if (!config) {
    res.json({ id: 1, map_image_url: "", center_lat: ZOO_MAP_CONFIG.centerLat, center_lng: ZOO_MAP_CONFIG.centerLng, default_zoom: ZOO_MAP_CONFIG.defaultZoom, sw_lat: null, sw_lng: null, ne_lat: null, ne_lng: null, updated_at: null });
    return;
  }
  res.json(serializeConfig(config));
});

router.patch("/map/config", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateMapConfigBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select({ id: mapConfigTable.id, centerLat: mapConfigTable.centerLat, centerLng: mapConfigTable.centerLng }).from(mapConfigTable).limit(1);
  // The map opens on its center, so the center must be inside the zoo
  if (parsed.data.center_lat != null || parsed.data.center_lng != null) {
    const bad = badPosition(parsed.data.center_lat ?? existing?.centerLat, parsed.data.center_lng ?? existing?.centerLng);
    if (bad) { res.status(400).json({ error: `Map center: ${bad}` }); return; }
  }
  const update: Partial<typeof mapConfigTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.map_image_url != null) update.mapImageUrl = parsed.data.map_image_url;
  if (parsed.data.center_lat != null) update.centerLat = String(parsed.data.center_lat);
  if (parsed.data.center_lng != null) update.centerLng = String(parsed.data.center_lng);
  if (parsed.data.default_zoom != null) update.defaultZoom = parsed.data.default_zoom;
  // Overlay bounds accept an explicit null so the admin can clear the overlay placement
  if (parsed.data.sw_lat !== undefined) update.swLat = parsed.data.sw_lat == null ? null : String(parsed.data.sw_lat);
  if (parsed.data.sw_lng !== undefined) update.swLng = parsed.data.sw_lng == null ? null : String(parsed.data.sw_lng);
  if (parsed.data.ne_lat !== undefined) update.neLat = parsed.data.ne_lat == null ? null : String(parsed.data.ne_lat);
  if (parsed.data.ne_lng !== undefined) update.neLng = parsed.data.ne_lng == null ? null : String(parsed.data.ne_lng);
  let config;
  if (existing) {
    [config] = await db.update(mapConfigTable).set(update).where(eq(mapConfigTable.id, existing.id)).returning();
  } else {
    [config] = await db.insert(mapConfigTable).values({ mapImageUrl: "", centerLat: String(ZOO_MAP_CONFIG.centerLat), centerLng: String(ZOO_MAP_CONFIG.centerLng), defaultZoom: ZOO_MAP_CONFIG.defaultZoom, ...update }).returning();
  }
  await bumpMapVersion();
  res.json(serializeConfig(config!));
});

// ─── Layout: 2.5D features + walkways ─────────────────────────────────────────

router.get("/map/layout", async (req, res): Promise<void> => {
  const staff = await isStaff(req);
  const [features, paths, meta] = await Promise.all([
    db.select().from(mapFeaturesTable).where(staff ? undefined : eq(mapFeaturesTable.isActive, true)).orderBy(mapFeaturesTable.name),
    // Unpublished (draft) walkways are staff-only, like hidden places and footprints
    db.select().from(mapPathsTable).where(staff ? undefined : eq(mapPathsTable.isActive, true)).orderBy(mapPathsTable.id),
    currentMapVersion(),
  ]);
  res.json({ version: meta.version, features: features.map(serializeFeature), paths });
});

router.get("/map/version", async (_req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  res.json(await currentMapVersion());
});

router.get("/map/route", async (req, res): Promise<void> => {
  const params = GetMapRouteQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [from] = await db.select().from(mapPinsTable).where(and(eq(mapPinsTable.id, params.data.from), eq(mapPinsTable.isActive, true)));
  const [to] = await db.select().from(mapPinsTable).where(and(eq(mapPinsTable.id, params.data.to), eq(mapPinsTable.isActive, true)));
  // Routes only connect places inside the zoo
  const [start, end] = insideZoo([from, to].filter(p => p != null));
  if (!start || !end) { res.status(404).json({ error: "Start or destination not found inside Manila Zoo" }); return; }
  const paths = await db.select().from(mapPathsTable);
  const route = planRoute(toPlace(start), toPlace(end), paths, {
    // Read the raw flag: coercion would turn the string "false" into true
    accessibleOnly: req.query["accessible"] === "true" || req.query["accessible"] === "1",
    lang: params.data.lang,
  });
  res.json(route);
});

router.post("/map/features", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateMapFeatureBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const bad = badGeometry(d.geometry, "shape");
  if (bad) { res.status(400).json({ error: bad }); return; }
  const [feature] = await db.insert(mapFeaturesTable).values({
    name: d.name,
    featureType: d.feature_type,
    geometry: d.geometry,
    heightM: String(d.height_m ?? 0),
    minHeightM: String(d.min_height_m ?? 0),
    wallColor: d.wall_color ?? undefined,
    roofColor: d.roof_color ?? undefined,
    mapPinId: d.map_pin_id ?? undefined,
    // Saved as a draft (staff only) when Map Management turns "Published" off; read from the raw
    // body because the generated create schema has no such field
    isActive: req.body?.is_active === false ? false : true,
  }).returning();
  await bumpMapVersion();
  res.status(201).json(serializeFeature(feature!));
});

router.patch("/map/features/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateMapFeatureParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateMapFeatureBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const bad = d.geometry != null ? badGeometry(d.geometry, "shape") : null;
  if (bad) { res.status(400).json({ error: bad }); return; }
  const update: Partial<typeof mapFeaturesTable.$inferInsert> = { updatedAt: new Date() };
  if (d.name != null) update.name = d.name;
  if (d.feature_type != null) update.featureType = d.feature_type;
  if (d.geometry != null) update.geometry = d.geometry;
  if (d.height_m != null) update.heightM = String(d.height_m);
  if (d.min_height_m != null) update.minHeightM = String(d.min_height_m);
  if (d.wall_color != null) update.wallColor = d.wall_color;
  if (d.roof_color != null) update.roofColor = d.roof_color;
  if (d.map_pin_id !== undefined) update.mapPinId = d.map_pin_id;
  if (d.is_active != null) update.isActive = d.is_active;
  const [feature] = await db.update(mapFeaturesTable).set(update).where(eq(mapFeaturesTable.id, params.data.id)).returning();
  if (!feature) { res.status(404).json({ error: "Map feature not found" }); return; }
  await bumpMapVersion();
  res.json(serializeFeature(feature));
});

router.delete("/map/features/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteMapFeatureParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const gone = await db.delete(mapFeaturesTable).where(eq(mapFeaturesTable.id, params.data.id)).returning({ id: mapFeaturesTable.id });
  if (gone.length === 0) { res.status(404).json({ error: "Map feature not found" }); return; }
  await bumpMapVersion();
  res.sendStatus(204);
});

router.post("/map/paths", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateMapPathBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const bad = badGeometry(parsed.data.geometry, "walkway");
  if (bad) { res.status(400).json({ error: bad }); return; }
  const [path] = await db.insert(mapPathsTable).values({
    name: parsed.data.name ?? undefined,
    geometry: parsed.data.geometry,
    isAccessible: parsed.data.is_accessible ?? true,
    isActive: parsed.data.is_active ?? true,
    kind: parsed.data.kind ?? "walkway",
  }).returning();
  await bumpMapVersion();
  res.status(201).json(path);
});

router.patch("/map/paths/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateMapPathParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateMapPathBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const bad = d.geometry != null ? badGeometry(d.geometry, "walkway") : null;
  if (bad) { res.status(400).json({ error: bad }); return; }
  const update: Partial<typeof mapPathsTable.$inferInsert> = { updatedAt: new Date() };
  if (d.name !== undefined) update.name = d.name;
  if (d.geometry != null) update.geometry = d.geometry;
  if (d.is_open != null) update.isOpen = d.is_open;
  if (d.is_accessible != null) update.isAccessible = d.is_accessible;
  if (d.is_active != null) update.isActive = d.is_active;
  if (d.kind != null) update.kind = d.kind;
  const [path] = await db.update(mapPathsTable).set(update).where(eq(mapPathsTable.id, params.data.id)).returning();
  if (!path) { res.status(404).json({ error: "Map path not found" }); return; }
  await bumpMapVersion();
  res.json(path);
});

router.delete("/map/paths/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteMapPathParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const gone = await db.delete(mapPathsTable).where(eq(mapPathsTable.id, params.data.id)).returning({ id: mapPathsTable.id });
  if (gone.length === 0) { res.status(404).json({ error: "Map path not found" }); return; }
  await bumpMapVersion();
  res.sendStatus(204);
});

// ─── Saved map versions ───────────────────────────────────────────────────────

// Anything that runs SQL: the pool or one connection inside a transaction
type Client = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };

/** Saves the whole map (places, buildings, walkways, settings) as one version. */
async function snapshotMap(reason: string, by: string | null, note: string | null, client: Client = pool) {
  const [pins, features, paths, config] = await Promise.all([
    client.query("SELECT * FROM map_pins ORDER BY id"),
    client.query("SELECT * FROM map_features ORDER BY id"),
    client.query("SELECT * FROM map_paths ORDER BY id"),
    client.query("SELECT * FROM map_config ORDER BY id"),
  ]);
  const { rows } = await client.query(
    `INSERT INTO map_versions (created_by, reason, note, pin_count, feature_count, path_count, snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at, reason, note, pin_count, feature_count, path_count`,
    [by, reason, note, pins.rowCount, features.rowCount, paths.rowCount,
      JSON.stringify({ pins: pins.rows, features: features.rows, paths: paths.rows, config: config.rows })]);
  return rows[0];
}

// Before map edits, keep an automatic version if the last one is over an hour old, so an editing
// session can always be undone
let lastAutoCheck = 0;
export async function autoSnapshotBeforeMapEdit(by: string | null): Promise<void> {
  if (Date.now() - lastAutoCheck < 60_000) return;
  lastAutoCheck = Date.now();
  const { rows } = await pool.query("SELECT created_at FROM map_versions ORDER BY id DESC LIMIT 1");
  if (rows[0] && Date.now() - new Date(rows[0].created_at).getTime() < 3600_000) return;
  await snapshotMap("auto", by, "Saved automatically before map edits");
}

router.get("/admin/map/versions", requirePermission("dashboard.read"), async (_req, res): Promise<void> => {
  const { rows } = await pool.query(
    "SELECT id, created_at, created_by, reason, note, pin_count, feature_count, path_count FROM map_versions ORDER BY id DESC LIMIT 100");
  res.json(rows);
});

router.post("/admin/map/versions", requirePermission("map.write"), async (req, res): Promise<void> => {
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 300) || null : null;
  const version = await snapshotMap("manual", staffUser(res).email ?? null, note);
  await auditReq(req, res, { action: "map.version_save", resource: "map_versions", recordId: version.id, after: version });
  res.status(201).json(version);
});

/**
 * Restores a saved version in one transaction, after saving the current map as a version first.
 * Places are matched by id and updated; places that aren't in the version are hidden, not deleted,
 * because location QR codes and events point at them. Buildings and walkways are replaced.
 */
router.post("/admin/map/versions/:id/restore", requirePermission("map.write"), async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const { rows: [version] } = await pool.query("SELECT * FROM map_versions WHERE id = $1", [id]);
  if (!version) { res.status(404).json({ error: "Version not found" }); return; }
  const by = staffUser(res).email ?? null;
  const snap = version.snapshot as { pins: Record<string, unknown>[]; features: Record<string, unknown>[]; paths: Record<string, unknown>[]; config: Record<string, unknown>[] };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const safety = await snapshotMap("before_restore", by, `Map before restoring version #${id}`, client);
    const upsert = async (table: string, rows: Record<string, unknown>[]) => {
      if (rows.length === 0) return;
      const { rows: cols } = await client.query<{ column_name: string; data_type: string }>(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [table]);
      const live = cols.map(c => c.column_name);
      for (const row of rows) {
        const keys = Object.keys(row).filter(k => live.includes(k));
        const values = keys.map(k => {
          const v = row[k];
          return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
        });
        await client.query(
          `INSERT INTO ${table} (${keys.map(k => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})
           ON CONFLICT (id) DO UPDATE SET ${keys.filter(k => k !== "id").map(k => `"${k}" = EXCLUDED."${k}"`).join(", ")}`, values);
      }
      await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST((SELECT max(id) FROM ${table}), 1))`);
    };
    // Places: update/insert the version's, hide the rest
    await upsert("map_pins", snap.pins);
    await client.query("UPDATE map_pins SET is_active = false, updated_at = now() WHERE NOT (id = ANY($1::int[]))", [snap.pins.map(p => Number(p["id"]))]);
    // Buildings and walkways: exactly the version's
    await client.query("DELETE FROM map_features WHERE NOT (id = ANY($1::int[]))", [snap.features.map(f => Number(f["id"]))]);
    await upsert("map_features", snap.features);
    await client.query("DELETE FROM map_paths WHERE NOT (id = ANY($1::int[]))", [snap.paths.map(p => Number(p["id"]))]);
    await upsert("map_paths", snap.paths);
    await upsert("map_config", snap.config ?? []);
    await client.query(
      `INSERT INTO map_layout_meta (id, version) VALUES (1, 1)
       ON CONFLICT (id) DO UPDATE SET version = map_layout_meta.version + 1, updated_at = now()`);
    await client.query("COMMIT");
    await auditReq(req, res, { action: "map.version_restore", resource: "map_versions", recordId: id, context: { safety_version: safety.id, pins: snap.pins.length, features: snap.features.length, paths: snap.paths.length } });
    res.json({ restored: id, safety_version: safety.id });
  } catch (err) {
    await client.query("ROLLBACK");
    await auditReq(req, res, { action: "map.version_restore", resource: "map_versions", recordId: id, result: "failure", context: { error: (err as Error).message } });
    res.status(500).json({ error: `Could not restore the version: ${(err as Error).message}` });
  } finally {
    client.release();
  }
});

export default router;
