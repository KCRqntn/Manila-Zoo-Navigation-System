import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";
import { requireUser, currentUser, publicName } from "../middleware/requireUser";
import { logger } from "../lib/logger";
import { audit, actorFrom } from "../lib/audit";

/**
 * Game events: QR scavenger hunts. A game lists animals ("stops"); scanning a stop's QR code while
 * the game runs earns points once per visitor, with a bonus for finding every stop.
 * Points are tied to a verified account, so each visitor's total is their own.
 * Rewards follow a registered visit: points are given only when the account is counted in a visit
 * registered today (as the registered visitor or a linked companion), and each points row records
 * that visit. A row is unique per game, account and animal, so scanning again, a double tap or a
 * retry never gives the same points twice. Every award is written to the audit log.
 */
const router = Router();

// The completion bonus is stored as a progress row with this animal id
const BONUS_ROW = 0;

export async function ensureGamesSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      title_fil TEXT,
      description TEXT,
      description_fil TEXT,
      emoji TEXT NOT NULL DEFAULT '🧭',
      points_per_stop INTEGER NOT NULL DEFAULT 10,
      completion_bonus INTEGER NOT NULL DEFAULT 50,
      start_date TIMESTAMP,
      end_date TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS game_stops (
      id SERIAL PRIMARY KEY,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
      hint TEXT,
      hint_fil TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE (game_id, animal_id)
    );
    CREATE TABLE IF NOT EXISTS game_progress (
      id SERIAL PRIMARY KEY,
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      animal_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (game_id, user_id, animal_id)
    );
    -- The visit that made these points eligible (kept when that visit is later removed)
    ALTER TABLE game_progress ADD COLUMN IF NOT EXISTS registration_id uuid;
  `);
  await seedSampleGames();
}

/** Two starter games so the Games tab isn't empty: one live, one left as a draft for admins to finish. */
async function seedSampleGames(): Promise<void> {
  const { rows } = await pool.query<{ n: string }>("SELECT COUNT(*) AS n FROM games");
  if (Number(rows[0]?.n) > 0) return;

  const samples = [
    {
      title: "Philippine Wildlife Hunt", title_fil: "Paghahanap ng Hayop ng Pilipinas", emoji: "🦅", status: "published",
      description: "Find the animals that live only in the Philippines! Scan the QR sign at each exhibit to earn points.",
      description_fil: "Hanapin ang mga hayop na sa Pilipinas lang makikita! I-scan ang QR sign sa bawat kulungan para makakuha ng puntos.",
      points: 20, bonus: 50,
      stops: [
        ["Philippine Eagle", "Our national bird, one of the largest eagles in the world.", "Ang ating pambansang ibon."],
        ["Philippine Eagle Owl", "A big owl with ear tufts that hunts at night.", "Malaking kuwago na nangangaso sa gabi."],
        ["Philippine Cockatoo", "A white parrot that is critically endangered.", "Puting loro na nanganganib nang maubos."],
        ["Celebes Crested Macaque", "A black monkey with a spiky crest.", "Itim na unggoy na may tayong buhok."],
      ],
    },
    {
      title: "Giants of the Zoo", title_fil: "Mga Higante ng Zoo", emoji: "🐘", status: "draft",
      description: "Track down the zoo's biggest animals. (Draft: check the stops and dates, then publish.)",
      description_fil: "Hanapin ang pinakamalalaking hayop sa zoo.",
      points: 10, bonus: 30,
      stops: [
        ["Saltwater Crocodile", "The largest living reptile.", "Pinakamalaking buhay na reptilya."],
        ["Reticulated Python", "The world's longest snake.", "Pinakamahabang ahas sa mundo."],
        ["African Lion", "Its roar can be heard 8 km away.", "Naririnig ang ungol nito hanggang 8 km."],
      ],
    },
  ];

  for (const g of samples) {
    const { rows: [game] } = await pool.query<{ id: number }>(
      `INSERT INTO games (title, title_fil, description, description_fil, emoji, points_per_stop, completion_bonus, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [g.title, g.title_fil, g.description, g.description_fil, g.emoji, g.points, g.bonus, g.status],
    );
    let order = 0;
    for (const [name, hint, hintFil] of g.stops) {
      await pool.query(
        `INSERT INTO game_stops (game_id, animal_id, hint, hint_fil, sort_order)
         SELECT $1, id, $2, $3, $4 FROM animals WHERE name = $5 ON CONFLICT DO NOTHING`,
        [game!.id, hint, hintFil, order++, name],
      );
    }
  }
  logger.info("Added sample scavenger-hunt games");
}

type GameRow = {
  id: number; title: string; title_fil: string | null; description: string | null; description_fil: string | null;
  emoji: string; points_per_stop: number; completion_bonus: number; start_date: string | null; end_date: string | null;
  status: string; created_at: string;
};

/** Games with their stops (animal name/photo and whether the animal has an active QR code yet). */
async function loadGames(where: string): Promise<unknown[]> {
  const { rows: games } = await pool.query<GameRow>(`SELECT * FROM games WHERE ${where} ORDER BY created_at DESC`);
  if (games.length === 0) return [];
  const { rows: stops } = await pool.query(`
    SELECT s.id, s.game_id, s.animal_id, s.hint, s.hint_fil, s.sort_order, a.name AS animal_name, a.image_url,
           EXISTS (SELECT 1 FROM qr_codes q WHERE q.animal_id = s.animal_id AND q.is_active) AS has_qr
    FROM game_stops s JOIN animals a ON a.id = s.animal_id
    WHERE s.game_id = ANY($1) ORDER BY s.sort_order, s.id`, [games.map(g => g.id)]);
  return games.map(g => ({ ...g, stops: stops.filter(s => s.game_id === g.id) }));
}

// Games visitors can play now, plus published ones that haven't started yet
router.get("/games", async (_req, res): Promise<void> => {
  res.json(await loadGames("status = 'published' AND (end_date IS NULL OR end_date >= NOW())"));
});

// Points earned (scans, game stops, bonuses); spending on rewards never lowers a visitor's rank or level
const EARNED = "kind IN ('scan', 'game', 'game_bonus')";

router.get("/games/leaderboard", async (_req, res): Promise<void> => {
  const { rows } = await pool.query(`
    SELECT user_id, MAX(display_name) AS name, SUM(points)::int AS points, COUNT(DISTINCT animal_id)::int AS finds
    FROM point_transactions WHERE ${EARNED} GROUP BY user_id ORDER BY points DESC, MIN(created_at) LIMIT 10`);
  // User ids stay on the server; the page only needs names and scores
  res.json(rows.map((r, i) => ({ rank: i + 1, name: r.name, points: r.points, finds: r.finds })));
});

router.get("/games/me", requireUser, async (_req, res): Promise<void> => {
  const user = currentUser(res);
  const { rows } = await pool.query<{ game_id: number; animal_id: number }>(
    "SELECT game_id, animal_id FROM game_progress WHERE user_id = $1", [user.id]);
  const { rows: [sums] } = await pool.query<{ earned: number; balance: number; scanned: number }>(`
    SELECT coalesce(SUM(points) FILTER (WHERE ${EARNED}), 0)::int AS earned, coalesce(SUM(points), 0)::int AS balance,
           COUNT(DISTINCT qr_code_id) FILTER (WHERE kind = 'scan')::int AS scanned
      FROM point_transactions WHERE user_id = $1`, [user.id]);
  const total = sums?.earned ?? 0;
  const { rows: [rank] } = await pool.query<{ rank: string }>(`
    SELECT COUNT(*) + 1 AS rank FROM (SELECT user_id, SUM(points) AS p FROM point_transactions WHERE ${EARNED} GROUP BY user_id) t
    WHERE t.p > $1`, [total]);
  const found: Record<number, number[]> = {};
  const completed: number[] = [];
  for (const r of rows) {
    if (r.animal_id === BONUS_ROW) completed.push(r.game_id);
    else (found[r.game_id] ??= []).push(r.animal_id);
  }
  res.json({ total_points: total, balance: sums?.balance ?? 0, exhibits_scanned: sums?.scanned ?? 0, rank: total > 0 ? Number(rank?.rank ?? 1) : null, found, completed });
});

// Slows down anyone trying codes one after another: at most 30 scan claims per visitor in 10 minutes
const SCAN_WINDOW_MS = 10 * 60_000;
const SCAN_LIMIT = 30;
const recentScans = new Map<string, number[]>();
function overScanLimit(userId: string): boolean {
  const now = Date.now();
  const list = (recentScans.get(userId) ?? []).filter(t => now - t < SCAN_WINDOW_MS);
  list.push(now);
  recentScans.set(userId, list);
  if (recentScans.size > 5000) for (const [k, v] of recentScans) if (!v.some(t => now - t < SCAN_WINDOW_MS)) recentScans.delete(k);
  return list.length > SCAN_LIMIT;
}

type ScanQr = { id: number; code: string; animal_id: number | null; map_pin_id: number | null; points: number; points_once: boolean; animal_name: string | null; place_name: string | null };

/**
 * Claims the points for a QR code scanned with the in-app camera: the code's own exhibit points
 * (once ever, or once per visit day, as the admin set) and a stop in every running scavenger hunt
 * that has its animal, with the hunt's completion bonus. Everything the visitor earns is also one
 * row in point_transactions. The point values come from the database, never from the browser;
 * each claim has a unique key, and the whole claim runs in one transaction locked to this visitor,
 * so a double tap, a retry or two phones at once can't add the same points twice.
 */
async function claimScan(req: import("express").Request, res: import("express").Response): Promise<void> {
  const user = currentUser(res);
  const code = typeof req.body?.code === "string" ? req.body.code.trim().slice(0, 100) : "";
  if (!code) { res.status(400).json({ error: "Missing QR code" }); return; }
  if (overScanLimit(user.id)) { res.status(429).json({ error: "Too many scans in a short time. Please wait a few minutes." }); return; }

  const { rows: [qr] } = await pool.query<ScanQr>(`
    SELECT q.id, q.code, q.animal_id, q.map_pin_id, q.points, q.points_once, a.name AS animal_name, p.name AS place_name
      FROM qr_codes q LEFT JOIN animals a ON a.id = q.animal_id LEFT JOIN map_pins p ON p.id = q.map_pin_id
     WHERE q.code = $1 AND q.is_active`, [code]);
  if (!qr) { res.status(404).json({ error: "QR code not found or inactive" }); return; }
  const label = qr.animal_name ?? qr.place_name ?? qr.code;

  // Points need a QR code scanned with the app's camera; a code opened from its link or typed in only shows the animal
  if (req.body?.source !== "camera") {
    res.json({ animal_id: qr.animal_id, label, awards: [], exhibit: null, earned: 0, needs_camera: qr.points > 0 || !!qr.animal_id });
    return;
  }

  const games = qr.animal_id ? (await pool.query<GameRow>(`
    SELECT g.* FROM games g JOIN game_stops s ON s.game_id = g.id
    WHERE s.animal_id = $1 AND g.status = 'published'
      AND (g.start_date IS NULL OR g.start_date <= NOW()) AND (g.end_date IS NULL OR g.end_date >= NOW())`,
    [qr.animal_id])).rows : [];

  // Only visitors counted in a visit registered today earn points
  const { rows: [visit] } = await pool.query<{ registration_id: string; visit_date: string }>(
    `SELECT registration_id, visit_date::text FROM visitor_group_members WHERE user_id = $1 AND visit_date = (now() AT TIME ZONE 'Asia/Manila')::date LIMIT 1`, [user.id])
    .catch(() => ({ rows: [] as { registration_id: string; visit_date: string }[] }));
  if (!visit) { res.json({ animal_id: qr.animal_id, label, awards: [], exhibit: null, earned: 0, needs_visit: games.length > 0 || qr.points > 0 }); return; }

  const name = publicName(user);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // One claim at a time per visitor, so the "found every stop" bonus is counted exactly once
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`points:${user.id}`]);
    const ledger = (kind: string, points: number, text: string, key: string, gameId: number | null) => client.query(
      `INSERT INTO point_transactions (user_id, display_name, kind, points, label, qr_code_id, animal_id, map_pin_id, game_id, registration_id, claim_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (claim_key) DO NOTHING`,
      [user.id, name, kind, points, text, qr.id, qr.animal_id, qr.map_pin_id, gameId, visit.registration_id, key]);

    // The exhibit's own points
    let exhibit: { points: number; already: boolean; once: boolean } | null = null;
    if (qr.points > 0) {
      const key = qr.points_once ? `scan:${qr.id}:${user.id}` : `scan:${qr.id}:${user.id}:${visit.visit_date}`;
      const { rowCount } = await ledger("scan", qr.points, label, key, null);
      exhibit = { points: (rowCount ?? 0) > 0 ? qr.points : 0, already: (rowCount ?? 0) === 0, once: qr.points_once };
    }

    // Scavenger hunts
    const awards = [];
    for (const g of games) {
      const { rowCount } = await client.query(
        `INSERT INTO game_progress (game_id, user_id, display_name, animal_id, points, registration_id) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT DO NOTHING`, [g.id, user.id, name, qr.animal_id, g.points_per_stop, visit.registration_id]);
      const isNew = (rowCount ?? 0) > 0;
      if (isNew && g.points_per_stop > 0) await ledger("game", g.points_per_stop, `${g.title}: ${label}`, `game:${g.id}:${qr.animal_id}:${user.id}`, g.id);

      // Found every stop? Add the completion bonus once
      const { rows: [counts] } = await client.query<{ total: string; found: string }>(`
        SELECT (SELECT COUNT(*) FROM game_stops WHERE game_id = $1) AS total,
               (SELECT COUNT(*) FROM game_progress WHERE game_id = $1 AND user_id = $2 AND animal_id <> $3) AS found`,
        [g.id, user.id, BONUS_ROW]);
      let bonus = 0;
      if (Number(counts?.found) >= Number(counts?.total) && Number(counts?.total) > 0) {
        const { rowCount: bonusAdded } = await client.query(
          `INSERT INTO game_progress (game_id, user_id, display_name, animal_id, points, registration_id) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT DO NOTHING`, [g.id, user.id, name, BONUS_ROW, g.completion_bonus, visit.registration_id]);
        if ((bonusAdded ?? 0) > 0 && g.completion_bonus > 0) {
          bonus = g.completion_bonus;
          await ledger("game_bonus", bonus, `${g.title}: completion bonus`, `game:${g.id}:${BONUS_ROW}:${user.id}`, g.id);
        }
      }
      awards.push({
        game_id: g.id, title: g.title, title_fil: g.title_fil, emoji: g.emoji,
        points: isNew ? g.points_per_stop : 0, already_found: !isNew, bonus,
        found: Number(counts?.found), total: Number(counts?.total),
      });
    }
    const { rows: [balance] } = await client.query<{ balance: number }>(
      "SELECT coalesce(SUM(points), 0)::int AS balance FROM point_transactions WHERE user_id = $1", [user.id]);
    await client.query("COMMIT");

    const earned = (exhibit?.points ?? 0) + awards.reduce((sum, a) => sum + a.points + a.bonus, 0);
    if (earned > 0) {
      await audit(actorFrom(user), { action: "points.awarded", resource: "point_transactions", recordId: String(qr.id),
        context: { code: qr.code, label, exhibit_points: exhibit?.points ?? 0, games: awards.map(a => ({ game_id: a.game_id, points: a.points, bonus: a.bonus })), visit_id: visit.registration_id } }, req);
    }
    res.json({ animal_id: qr.animal_id, label, exhibit, awards, earned, balance: balance?.balance ?? 0 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Called after a visitor scans a QR code with the in-app camera (/games/scan kept for older pages)
router.post("/points/scan", requireUser, claimScan);
router.post("/games/scan", requireUser, claimScan);

// ─── Admin ───────────────────────────────────────────────────────────────────

router.get("/admin/games", requireAdmin, async (_req, res): Promise<void> => {
  const games = await loadGames("TRUE");
  const { rows: players } = await pool.query<{ game_id: number; players: number }>(
    "SELECT game_id, COUNT(DISTINCT user_id)::int AS players FROM game_progress GROUP BY game_id");
  res.json(games.map(g => ({ ...(g as GameRow), players: players.find(p => p.game_id === (g as GameRow).id)?.players ?? 0 })));
});

type GameInput = {
  title?: string; title_fil?: string | null; description?: string | null; description_fil?: string | null; emoji?: string;
  points_per_stop?: number; completion_bonus?: number; start_date?: string | null; end_date?: string | null; status?: string;
  stops?: { animal_id: number; hint?: string | null; hint_fil?: string | null }[];
};

function readGame(body: unknown): GameInput | string {
  const b = (body ?? {}) as GameInput;
  if (!b.title?.trim()) return "Title is required";
  if (b.status && !["draft", "published"].includes(b.status)) return "Status must be draft or published";
  const pts = Number(b.points_per_stop ?? 10), bonus = Number(b.completion_bonus ?? 0);
  if (!Number.isInteger(pts) || pts < 0 || pts > 1000 || !Number.isInteger(bonus) || bonus < 0 || bonus > 10000) return "Points must be whole numbers";
  if (b.stops && !Array.isArray(b.stops)) return "Stops must be a list";
  return { ...b, title: b.title.trim(), points_per_stop: pts, completion_bonus: bonus };
}

async function saveStops(gameId: number, stops: GameInput["stops"]) {
  if (!stops) return;
  await pool.query("DELETE FROM game_stops WHERE game_id = $1", [gameId]);
  let order = 0;
  for (const s of stops) {
    await pool.query(
      "INSERT INTO game_stops (game_id, animal_id, hint, hint_fil, sort_order) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [gameId, Number(s.animal_id), s.hint || null, s.hint_fil || null, order++]);
  }
}

router.post("/admin/games", requireAdmin, async (req, res): Promise<void> => {
  const g = readGame(req.body);
  if (typeof g === "string") { res.status(400).json({ error: g }); return; }
  const { rows: [row] } = await pool.query<{ id: number }>(
    `INSERT INTO games (title, title_fil, description, description_fil, emoji, points_per_stop, completion_bonus, start_date, end_date, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [g.title, g.title_fil || null, g.description || null, g.description_fil || null, g.emoji || "🧭", g.points_per_stop,
     g.completion_bonus, g.start_date || null, g.end_date || null, g.status ?? "draft"]);
  await saveStops(row!.id, g.stops);
  res.status(201).json({ id: row!.id });
});

router.put("/admin/games/:id", requireAdmin, async (req, res): Promise<void> => {
  const g = readGame(req.body);
  if (typeof g === "string") { res.status(400).json({ error: g }); return; }
  const id = Number(req.params["id"]);
  const { rowCount } = await pool.query(
    `UPDATE games SET title=$1, title_fil=$2, description=$3, description_fil=$4, emoji=$5, points_per_stop=$6,
       completion_bonus=$7, start_date=$8, end_date=$9, status=$10 WHERE id=$11`,
    [g.title, g.title_fil || null, g.description || null, g.description_fil || null, g.emoji || "🧭", g.points_per_stop,
     g.completion_bonus, g.start_date || null, g.end_date || null, g.status ?? "draft", id]);
  if (!rowCount) { res.status(404).json({ error: "Game not found" }); return; }
  await saveStops(id, g.stops);
  res.json({ id });
});

router.delete("/admin/games/:id", requireAdmin, async (req, res): Promise<void> => {
  await pool.query("DELETE FROM games WHERE id = $1", [Number(req.params["id"])]);
  res.sendStatus(204);
});

export default router;
