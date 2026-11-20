import { Router } from "express";
import { eq, and, or, isNull, lte, inArray } from "drizzle-orm";
import { db, eventsTable, mapPinsTable } from "@workspace/db";
import { CreateEventBody, UpdateEventParams, UpdateEventBody, DeleteEventParams } from "@workspace/api-zod";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

// Visitors see published and cancelled events (cancelled ones are labelled), never drafts or
// archived ones, and only once their publish time has come. Each carries its map place, if any.
router.get("/events", async (_req, res): Promise<void> => {
  const now = new Date();
  const rows = await db.select({ event: eventsTable, pin_name: mapPinsTable.name })
    .from(eventsTable)
    .leftJoin(mapPinsTable, eq(eventsTable.pinId, mapPinsTable.id))
    .where(and(
      inArray(eventsTable.status, ["published", "cancelled"]),
      or(isNull(eventsTable.publishAt), lte(eventsTable.publishAt, now)),
    ))
    .orderBy(eventsTable.startDate);
  res.json(rows.map(r => ({ ...r.event, pin_name: r.pin_name })));
});

router.post("/events", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(eventsTable).values({
    title: parsed.data.title,
    description: parsed.data.description ?? undefined,
    startDate: parsed.data.start_date ? new Date(parsed.data.start_date) : undefined,
    endDate: parsed.data.end_date ? new Date(parsed.data.end_date) : undefined,
    location: parsed.data.location ?? undefined,
    imageUrl: parsed.data.image_url ?? undefined,
    isActive: true,
  }).returning();
  res.status(201).json(row);
});

router.patch("/events/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateEventParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateEventBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: Partial<typeof eventsTable.$inferInsert> = {};
  if (parsed.data.title != null) update.title = parsed.data.title;
  if (parsed.data.description != null) update.description = parsed.data.description;
  if (parsed.data.is_active != null) update.isActive = parsed.data.is_active;
  const [row] = await db.update(eventsTable).set(update).where(eq(eventsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Event not found" }); return; }
  res.json(row);
});

router.delete("/events/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteEventParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(eventsTable).where(eq(eventsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
