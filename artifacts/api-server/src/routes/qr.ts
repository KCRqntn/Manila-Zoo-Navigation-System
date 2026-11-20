import { Router } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, pool, qrCodesTable, animalsTable, categoriesTable, analyticsTable, mapPinsTable } from "@workspace/db";
import { GenerateQrCodeBody, GetQrCodeParams, DeleteQrCodeParams, ScanQrCodeParams } from "@workspace/api-zod";
import { requireAdmin } from "../middleware/requireAdmin";
import { getSetting } from "../lib/settings";
import { isInsideZoo } from "../lib/zooBoundary";

const router = Router();

/** The code's image holds a link to the public website, so phones' own camera apps open it too */
async function qrImageFor(code: string): Promise<string> {
  const site = String((await getSetting<string>("public_site_url").catch(() => "")) ?? "").replace(/\/+$/, "");
  const data = site ? `${site}/q/${encodeURIComponent(code)}` : code;
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;
}

/** Adds qr_codes.map_pin_id (location QR codes) to databases created before it existed. */
export async function ensureQrLocationSchema(): Promise<void> {
  await pool.query("ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS map_pin_id INTEGER REFERENCES map_pins(id) ON DELETE CASCADE");
}

router.get("/qr", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ qr: qrCodesTable, animal_name: animalsTable.name, location_name: mapPinsTable.name })
    .from(qrCodesTable)
    .leftJoin(animalsTable, eq(qrCodesTable.animalId, animalsTable.id))
    .leftJoin(mapPinsTable, eq(qrCodesTable.mapPinId, mapPinsTable.id))
    .orderBy(qrCodesTable.createdAt);
  res.json(rows.map(r => ({ ...r.qr, animal_name: r.animal_name ?? null, location_name: r.location_name ?? null })));
});

router.post("/qr", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GenerateQrCodeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const code = `MNL-ZOO-${randomUUID().slice(0, 8).toUpperCase()}`;
  const qrImageUrl = await qrImageFor(code);
  const [qr] = await db.insert(qrCodesTable).values({ code, animalId: parsed.data.animal_id, qrImageUrl, scanCount: 0, isActive: true }).returning();
  res.status(201).json({ ...qr, animal_name: null });
});

// Location QR code for a place on the map (restroom, gate, info desk…), to post at that spot
router.post("/qr/location", requireAdmin, async (req, res): Promise<void> => {
  const pinId = Number(req.body?.map_pin_id);
  const [pin] = Number.isInteger(pinId) ? await db.select().from(mapPinsTable).where(eq(mapPinsTable.id, pinId)) : [];
  if (!pin) { res.status(400).json({ error: "Choose a place on the map" }); return; }
  // A checkpoint marks a spot inside the zoo; a code elsewhere would start routes outside it
  if (!isInsideZoo(pin.lat, pin.lng)) { res.status(400).json({ error: `${pin.name} is outside Manila Zoo. Location QR codes can only mark places inside the zoo.` }); return; }
  const code = `MNL-LOC-${randomUUID().slice(0, 8).toUpperCase()}`;
  const qrImageUrl = await qrImageFor(code);
  const [qr] = await db.insert(qrCodesTable).values({ code, mapPinId: pin.id, qrImageUrl, scanCount: 0, isActive: true }).returning();
  res.status(201).json({ ...qr, animal_name: null, location_name: pin.name });
});

router.get("/qr/:id", async (req, res): Promise<void> => {
  const params = GetQrCodeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.select({ qr: qrCodesTable, animal_name: animalsTable.name }).from(qrCodesTable).leftJoin(animalsTable, eq(qrCodesTable.animalId, animalsTable.id)).where(eq(qrCodesTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "QR code not found" }); return; }
  res.json({ ...row.qr, animal_name: row.animal_name ?? null });
});

router.delete("/qr/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteQrCodeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(qrCodesTable).where(eq(qrCodesTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/qr/scan/:code", async (req, res): Promise<void> => {
  const params = ScanQrCodeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [qrRow] = await db.select({ qr: qrCodesTable, animal_name: animalsTable.name }).from(qrCodesTable).leftJoin(animalsTable, eq(qrCodesTable.animalId, animalsTable.id)).where(eq(qrCodesTable.code, params.data.code));
  if (!qrRow?.qr?.isActive) { res.status(404).json({ error: "QR code not found or inactive" }); return; }

  // Increment scan count
  db.update(qrCodesTable).set({ scanCount: (qrRow.qr.scanCount || 0) + 1 }).where(eq(qrCodesTable.id, qrRow.qr.id)).catch(() => {});
  db.insert(analyticsTable).values({ eventType: "qr_scan", animalId: qrRow.qr.animalId ?? undefined, qrCodeId: qrRow.qr.id }).catch(() => {});

  // Get full animal
  let animal = null;
  let nearbyAnimals: unknown[] = [];
  if (qrRow.qr.animalId) {
    const [animalRow] = await db.select({ animal: animalsTable, category_name: categoriesTable.name }).from(animalsTable).leftJoin(categoriesTable, eq(animalsTable.categoryId, categoriesTable.id)).where(eq(animalsTable.id, qrRow.qr.animalId));
    if (animalRow) {
      animal = { ...animalRow.animal, category_name: animalRow.category_name ?? null };
      if (animal.categoryId) {
        const nearby = await db.select({ animal: animalsTable, category_name: categoriesTable.name }).from(animalsTable).leftJoin(categoriesTable, eq(animalsTable.categoryId, categoriesTable.id)).where(eq(animalsTable.categoryId, animal.categoryId)).limit(4);
        nearbyAnimals = Array.isArray(nearby)
          ? nearby.map(r => ({ ...r.animal, category_name: r.category_name ?? null }))
          : [];
      }
    }
  }

  // Where the visitor is standing: the place a location code marks, or the exhibit of the animal.
  // These are map pins, so the position is a verified spot rather than a guess. It's a one-off
  // starting point for routes, not tracking, and only given for places inside the zoo.
  const locationPinId = qrRow.qr.mapPinId ?? (animal as { locationId?: number | null } | null)?.locationId ?? null;
  const [pin] = locationPinId ? await db.select().from(mapPinsTable).where(eq(mapPinsTable.id, locationPinId)) : [];
  const location = pin && pin.isActive && isInsideZoo(pin.lat, pin.lng) ? { pin_id: pin.id, name: pin.name, pin_type: pin.pinType, lat: Number(pin.lat), lng: Number(pin.lng) } : null;

  res.json({ animal, location, qr_code: { ...qrRow.qr, animal_name: qrRow.animal_name ?? null }, nearby_animals: Array.isArray(nearbyAnimals) ? nearbyAnimals : [] });
});

export default router;
