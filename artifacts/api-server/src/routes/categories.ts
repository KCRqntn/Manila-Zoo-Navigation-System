import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, categoriesTable, animalsTable } from "@workspace/db";
import { CreateCategoryBody, UpdateCategoryParams, UpdateCategoryBody, DeleteCategoryParams } from "@workspace/api-zod";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      description: categoriesTable.description,
      icon: categoriesTable.icon,
      color: categoriesTable.color,
      createdAt: categoriesTable.createdAt,
      animal_count: sql<number>`cast(count(${animalsTable.id}) as int)`,
    })
    .from(categoriesTable)
    .leftJoin(animalsTable, eq(animalsTable.categoryId, categoriesTable.id))
    .groupBy(categoriesTable.id)
    .orderBy(categoriesTable.name);

  res.json(rows);
});

router.post("/categories", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [cat] = await db.insert(categoriesTable).values({ name: parsed.data.name, description: parsed.data.description ?? undefined, icon: parsed.data.icon ?? undefined, color: parsed.data.color ?? undefined }).returning();
  res.status(201).json({ ...cat, animal_count: 0 });
});

router.patch("/categories/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [cat] = await db.update(categoriesTable).set({ name: parsed.data.name ?? undefined, description: parsed.data.description ?? undefined, icon: parsed.data.icon ?? undefined, color: parsed.data.color ?? undefined }).where(eq(categoriesTable.id, params.data.id)).returning();
  if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
  res.json({ ...cat, animal_count: 0 });
});

router.delete("/categories/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(categoriesTable).where(eq(categoriesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
