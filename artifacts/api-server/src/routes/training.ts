import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, trainingDatasetTable, type TrainingDataset } from "@workspace/db";
import { AddTrainingDataBody, DeleteTrainingDataParams, UpdateTrainingDataParams, UpdateTrainingDataBody } from "@workspace/api-zod";
import { requireAdmin } from "../middleware/requireAdmin";
import { AI_SERVICE_URL } from "../lib/aiService";

const router = Router();

// The table stores input/output; the API speaks question/answer (see TrainingDataItem in the spec)
const serialize = (row: TrainingDataset) => ({
  id: row.id,
  intent: row.intent ?? "",
  question: row.input,
  answer: row.output,
  language: row.language,
  is_validated: row.isValidated,
  created_at: row.createdAt,
});

// Used when the AI service is offline, so admins can still pick a valid intent
const DEFAULT_INTENTS = ["animal_info", "emergency", "events", "facilities", "general", "greeting", "navigation", "parking", "tickets", "zoo_hours"];

router.get("/training/dataset", async (_req, res): Promise<void> => {
  const rows = await db.select().from(trainingDatasetTable).orderBy(trainingDatasetTable.createdAt);
  res.json(rows.map(serialize));
});

router.post("/training/dataset", requireAdmin, async (req, res): Promise<void> => {
  const parsed = AddTrainingDataBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(trainingDatasetTable).values({ input: parsed.data.question, output: parsed.data.answer, intent: parsed.data.intent ?? undefined, language: parsed.data.language ?? "en", isValidated: false }).returning();
  res.status(201).json(serialize(row!));
});

router.patch("/training/dataset/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateTrainingDataParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateTrainingDataBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const update: Partial<typeof trainingDatasetTable.$inferInsert> = {};
  if (parsed.data.intent != null) update.intent = parsed.data.intent;
  if (parsed.data.is_validated != null) update.isValidated = parsed.data.is_validated;
  if (Object.keys(update).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  const [row] = await db.update(trainingDatasetTable).set(update).where(eq(trainingDatasetTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Training example not found" }); return; }
  res.json(serialize(row));
});

router.delete("/training/dataset/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteTrainingDataParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(trainingDatasetTable).where(eq(trainingDatasetTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/training/model-status", async (_req, res): Promise<void> => {
  const rows = await db.select({ isValidated: trainingDatasetTable.isValidated }).from(trainingDatasetTable);
  const approved = rows.filter(r => r.isValidated).length;
  const counts = { approved_examples: approved, pending_examples: rows.length - approved };

  try {
    const response = await fetch(`${AI_SERVICE_URL}/report`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`AI service returned ${response.status}`);
    const r = (await response.json()) as Record<string, unknown> & { available?: boolean; intents?: string[] };
    res.json({
      service_online: true,
      model_available: !!r.available,
      base_model: r["base_model"] ?? null,
      trained_at: r["trained_at"] ?? null,
      train_size: r["train_size"] ?? null,
      admin_examples_used: r["admin_examples_used"] ?? null,
      test_size: r["test_size"] ?? null,
      accuracy: r["accuracy"] ?? null,
      macro_f1: r["macro_f1"] ?? null,
      keyword_accuracy: r["keyword_accuracy"] ?? null,
      intents: r.intents?.length ? r.intents : DEFAULT_INTENTS,
      ...counts,
    });
  } catch {
    res.json({ service_online: false, model_available: false, intents: DEFAULT_INTENTS, ...counts });
  }
});

export default router;
