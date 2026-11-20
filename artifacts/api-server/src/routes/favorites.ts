import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, favoritesTable, animalsTable, categoriesTable } from "@workspace/db";
import { AddFavoriteBody, RemoveFavoriteParams } from "@workspace/api-zod";
import { requireUser, currentUser } from "../middleware/requireUser";

const router = Router();

// Favorites belong to the signed-in visitor; the login token is verified, never trusted as-is

router.get("/favorites", requireUser, async (_req, res): Promise<void> => {
  const userId = currentUser(res).id;
  const rows = await db
    .select({ fav: favoritesTable, animal: animalsTable, category_name: categoriesTable.name })
    .from(favoritesTable)
    .leftJoin(animalsTable, eq(favoritesTable.animalId, animalsTable.id))
    .leftJoin(categoriesTable, eq(animalsTable.categoryId, categoriesTable.id))
    .where(eq(favoritesTable.userId, userId))
    .orderBy(favoritesTable.createdAt);
  res.json(rows.map(r => ({ ...r.fav, animal: r.animal ? { ...r.animal, category_name: r.category_name ?? null } : null })));
});

router.post("/favorites", requireUser, async (req, res): Promise<void> => {
  const userId = currentUser(res).id;
  const parsed = AddFavoriteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [fav] = await db.insert(favoritesTable).values({ animalId: parsed.data.animal_id, userId }).onConflictDoNothing().returning();
    if (!fav) {
      // Already exists — return existing
      const [existing] = await db.select().from(favoritesTable).where(and(eq(favoritesTable.animalId, parsed.data.animal_id), eq(favoritesTable.userId, userId)));
      res.status(201).json({ ...existing, animal: null });
      return;
    }
    res.status(201).json({ ...fav, animal: null });
  } catch {
    res.status(500).json({ error: "Failed to add favorite" });
  }
});

router.delete("/favorites/:id", requireUser, async (req, res): Promise<void> => {
  const params = RemoveFavoriteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  // Only the visitor's own favorite
  const removed = await db.delete(favoritesTable)
    .where(and(eq(favoritesTable.id, params.data.id), eq(favoritesTable.userId, currentUser(res).id)))
    .returning({ id: favoritesTable.id });
  if (removed.length === 0) { res.status(404).json({ error: "Favorite not found" }); return; }
  res.sendStatus(204);
});

export default router;
