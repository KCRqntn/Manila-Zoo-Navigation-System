import { Router } from "express";
import { eq, ilike, and, sql } from "drizzle-orm";
import { db, animalsTable, categoriesTable, mapPinsTable, qrCodesTable } from "@workspace/db";
import {
  CreateAnimalBody,
  UpdateAnimalBody,
  GetAnimalParams,
  UpdateAnimalParams,
  DeleteAnimalParams,
  GetAnimalGalleryParams,
  AddAnimalGalleryItemParams,
  AddAnimalGalleryItemBody,
  FetchNearbyAnimalsParams,
} from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

// Helper to join animal with category and pin names
async function formatAnimal(a: typeof animalsTable.$inferSelect) {
  const [cat] = await db.select({ name: categoriesTable.name }).from(categoriesTable).where(eq(categoriesTable.id, a.categoryId ?? 0));
  const [pin] = a.locationId ? await db.select({ name: mapPinsTable.name }).from(mapPinsTable).where(eq(mapPinsTable.id, a.locationId)) : [null];
  return {
    ...a,
    category_name: cat?.name ?? null,
    location_name: pin?.name ?? null,
  };
}

router.get("/animals", async (req, res): Promise<void> => {
  const { category_id, search, conservation_status, limit = "50", offset = "0" } = req.query;

  let conditions = [];
  if (category_id) conditions.push(eq(animalsTable.categoryId, Number(category_id)));
  if (conservation_status) conditions.push(eq(animalsTable.conservationStatus, String(conservation_status)));
  if (search) conditions.push(ilike(animalsTable.name, `%${search}%`));

  const query = db
    .select({
      animal: animalsTable,
      category_name: categoriesTable.name,
      location_name: mapPinsTable.name,
    })
    .from(animalsTable)
    .leftJoin(categoriesTable, eq(animalsTable.categoryId, categoriesTable.id))
    .leftJoin(mapPinsTable, eq(animalsTable.locationId, mapPinsTable.id))
    .orderBy(animalsTable.name)
    .limit(Number(limit))
    .offset(Number(offset));

  const rows = conditions.length
    ? await query.where(and(...conditions))
    : await query;

  const animals = rows.map(r => ({ ...r.animal, category_name: r.category_name ?? null, location_name: r.location_name ?? null }));
  res.json(animals);
});

type AnimalBody = Partial<Record<string, unknown>>;
type AnimalColumns = Partial<typeof animalsTable.$inferInsert>;

/**
 * API fields (snake_case) to table columns, for every field the admin form can send. Only fields
 * present in the request are included, so an update changes just what was sent; null clears a field.
 */
function animalColumns(d: AnimalBody): AnimalColumns {
  const out: AnimalColumns = {};
  const text = (key: string, col: keyof AnimalColumns) => {
    if (d[key] !== undefined) (out as Record<string, unknown>)[col] = d[key] === null ? null : String(d[key]).trim() || null;
  };
  const num = (key: string, col: keyof AnimalColumns) => {
    if (d[key] !== undefined) (out as Record<string, unknown>)[col] = d[key] == null ? null : String(d[key]);
  };
  const id = (key: string, col: keyof AnimalColumns) => {
    if (d[key] !== undefined) (out as Record<string, unknown>)[col] = d[key] == null ? null : Number(d[key]);
  };
  text("name", "name");
  text("scientific_name", "scientificName");
  text("common_name", "commonName");
  for (const k of ["kingdom", "phylum", "class", "order", "family", "genus", "species", "habitat", "diet", "description"] as const) text(k, k);
  text("conservation_status", "conservationStatus");
  text("feeding_schedule", "feedingSchedule");
  text("image_url", "imageUrl");
  num("weight_kg", "weightKg");
  num("height_cm", "heightCm");
  num("lifespan_years", "lifespanYears");
  id("category_id", "categoryId");
  id("location_id", "locationId");
  if (d["is_featured"] != null) out.isFeatured = Boolean(d["is_featured"]);
  // Facts are stored as a list; the form sends one fact per line
  if (d["interesting_facts"] !== undefined) {
    out.interestingFacts = d["interesting_facts"] == null ? null
      : String(d["interesting_facts"]).split(/\r?\n/).map(f => f.trim()).filter(Boolean);
  }
  return out;
}

/**
 * Open maps (visitor and admin) poll GET /map/version and reload their places when it changes.
 * The map lists which animals live at each exhibit, so an animal placed at, moved between or
 * removed from an exhibit counts as a map change too.
 */
async function bumpMapVersion(): Promise<void> {
  await pool.query(`INSERT INTO map_layout_meta (id, version) VALUES (1, 1)
    ON CONFLICT (id) DO UPDATE SET version = map_layout_meta.version + 1, updated_at = now()`);
}

router.post("/animals", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAnimalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [animal] = await db.insert(animalsTable).values({
    isFeatured: false,
    ...animalColumns(parsed.data),
    name: parsed.data.name.trim(),
  }).returning();

  if (animal?.locationId != null) await bumpMapVersion();
  res.status(201).json({ ...animal, category_name: null });
});

router.get("/animals/featured", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ animal: animalsTable, category_name: categoriesTable.name })
    .from(animalsTable)
    .leftJoin(categoriesTable, eq(animalsTable.categoryId, categoriesTable.id))
    .where(eq(animalsTable.isFeatured, true))
    .orderBy(sql`${animalsTable.viewCount} DESC`)
    .limit(8);

  res.json(rows.map(r => ({ ...r.animal, category_name: r.category_name ?? null })));
});

router.get("/animals/:id", async (req, res): Promise<void> => {
  const params = GetAnimalParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [row] = await db
    .select({ animal: animalsTable, category_name: categoriesTable.name, location_name: mapPinsTable.name })
    .from(animalsTable)
    .leftJoin(categoriesTable, eq(animalsTable.categoryId, categoriesTable.id))
    .leftJoin(mapPinsTable, eq(animalsTable.locationId, mapPinsTable.id))
    .where(eq(animalsTable.id, params.data.id));

  if (!row?.animal) { res.status(404).json({ error: "Animal not found" }); return; }

  // Increment view count async
  db.update(animalsTable).set({ viewCount: (row.animal.viewCount || 0) + 1 }).where(eq(animalsTable.id, params.data.id)).catch(() => {});

  res.json({ ...row.animal, category_name: row.category_name ?? null, location_name: row.location_name ?? null });
});

router.patch("/animals/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAnimalParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateAnimalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData = animalColumns(parsed.data);
  if (updateData.name === null) delete updateData.name; // the name can't be cleared
  updateData.updatedAt = new Date();

  // The exhibit before the change: a move (or a rename shown in the exhibit's list) updates the map
  const [before] = await db.select({ locationId: animalsTable.locationId, name: animalsTable.name })
    .from(animalsTable).where(eq(animalsTable.id, params.data.id));
  const [animal] = await db.update(animalsTable).set(updateData).where(eq(animalsTable.id, params.data.id)).returning();
  if (!animal) { res.status(404).json({ error: "Animal not found" }); return; }
  const mapChanged = before?.locationId !== animal.locationId
    || (animal.locationId != null && (before?.name !== animal.name || updateData.imageUrl !== undefined || updateData.scientificName !== undefined));
  if (mapChanged) await bumpMapVersion();
  res.json({ ...animal, category_name: null });
});

router.delete("/animals/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAnimalParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  // One transaction: map places showing this animal are unlinked (they stay on the map), then the
  // animal goes; its QR codes, gallery, favorites, feedback and game stops go with it (cascade),
  // and visit statistics keep their rows without the link.
  const client = await pool.connect();
  let deleted = 0;
  try {
    await client.query("BEGIN");
    const unlinked = await client.query("UPDATE map_pins SET animal_id = NULL, updated_at = now() WHERE animal_id = $1", [params.data.id]);
    const removed = await client.query<{ location_id: number | null }>("DELETE FROM animals WHERE id = $1 RETURNING location_id", [params.data.id]);
    deleted = removed.rowCount ?? 0;
    // Open maps reload their places when a pin changed or an exhibit lost a resident
    if (deleted && (unlinked.rowCount || removed.rows[0]?.location_id != null)) {
      await client.query(`INSERT INTO map_layout_meta (id, version) VALUES (1, 1)
        ON CONFLICT (id) DO UPDATE SET version = map_layout_meta.version + 1, updated_at = now()`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // Another record still depends on the animal: say so instead of a bare server error
    if ((err as { code?: string }).code === "23503") {
      res.status(409).json({ error: "This animal is still referenced by other records, so it can't be deleted." });
      return;
    }
    throw err;
  } finally {
    client.release();
  }
  if (!deleted) { res.status(404).json({ error: "Animal not found" }); return; }
  res.sendStatus(204);
});

router.get("/animals/:id/gallery", async (req, res): Promise<void> => {
  const params = GetAnimalGalleryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  // animal_gallery is created by migrate.ts and has no Drizzle schema, so read it with SQL
  const { rows } = await pool.query(
    "SELECT id, animal_id, image_url, caption, sort_order, created_at FROM animal_gallery WHERE animal_id = $1 ORDER BY sort_order, id",
    [params.data.id],
  );
  res.json(rows);
});

router.post("/animals/:id/gallery", requireAdmin, async (req, res): Promise<void> => {
  const params = AddAnimalGalleryItemParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = AddAnimalGalleryItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  // Gallery stored via raw SQL
  const result = await pool.query(
    "INSERT INTO animal_gallery (animal_id, image_url, caption, sort_order) VALUES ($1, $2, $3, $4) RETURNING *",
    [params.data.id, parsed.data.image_url, parsed.data.caption ?? null, parsed.data.sort_order ?? 0]
  );
  res.status(201).json(result.rows[0]);
});

router.delete("/animals/:id/gallery/:itemId", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id), itemId = Number(req.params.itemId);
  if (!Number.isInteger(id) || !Number.isInteger(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await pool.query("DELETE FROM animal_gallery WHERE id = $1 AND animal_id = $2", [itemId, id]);
  if (!result.rowCount) { res.status(404).json({ error: "Photo not found" }); return; }
  res.sendStatus(204);
});

router.get("/animals/:id/nearby", async (req, res): Promise<void> => {
  const params = FetchNearbyAnimalsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [animal] = await db.select({ locationId: animalsTable.locationId, categoryId: animalsTable.categoryId })
    .from(animalsTable).where(eq(animalsTable.id, params.data.id));

  if (!animal?.categoryId) { res.json([]); return; }

  const nearby = await db
    .select({ animal: animalsTable, category_name: categoriesTable.name })
    .from(animalsTable)
    .leftJoin(categoriesTable, eq(animalsTable.categoryId, categoriesTable.id))
    .where(and(eq(animalsTable.categoryId, animal.categoryId), sql`${animalsTable.id} != ${params.data.id}`))
    .limit(6);

  const nearbyAnimals = Array.isArray(nearby)
    ? nearby.map(r => ({ ...r.animal, category_name: r.category_name ?? null }))
    : [];

  res.json(nearbyAnimals);
});

export default router;
