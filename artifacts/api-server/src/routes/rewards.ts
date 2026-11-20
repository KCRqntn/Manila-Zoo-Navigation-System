import { Router } from "express";
import { randomInt } from "crypto";
import { pool } from "@workspace/db";
import { requireUser, currentUser, publicName } from "../middleware/requireUser";
import { requireAdmin } from "../middleware/requireAdmin";
import { staffUser } from "../middleware/access";
import { audit, actorFrom } from "../lib/audit";

/**
 * Points history and rewards. A visitor's balance is the sum of their rows in point_transactions;
 * redeeming a reward writes a negative row and a voucher (reward_redemptions) with a code the
 * visitor shows at the Info Desk, where staff mark it as given. Cancelling a voucher refunds it.
 * Balances, stock and costs are checked on the server inside one transaction locked to the visitor,
 * and a redeem request carries an id from the browser, so a double tap redeems once.
 */
const router = Router();

// ─── Visitors ───────────────────────────────────────────────────────────────

router.get("/points/history", requireUser, async (_req, res): Promise<void> => {
  const user = currentUser(res);
  const { rows } = await pool.query(`
    SELECT t.id, t.kind, t.points, t.label, t.created_at, t.animal_id, a.image_url
      FROM point_transactions t LEFT JOIN animals a ON a.id = t.animal_id
     WHERE t.user_id = $1 ORDER BY t.created_at DESC, t.id DESC LIMIT 200`, [user.id]);
  res.json(rows.map(r => ({ ...r, id: Number(r.id) })));
});

type RewardRow = { id: number; name: string; name_fil: string | null; description: string | null; emoji: string; cost: number; stock: number | null; is_active: boolean };

router.get("/rewards", async (_req, res): Promise<void> => {
  const { rows } = await pool.query<RewardRow>("SELECT id, name, name_fil, description, emoji, cost, stock FROM rewards WHERE is_active ORDER BY cost, name");
  res.json(rows);
});

router.get("/rewards/mine", requireUser, async (_req, res): Promise<void> => {
  const user = currentUser(res);
  const { rows } = await pool.query(`
    SELECT r.id, r.reward_id, r.reward_name, r.cost, r.code, r.status, r.created_at, r.claimed_at, w.emoji
      FROM reward_redemptions r LEFT JOIN rewards w ON w.id = r.reward_id
     WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 50`, [user.id]);
  res.json(rows);
});

// Voucher codes avoid look-alike characters so they're easy to read out at the desk
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const voucherCode = () => `MZR-${Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("")}`;

router.post("/rewards/:id/redeem", requireUser, async (req, res): Promise<void> => {
  const user = currentUser(res);
  const rewardId = Number(req.params["id"]);
  const requestId = String(req.body?.request_id ?? "");
  if (!Number.isInteger(rewardId) || rewardId <= 0) { res.status(400).json({ error: "Invalid reward" }); return; }
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) { res.status(400).json({ error: "Missing request id" }); return; }
  const requestKey = `redeem:${user.id}:${requestId}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`points:${user.id}`]);
    // The same request sent again (double tap, retry): return the voucher it already made
    const { rows: [done] } = await client.query(
      "SELECT r.* FROM point_transactions t JOIN reward_redemptions r ON r.id = t.redemption_id WHERE t.claim_key = $1", [requestKey]);
    if (done) { await client.query("COMMIT"); res.json({ redemption: done, repeated: true }); return; }

    const { rows: [reward] } = await client.query<RewardRow>("SELECT * FROM rewards WHERE id = $1 FOR UPDATE", [rewardId]);
    if (!reward || !reward.is_active) { await client.query("ROLLBACK"); res.status(404).json({ error: "This reward isn't available." }); return; }
    if (reward.stock != null && reward.stock <= 0) { await client.query("ROLLBACK"); res.status(409).json({ error: "Sorry, this reward is out of stock." }); return; }
    const { rows: [bal] } = await client.query<{ balance: number }>("SELECT coalesce(SUM(points), 0)::int AS balance FROM point_transactions WHERE user_id = $1", [user.id]);
    const balance = bal?.balance ?? 0;
    if (balance < reward.cost) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: `You need ${reward.cost - balance} more points for this reward.`, code: "not_enough_points" });
      return;
    }

    const name = publicName(user);
    let redemption: Record<string, unknown> | undefined;
    for (let attempt = 0; !redemption && attempt < 5; attempt++) {
      const { rows } = await client.query(
        `INSERT INTO reward_redemptions (user_id, display_name, reward_id, reward_name, cost, code) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (code) DO NOTHING RETURNING *`, [user.id, name, reward.id, reward.name, reward.cost, voucherCode()]);
      redemption = rows[0];
    }
    if (!redemption) throw new Error("Could not create a voucher code");
    await client.query(
      `INSERT INTO point_transactions (user_id, display_name, kind, points, label, redemption_id, claim_key) VALUES ($1,$2,'redeem',$3,$4,$5,$6)`,
      [user.id, name, -reward.cost, `Redeemed: ${reward.name}`, redemption["id"], requestKey]);
    if (reward.stock != null) await client.query("UPDATE rewards SET stock = stock - 1, updated_at = now() WHERE id = $1", [reward.id]);
    await client.query("COMMIT");
    await audit(actorFrom(user), { action: "rewards.redeem", resource: "reward_redemptions", recordId: String(redemption["id"]), context: { reward_id: reward.id, cost: reward.cost, code: redemption["code"] } }, req);
    res.status(201).json({ redemption, balance: balance - reward.cost });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
});

// ─── Staff ──────────────────────────────────────────────────────────────────

function readReward(body: unknown): Omit<RewardRow, "id"> | string {
  const b = (body ?? {}) as Partial<RewardRow>;
  const name = String(b.name ?? "").trim();
  const cost = Number(b.cost);
  const stock = b.stock === null || b.stock === undefined || String(b.stock) === "" ? null : Number(b.stock);
  if (name.length < 2 || name.length > 80) return "Name must be 2–80 characters";
  if (!Number.isInteger(cost) || cost < 1 || cost > 100000) return "Cost must be a whole number of points from 1 to 100,000";
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return "Stock must be a whole number (leave empty for unlimited)";
  return {
    name, name_fil: String(b.name_fil ?? "").trim() || null, description: String(b.description ?? "").trim() || null,
    emoji: String(b.emoji ?? "").trim().slice(0, 8) || "🎁", cost, stock, is_active: b.is_active !== false,
  };
}

router.get("/admin/rewards", requireAdmin, async (_req, res): Promise<void> => {
  const { rows } = await pool.query(`
    SELECT w.*, COUNT(r.id) FILTER (WHERE r.status <> 'cancelled')::int AS redeemed
      FROM rewards w LEFT JOIN reward_redemptions r ON r.reward_id = w.id GROUP BY w.id ORDER BY w.cost, w.name`);
  res.json(rows);
});

router.post("/admin/rewards", requireAdmin, async (req, res): Promise<void> => {
  const r = readReward(req.body);
  if (typeof r === "string") { res.status(400).json({ error: r }); return; }
  const { rows: [row] } = await pool.query(
    "INSERT INTO rewards (name, name_fil, description, emoji, cost, stock, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
    [r.name, r.name_fil, r.description, r.emoji, r.cost, r.stock, r.is_active]);
  res.status(201).json(row);
});

router.put("/admin/rewards/:id", requireAdmin, async (req, res): Promise<void> => {
  const r = readReward(req.body);
  if (typeof r === "string") { res.status(400).json({ error: r }); return; }
  const { rows: [row] } = await pool.query(
    `UPDATE rewards SET name=$1, name_fil=$2, description=$3, emoji=$4, cost=$5, stock=$6, is_active=$7, updated_at=now() WHERE id=$8 RETURNING *`,
    [r.name, r.name_fil, r.description, r.emoji, r.cost, r.stock, r.is_active, Number(req.params["id"])]);
  if (!row) { res.status(404).json({ error: "Reward not found" }); return; }
  res.json(row);
});

router.get("/admin/redemptions", requireAdmin, async (req, res): Promise<void> => {
  const code = String(req.query["code"] ?? "").trim().toUpperCase();
  const { rows } = code
    ? await pool.query("SELECT * FROM reward_redemptions WHERE code = $1", [code])
    : await pool.query("SELECT * FROM reward_redemptions ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 200");
  res.json(rows);
});

/** Staff hand over the reward: the voucher can't be used again */
router.post("/admin/redemptions/:id/claim", requireAdmin, async (req, res): Promise<void> => {
  const staff = staffUser(res);
  const { rows: [row] } = await pool.query(
    "UPDATE reward_redemptions SET status = 'claimed', claimed_at = now(), claimed_by = $2 WHERE id = $1 AND status = 'pending' RETURNING *",
    [Number(req.params["id"]), staff.email ?? staff.id]);
  if (!row) { res.status(409).json({ error: "This voucher isn't waiting to be claimed (already given or cancelled)." }); return; }
  res.json(row);
});

/** Cancel an unclaimed voucher: the points go back to the visitor and the stock is restored */
router.post("/admin/redemptions/:id/cancel", requireAdmin, async (req, res): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [row] } = await client.query(
      "UPDATE reward_redemptions SET status = 'cancelled', cancelled_at = now() WHERE id = $1 AND status = 'pending' RETURNING *",
      [Number(req.params["id"])]);
    if (!row) { await client.query("ROLLBACK"); res.status(409).json({ error: "Only vouchers that haven't been given out can be cancelled." }); return; }
    await client.query(
      `INSERT INTO point_transactions (user_id, display_name, kind, points, label, redemption_id, claim_key) VALUES ($1,$2,'refund',$3,$4,$5,$6)
       ON CONFLICT (claim_key) DO NOTHING`,
      [row.user_id, row.display_name, row.cost, `Refund: ${row.reward_name}`, row.id, `refund:${row.id}`]);
    await client.query("UPDATE rewards SET stock = stock + 1, updated_at = now() WHERE id = $1 AND stock IS NOT NULL", [row.reward_id]);
    await client.query("COMMIT");
    res.json(row);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
});

/** Points a QR code gives, set on the Exhibit QR Codes page */
router.put("/admin/qr/:id/points", requireAdmin, async (req, res): Promise<void> => {
  const points = Number(req.body?.points);
  const once = req.body?.points_once !== false;
  if (!Number.isInteger(points) || points < 0 || points > 1000) { res.status(400).json({ error: "Points must be a whole number from 0 to 1,000" }); return; }
  const { rows: [row] } = await pool.query(
    "UPDATE qr_codes SET points = $1, points_once = $2, updated_at = now() WHERE id = $3 RETURNING id, code, points, points_once",
    [points, once, Number(req.params["id"])]);
  if (!row) { res.status(404).json({ error: "QR code not found" }); return; }
  res.json(row);
});

export default router;
