import { Router } from "express";
import { eq, and, or, isNull, lte, gt, desc, sql } from "drizzle-orm";
import { archiveExpiredAnnouncements } from "./datasets";
import { db, announcementsTable } from "@workspace/db";
import { CreateAnnouncementBody, UpdateAnnouncementParams, UpdateAnnouncementBody, DeleteAnnouncementParams } from "@workspace/api-zod";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

// Visitors see published announcements whose publish time has come and that haven't expired,
// most urgent first (expired ones are archived by the rule in System Settings)
router.get("/announcements", async (_req, res): Promise<void> => {
  await archiveExpiredAnnouncements().catch(() => {});
  const now = new Date();
  const rows = await db.select().from(announcementsTable)
    .where(and(
      eq(announcementsTable.status, "published"),
      or(isNull(announcementsTable.publishAt), lte(announcementsTable.publishAt, now)),
      or(isNull(announcementsTable.expiresAt), gt(announcementsTable.expiresAt, now)),
    ))
    .orderBy(sql`CASE ${announcementsTable.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`, desc(announcementsTable.createdAt));
  res.json(rows.map(r => ({ ...r, message: r.content })));
});

router.post("/announcements", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAnnouncementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(announcementsTable).values({ title: parsed.data.title, content: parsed.data.message, type: parsed.data.type ?? "info", isActive: true }).returning();
  res.status(201).json({ ...row, message: row.content });
});

router.patch("/announcements/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAnnouncementParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateAnnouncementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: Partial<typeof announcementsTable.$inferInsert> = {};
  if (parsed.data.title != null) update.title = parsed.data.title;
  if (parsed.data.message != null) update.content = parsed.data.message;
  if (parsed.data.type != null) update.type = parsed.data.type;
  if (parsed.data.is_active != null) update.isActive = parsed.data.is_active;
  const [row] = await db.update(announcementsTable).set(update).where(eq(announcementsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Announcement not found" }); return; }
  res.json({ ...row, message: row.content });
});

router.delete("/announcements/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAnnouncementParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(announcementsTable).where(eq(announcementsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
