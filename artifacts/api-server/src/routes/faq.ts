import { Router } from "express";
import { eq, ilike, and } from "drizzle-orm";
import { db, faqTable } from "@workspace/db";
import { CreateFaqBody, UpdateFaqParams, UpdateFaqBody, DeleteFaqParams } from "@workspace/api-zod";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

router.get("/faq", async (req, res): Promise<void> => {
  const { category, language } = req.query;
  const conditions = [eq(faqTable.isActive, true)];
  if (category) conditions.push(eq(faqTable.category, String(category)));
  if (language) conditions.push(eq(faqTable.language, String(language)));
  const rows = await db.select().from(faqTable).where(and(...conditions)).orderBy(faqTable.createdAt);
  res.json(rows);
});

router.post("/faq", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateFaqBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [faq] = await db.insert(faqTable).values({ question: parsed.data.question, answer: parsed.data.answer, category: parsed.data.category ?? undefined, language: parsed.data.language ?? "en", isActive: true }).returning();
  res.status(201).json(faq);
});

router.patch("/faq/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateFaqParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateFaqBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: Partial<typeof faqTable.$inferInsert> = {};
  if (parsed.data.question != null) update.question = parsed.data.question;
  if (parsed.data.answer != null) update.answer = parsed.data.answer;
  if (parsed.data.category != null) update.category = parsed.data.category;
  if (parsed.data.is_active != null) update.isActive = parsed.data.is_active;
  const [faq] = await db.update(faqTable).set(update).where(eq(faqTable.id, params.data.id)).returning();
  if (!faq) { res.status(404).json({ error: "FAQ not found" }); return; }
  res.json(faq);
});

router.delete("/faq/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteFaqParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(faqTable).where(eq(faqTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
