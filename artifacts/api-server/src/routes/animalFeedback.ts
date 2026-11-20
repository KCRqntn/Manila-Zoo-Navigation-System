import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

/**
 * Creates the visitor feedback table if it's missing. Feedback is only shown to admins,
 * so visitors can tell the zoo what to improve about an exhibit without it being public.
 */
export async function ensureAnimalFeedbackSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS animal_feedback (
      id SERIAL PRIMARY KEY,
      animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
      rating INTEGER CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

// Likes per animal: how many visitors saved it as a favorite
router.get("/favorites/counts", async (_req, res): Promise<void> => {
  const { rows } = await pool.query<{ animal_id: number; count: string }>(
    "SELECT animal_id, COUNT(*) AS count FROM favorites GROUP BY animal_id",
  );
  res.json(Object.fromEntries(rows.map(r => [r.animal_id, Number(r.count)])));
});

router.post("/animals/:id/feedback", async (req, res): Promise<void> => {
  const animalId = Number(req.params["id"]);
  const rating = req.body?.rating == null ? null : Number(req.body.rating);
  const comment = typeof req.body?.comment === "string" ? req.body.comment.trim().slice(0, 1000) : "";
  if (!Number.isInteger(animalId) || animalId <= 0) { res.status(400).json({ error: "Invalid animal" }); return; }
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) { res.status(400).json({ error: "Rating must be 1 to 5" }); return; }
  if (rating === null && !comment) { res.status(400).json({ error: "Add a rating or a comment" }); return; }
  try {
    const { rows } = await pool.query(
      "INSERT INTO animal_feedback (animal_id, rating, comment) VALUES ($1, $2, $3) RETURNING id",
      [animalId, rating, comment || null],
    );
    res.status(201).json({ id: rows[0]?.id });
  } catch {
    res.status(404).json({ error: "Animal not found" });
  }
});

router.get("/animal-feedback", requireAdmin, async (_req, res): Promise<void> => {
  const { rows } = await pool.query(`
    SELECT f.id, f.animal_id, a.name AS animal_name, f.rating, f.comment, f.is_resolved, f.created_at
    FROM animal_feedback f JOIN animals a ON a.id = f.animal_id
    ORDER BY f.is_resolved, f.created_at DESC
    LIMIT 500
  `);
  res.json(rows);
});

router.patch("/animal-feedback/:id", requireAdmin, async (req, res): Promise<void> => {
  await pool.query("UPDATE animal_feedback SET is_resolved = $1 WHERE id = $2", [Boolean(req.body?.is_resolved), Number(req.params["id"])]);
  res.sendStatus(204);
});

router.delete("/animal-feedback/:id", requireAdmin, async (req, res): Promise<void> => {
  await pool.query("DELETE FROM animal_feedback WHERE id = $1", [Number(req.params["id"])]);
  res.sendStatus(204);
});

export default router;
