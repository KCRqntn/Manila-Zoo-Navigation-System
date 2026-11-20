import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requirePermission, verifiedUser, can } from "../middleware/access";
import { auditReq } from "../lib/audit";
import { isInsideZoo, metresOutsideZoo } from "../lib/zooBoundary";
import { FACILITY_STATUSES, FACILITY_TYPES, MARKER_SHAPES, TREE_STATUSES } from "../lib/parkSeed";

/**
 * Facilities and Park Areas (planting zones with their trees), managed in the admin dashboard and
 * shown on the 3D map. Anyone can read them (the map needs them); changes need the map permission
 * and each one is written to the audit log with what it was before and after.
 * Tables: facilities, park_zones, zone_trees (migration 2026-11-12-01-facilities-park-areas).
 */
const router = Router();
const mapWrite = requirePermission("map.write");

/**
 * Open maps poll GET /map/version and reload what changed, so facility and tree edits bump it like
 * every other map edit (the maps also poll these lists every 30 seconds on their own).
 */
async function bumpMapVersion(): Promise<void> {
  await pool.query(`INSERT INTO map_layout_meta (id, version) VALUES (1, 1)
    ON CONFLICT (id) DO UPDATE SET version = map_layout_meta.version + 1, updated_at = now()`);
}
// Every successful write here (status < 400) bumps the map version
router.use(/^\/admin\/(facilities|park-areas|trees)/, (req, res, next) => {
  if (req.method !== "GET") res.on("finish", () => { if (res.statusCode < 400) bumpMapVersion().catch(() => {}); });
  next();
});

/** Staff also see unpublished facilities (to edit them); visitors only published ones. */
async function isStaff(req: Request): Promise<boolean> {
  if (!req.headers.authorization) return false;
  const user = await verifiedUser(req);
  return !!user && can(user, "dashboard.read");
}

type Body = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const optText = (v: unknown) => text(v) || null;
const isDuplicate = (err: unknown) => (err as { code?: string }).code === "23505";
const idParam = (req: Request) => { const id = Number(req.params["id"]); return Number.isInteger(id) && id > 0 ? id : null; };
const fail = (res: Response, status: number, error: string) => { res.status(status).json({ error }); };

/** A position must be a real latitude/longitude inside the zoo fence. */
function position(b: Body): { lat: number; lng: number } | string {
  const lat = Number(b["lat"]), lng = Number(b["lng"]);
  if (b["lat"] == null || b["lng"] == null || b["lat"] === "" || b["lng"] === "") return "Set the map position (click the map or type the coordinates)";
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return "The position isn't a valid latitude/longitude";
  if (!isInsideZoo(lat, lng)) return `That position is about ${Math.round(metresOutsideZoo(lat, lng))} m outside Manila Zoo. Place it inside the zoo grounds.`;
  return { lat, lng };
}

function photoUrl(v: unknown): string | null | false {
  const url = optText(v);
  if (!url) return null;
  try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:" ? url : false; } catch { return false; }
}

// ─── Facilities ──────────────────────────────────────────────────────────────

type FacilityInput = { name: string; type: string; description: string | null; status: string; photo_url: string | null; lat: number; lng: number; is_active: boolean };

function facilityInput(b: Body): FacilityInput | string {
  const name = text(b["name"]);
  if (!name) return "Enter the facility's name";
  if (name.length > 120) return "The name is too long (120 characters at most)";
  const type = text(b["type"]);
  if (!(FACILITY_TYPES as readonly string[]).includes(type)) return `Type must be one of: ${FACILITY_TYPES.join(", ")}`;
  const status = text(b["status"]) || "open";
  if (!(FACILITY_STATUSES as readonly string[]).includes(status)) return "Status must be Open, Under Maintenance or Closed";
  const photo = photoUrl(b["photo_url"]);
  if (photo === false) return "The photo must be a web link (https://…)";
  const pos = position(b);
  if (typeof pos === "string") return pos;
  if (b["is_active"] !== undefined && typeof b["is_active"] !== "boolean") return "Published must be true or false";
  // Published unless the admin saves it as a draft
  return { name, type, description: optText(b["description"]), status, photo_url: photo, ...pos, is_active: b["is_active"] !== false };
}

router.get("/facilities", async (req, res): Promise<void> => {
  const staff = await isStaff(req);
  const { rows } = await pool.query(`SELECT * FROM facilities ${staff ? "" : "WHERE is_active"} ORDER BY name`);
  res.json(rows);
});

router.post("/admin/facilities", mapWrite, async (req, res): Promise<void> => {
  const f = facilityInput(req.body ?? {});
  if (typeof f === "string") return fail(res, 400, f);
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO facilities (name, type, description, status, photo_url, lat, lng, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [f.name, f.type, f.description, f.status, f.photo_url, f.lat, f.lng, f.is_active]);
    await auditReq(req, res, { action: "facility.create", resource: "facilities", recordId: row.id, after: row });
    res.status(201).json(row);
  } catch (err) {
    if (isDuplicate(err)) return fail(res, 409, `A facility called "${f.name}" already exists. Use a different name.`);
    throw err;
  }
});

router.put("/admin/facilities/:id", mapWrite, async (req, res): Promise<void> => {
  const id = idParam(req);
  if (!id) return fail(res, 400, "Invalid facility");
  const f = facilityInput(req.body ?? {});
  if (typeof f === "string") return fail(res, 400, f);
  const { rows: [before] } = await pool.query("SELECT * FROM facilities WHERE id = $1", [id]);
  if (!before) return fail(res, 404, "Facility not found");
  try {
    const { rows: [row] } = await pool.query(
      // A form that doesn't send "is_active" (older pages) keeps the current setting
      `UPDATE facilities SET name=$1, type=$2, description=$3, status=$4, photo_url=$5, lat=$6, lng=$7, is_active=$9, updated_at=now() WHERE id=$8 RETURNING *`,
      [f.name, f.type, f.description, f.status, f.photo_url, f.lat, f.lng, id, req.body?.is_active === undefined ? before.is_active : f.is_active]);
    await auditReq(req, res, { action: "facility.update", resource: "facilities", recordId: id, before, after: row });
    res.json(row);
  } catch (err) {
    if (isDuplicate(err)) return fail(res, 409, `A facility called "${f.name}" already exists. Use a different name.`);
    throw err;
  }
});

router.delete("/admin/facilities/:id", mapWrite, async (req, res): Promise<void> => {
  const id = idParam(req);
  if (!id) return fail(res, 400, "Invalid facility");
  const { rows: [before] } = await pool.query("DELETE FROM facilities WHERE id = $1 RETURNING *", [id]);
  if (!before) return fail(res, 404, "Facility not found");
  await auditReq(req, res, { action: "facility.delete", resource: "facilities", recordId: id, before });
  res.sendStatus(204);
});

// ─── Park areas (zones) ──────────────────────────────────────────────────────

type ZoneInput = { name: string; marker_shape: string; marker_color: string; description: string | null; legend_species: string[] };

function zoneInput(b: Body): ZoneInput | string {
  const name = text(b["name"]);
  if (!name) return "Enter the park area's name";
  if (name.length > 120) return "The name is too long (120 characters at most)";
  const shape = text(b["marker_shape"]);
  if (!(MARKER_SHAPES as readonly string[]).includes(shape)) return "Choose a marker shape";
  const color = text(b["marker_color"]);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return "The marker colour must be a colour like #2d6a4f";
  const species = Array.isArray(b["legend_species"]) ? b["legend_species"].map(text).filter(Boolean) : [];
  return { name, marker_shape: shape, marker_color: color.toLowerCase(), description: optText(b["description"]), legend_species: [...new Set(species)].slice(0, 100) };
}

/** Zones with their trees, in the order the legend lists them. */
async function loadZones(): Promise<unknown[]> {
  const { rows: zones } = await pool.query("SELECT * FROM park_zones ORDER BY sort_order, name");
  const { rows: trees } = await pool.query("SELECT * FROM zone_trees ORDER BY id");
  return zones.map(z => ({ ...z, trees: trees.filter(t => t.zone_id === z.id) }));
}

router.get("/park-areas", async (_req, res): Promise<void> => {
  res.json(await loadZones());
});

router.post("/admin/park-areas", mapWrite, async (req, res): Promise<void> => {
  const z = zoneInput(req.body ?? {});
  if (typeof z === "string") return fail(res, 400, z);
  try {
    const { rows: [row] } = await pool.query(
      `INSERT INTO park_zones (name, marker_shape, marker_color, description, legend_species, sort_order)
       VALUES ($1,$2,$3,$4,$5, (SELECT coalesce(max(sort_order), -1) + 1 FROM park_zones)) RETURNING *`,
      [z.name, z.marker_shape, z.marker_color, z.description, z.legend_species]);
    await auditReq(req, res, { action: "park_area.create", resource: "park_zones", recordId: row.id, after: row });
    res.status(201).json({ ...row, trees: [] });
  } catch (err) {
    if (isDuplicate(err)) return fail(res, 409, `A park area called "${z.name}" already exists. Use a different name.`);
    throw err;
  }
});

router.put("/admin/park-areas/:id", mapWrite, async (req, res): Promise<void> => {
  const id = idParam(req);
  if (!id) return fail(res, 400, "Invalid park area");
  const z = zoneInput(req.body ?? {});
  if (typeof z === "string") return fail(res, 400, z);
  const { rows: [before] } = await pool.query("SELECT * FROM park_zones WHERE id = $1", [id]);
  if (!before) return fail(res, 404, "Park area not found");
  try {
    const { rows: [row] } = await pool.query(
      `UPDATE park_zones SET name=$1, marker_shape=$2, marker_color=$3, description=$4, legend_species=$5, updated_at=now() WHERE id=$6 RETURNING *`,
      [z.name, z.marker_shape, z.marker_color, z.description, z.legend_species, id]);
    await auditReq(req, res, { action: "park_area.update", resource: "park_zones", recordId: id, before, after: row });
    res.json(row);
  } catch (err) {
    if (isDuplicate(err)) return fail(res, 409, `A park area called "${z.name}" already exists. Use a different name.`);
    throw err;
  }
});

/**
 * Deletes a zone. If it still has trees, the request must say what happens to them:
 * ?move_to=<zone id> moves them to another zone first, ?delete_trees=true removes them too.
 * Without either, the answer is 409 with the number of trees, so the dashboard can ask.
 */
router.delete("/admin/park-areas/:id", mapWrite, async (req, res): Promise<void> => {
  const id = idParam(req);
  if (!id) return fail(res, 400, "Invalid park area");
  const moveTo = req.query["move_to"] == null ? null : Number(req.query["move_to"]);
  const deleteTrees = req.query["delete_trees"] === "true";
  if (moveTo !== null && (!Number.isInteger(moveTo) || moveTo === id)) return fail(res, 400, "Choose a different park area to move the trees to");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [zone] } = await client.query("SELECT * FROM park_zones WHERE id = $1 FOR UPDATE", [id]);
    if (!zone) { await client.query("ROLLBACK"); return fail(res, 404, "Park area not found"); }
    const { rows: [{ n }] } = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM zone_trees WHERE zone_id = $1", [id]);
    let target: { id: number; name: string } | undefined;
    if (n > 0) {
      if (moveTo !== null) {
        ({ rows: [target] } = await client.query<{ id: number; name: string }>("SELECT id, name FROM park_zones WHERE id = $1", [moveTo]));
        if (!target) { await client.query("ROLLBACK"); return fail(res, 400, "The park area to move the trees to no longer exists"); }
        await client.query("UPDATE zone_trees SET zone_id = $1, updated_at = now() WHERE zone_id = $2", [moveTo, id]);
      } else if (deleteTrees) {
        await client.query("DELETE FROM zone_trees WHERE zone_id = $1", [id]);
      } else {
        await client.query("ROLLBACK");
        res.status(409).json({ error: `"${zone.name}" still has ${n} tree${n === 1 ? "" : "s"}. Move them to another park area or remove them first.`, code: "zone_has_trees", tree_count: n });
        return;
      }
    }
    await client.query("DELETE FROM park_zones WHERE id = $1", [id]);
    await client.query("COMMIT");
    await auditReq(req, res, {
      action: "park_area.delete", resource: "park_zones", recordId: id, before: zone,
      context: n > 0 ? (target ? { trees_moved: n, moved_to: target.name } : { trees_deleted: n }) : undefined,
    });
    res.sendStatus(204);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
});

// ─── Trees in a zone ─────────────────────────────────────────────────────────

type TreeInput = { zone_id: number; species: string; status: string; notes: string | null; lat: number; lng: number };

function treeInput(b: Body, zoneId: number): TreeInput | string {
  const species = text(b["species"]);
  if (!species) return "Enter the tree's species";
  if (species.length > 120) return "The species name is too long (120 characters at most)";
  const status = text(b["status"]) || "healthy";
  if (!(TREE_STATUSES as readonly string[]).includes(status)) return "Status must be Healthy, Needs Care, Dead or Cannot be Identified";
  const pos = position(b);
  if (typeof pos === "string") return pos;
  return { zone_id: zoneId, species, status, notes: optText(b["notes"]), ...pos };
}

router.post("/admin/park-areas/:id/trees", mapWrite, async (req, res): Promise<void> => {
  const zoneId = idParam(req);
  if (!zoneId) return fail(res, 400, "Invalid park area");
  const t = treeInput(req.body ?? {}, zoneId);
  if (typeof t === "string") return fail(res, 400, t);
  const { rows: [zone] } = await pool.query("SELECT name FROM park_zones WHERE id = $1", [zoneId]);
  if (!zone) return fail(res, 404, "Park area not found");
  const { rows: [row] } = await pool.query(
    `INSERT INTO zone_trees (zone_id, species, status, notes, lat, lng) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [t.zone_id, t.species, t.status, t.notes, t.lat, t.lng]);
  await auditReq(req, res, { action: "tree.create", resource: "zone_trees", recordId: row.id, after: { ...row, zone: zone.name } });
  res.status(201).json(row);
});

router.put("/admin/trees/:id", mapWrite, async (req, res): Promise<void> => {
  const id = idParam(req);
  if (!id) return fail(res, 400, "Invalid tree");
  const { rows: [before] } = await pool.query("SELECT * FROM zone_trees WHERE id = $1", [id]);
  if (!before) return fail(res, 404, "Tree not found");
  // A tree can be moved to another zone from its edit form
  const zoneId = req.body?.zone_id == null ? before.zone_id : Number(req.body.zone_id);
  const t = treeInput(req.body ?? {}, zoneId);
  if (typeof t === "string") return fail(res, 400, t);
  const { rows: [zone] } = await pool.query("SELECT name FROM park_zones WHERE id = $1", [zoneId]);
  if (!zone) return fail(res, 400, "That park area no longer exists");
  const { rows: [row] } = await pool.query(
    `UPDATE zone_trees SET zone_id=$1, species=$2, status=$3, notes=$4, lat=$5, lng=$6, updated_at=now() WHERE id=$7 RETURNING *`,
    [t.zone_id, t.species, t.status, t.notes, t.lat, t.lng, id]);
  await auditReq(req, res, { action: "tree.update", resource: "zone_trees", recordId: id, before, after: row });
  res.json(row);
});

router.delete("/admin/trees/:id", mapWrite, async (req, res): Promise<void> => {
  const id = idParam(req);
  if (!id) return fail(res, 400, "Invalid tree");
  const { rows: [before] } = await pool.query("DELETE FROM zone_trees WHERE id = $1 RETURNING *", [id]);
  if (!before) return fail(res, 404, "Tree not found");
  await auditReq(req, res, { action: "tree.delete", resource: "zone_trees", recordId: id, before });
  res.sendStatus(204);
});

export default router;
