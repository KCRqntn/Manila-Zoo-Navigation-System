import express, { Router } from "express";
import { pool } from "@workspace/db";
import { requirePermission, staffUser } from "../middleware/access";
import { auditReq, audit } from "../lib/audit";
import { DATASETS, ValidationError, validateRow, listRows, getRow, insertRow, updateRow, friendlyDbError, exportColumns, type DatasetDef, type Row } from "../lib/datasets";
import { parseCsv, toCsv } from "../lib/csv";
import { getSetting } from "../lib/settings";
import { logger } from "../lib/logger";

/**
 * Dataset Management: Zoo Updates, Ticket Prices, Announcements and Events.
 *   Admin:  /admin/datasets/:dataset[/...]   (read: dashboard.read; changes: content.write)
 *   Public: /zoo-updates, /ticket-prices, /announcements, /events   (published records only)
 */
const router = Router();

function datasetOf(id: string): DatasetDef | null {
  return Object.prototype.hasOwnProperty.call(DATASETS, id) ? DATASETS[id]! : null;
}

function sendError(res: express.Response, err: unknown, fallback: string) {
  if (err instanceof ValidationError) { res.status(400).json({ error: err.message, line: err.line }); return; }
  const friendly = friendlyDbError(err);
  if (friendly) { res.status((err as { code?: string }).code === "23505" ? 409 : 400).json({ error: friendly }); return; }
  logger.error({ err }, fallback);
  res.status(500).json({ error: fallback });
}

// Ticket prices keep their own change history alongside the audit log
async function recordPriceHistory(id: number | null, type: string, actor: string | null, before: Row | null, after: Row | null) {
  await pool.query(
    "INSERT INTO ticket_price_history (ticket_price_id, changed_by, change_type, before, after) VALUES ($1, $2, $3, $4, $5)",
    [id, actor, type, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]);
}

// Expired announcements are hidden at once; after the configured days they're archived
let lastSweep = 0;
export async function archiveExpiredAnnouncements(): Promise<void> {
  if (Date.now() - lastSweep < 60_000) return;
  lastSweep = Date.now();
  const days = await getSetting<number>("announcements_archive_after_days");
  const { rows } = await pool.query(
    `UPDATE announcements SET status = 'archived', is_active = false, updated_at = now(), updated_by = 'system'
      WHERE status = 'published' AND expires_at IS NOT NULL AND expires_at <= now() - make_interval(days => $1)
      RETURNING id, title`, [days]);
  for (const r of rows) {
    await audit({ email: "system" }, { action: "announcement.auto_archive", resource: "announcements", recordId: r.id, after: { status: "archived" }, context: { title: r.title, rule: `${days} days after expiry` } });
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────────

router.get("/admin/datasets", requirePermission("dashboard.read"), (_req, res) => {
  res.json(Object.values(DATASETS).map(d => ({ id: d.id, label: d.label, fields: d.fields, statuses: d.statuses })));
});

router.get("/admin/datasets/:dataset", requirePermission("dashboard.read"), async (req, res): Promise<void> => {
  const def = datasetOf(String(req.params["dataset"]));
  if (!def) { res.status(404).json({ error: "Unknown dataset" }); return; }
  if (def.id === "announcements") await archiveExpiredAnnouncements();
  res.json(await listRows(def, {
    search: String(req.query["search"] ?? ""),
    status: String(req.query["status"] ?? ""),
    page: Number(req.query["page"]) || 1,
    pageSize: Number(req.query["page_size"]) || 20,
  }));
});

router.get("/admin/datasets/:dataset/export.csv", requirePermission("dashboard.read"), async (req, res): Promise<void> => {
  const def = datasetOf(String(req.params["dataset"]));
  if (!def) { res.status(404).json({ error: "Unknown dataset" }); return; }
  const { rows } = await pool.query(`SELECT * FROM "${def.table}" ORDER BY id`);
  await auditReq(req, res, { action: `${def.id}.export`, resource: def.table, context: { rows: rows.length } });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${def.id}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(exportColumns(def), rows));
});

router.get("/admin/datasets/:dataset/:id", requirePermission("dashboard.read"), async (req, res): Promise<void> => {
  const def = datasetOf(String(req.params["dataset"]));
  const id = Number(req.params["id"]);
  if (!def || !Number.isInteger(id)) { res.status(404).json({ error: "Not found" }); return; }
  const row = await getRow(def, id);
  if (!row) { res.status(404).json({ error: "Record not found" }); return; }
  res.json(row);
});

router.post("/admin/datasets/:dataset", requirePermission("content.write"), async (req, res): Promise<void> => {
  const def = datasetOf(String(req.params["dataset"]));
  if (!def) { res.status(404).json({ error: "Unknown dataset" }); return; }
  const email = staffUser(res).email ?? null;
  try {
    const values = validateRow(def, req.body ?? {}, null);
    const row = await insertRow(def, values, email);
    if (def.id === "ticket_prices") await recordPriceHistory(Number(row["id"]), "create", email, null, row);
    await auditReq(req, res, { action: `${def.id}.create`, resource: def.table, recordId: row["id"] as number, after: row });
    res.status(201).json(row);
  } catch (err) {
    await auditReq(req, res, { action: `${def.id}.create`, resource: def.table, result: "failure", context: { error: (err as Error).message } });
    sendError(res, err, "Could not save the record");
  }
});

router.patch("/admin/datasets/:dataset/:id", requirePermission("content.write"), async (req, res): Promise<void> => {
  const def = datasetOf(String(req.params["dataset"]));
  const id = Number(req.params["id"]);
  if (!def || !Number.isInteger(id)) { res.status(404).json({ error: "Not found" }); return; }
  const email = staffUser(res).email ?? null;
  const before = await getRow(def, id);
  if (!before) { res.status(404).json({ error: "Record not found" }); return; }
  try {
    const values = validateRow(def, req.body ?? {}, before);
    if (Object.keys(values).length === 0) { res.json(before); return; }
    const after = await updateRow(def, id, values, email);
    const statusChanged = values["status"] !== undefined && values["status"] !== before["status"];
    const action = statusChanged ? `${def.id}.${values["status"] === "published" ? "publish" : values["status"] === "archived" ? "archive" : `status_${values["status"]}`}` : `${def.id}.update`;
    if (def.id === "ticket_prices") await recordPriceHistory(id, statusChanged ? `status:${values["status"]}` : "update", email, before, after);
    await auditReq(req, res, { action, resource: def.table, recordId: id, before, after });
    res.json(after);
  } catch (err) {
    await auditReq(req, res, { action: `${def.id}.update`, resource: def.table, recordId: id, result: "failure", context: { error: (err as Error).message } });
    sendError(res, err, "Could not update the record");
  }
});

router.delete("/admin/datasets/:dataset/:id", requirePermission("content.write"), async (req, res): Promise<void> => {
  const def = datasetOf(String(req.params["dataset"]));
  const id = Number(req.params["id"]);
  if (!def || !Number.isInteger(id)) { res.status(404).json({ error: "Not found" }); return; }
  const before = await getRow(def, id);
  if (!before) { res.status(404).json({ error: "Record not found" }); return; }
  // Published records are archived first, so nothing visitors see disappears by one accidental click
  if (before["status"] === "published") { res.status(409).json({ error: "Unpublish or archive this record before deleting it." }); return; }
  try {
    await pool.query(`DELETE FROM "${def.table}" WHERE id = $1`, [id]);
    if (def.id === "ticket_prices") await recordPriceHistory(null, "delete", staffUser(res).email ?? null, before, null);
    await auditReq(req, res, { action: `${def.id}.delete`, resource: def.table, recordId: id, before });
    res.sendStatus(204);
  } catch (err) {
    await auditReq(req, res, { action: `${def.id}.delete`, resource: def.table, recordId: id, result: "failure", context: { error: (err as Error).message } });
    sendError(res, err, "Could not delete the record");
  }
});

/**
 * CSV import: all rows are validated first and written in one transaction, so a file with any
 * error changes nothing. Rows with an id that exists update that record; others are added.
 */
router.post("/admin/datasets/:dataset/import", requirePermission("content.write"),
  express.text({ type: ["text/csv", "text/plain"], limit: "2mb" }), async (req, res): Promise<void> => {
    const def = datasetOf(String(req.params["dataset"]));
    if (!def) { res.status(404).json({ error: "Unknown dataset" }); return; }
    const email = staffUser(res).email ?? null;
    const table = parseCsv(String(req.body ?? ""));
    if (table.length < 2) { res.status(400).json({ error: "The file has no data rows. Export first to get the right columns." }); return; }
    const header = table[0]!.map(h => h.trim().toLowerCase());
    const known = new Set(exportColumns(def));
    const unknown = header.filter(h => h && !known.has(h));
    if (unknown.length) { res.status(400).json({ error: `Unknown columns: ${unknown.join(", ")}. Use the columns from Export.` }); return; }
    const missing = def.fields.filter(f => f.required && !header.includes(f.name)).map(f => f.name);
    if (missing.length) { res.status(400).json({ error: `Missing required columns: ${missing.join(", ")}` }); return; }
    if (table.length - 1 > 1000) { res.status(400).json({ error: "Import at most 1,000 rows at a time" }); return; }

    const client = await pool.connect();
    let created = 0, updated = 0;
    try {
      await client.query("BEGIN");
      for (let i = 1; i < table.length; i++) {
        const line = i + 1;
        // Columns the server sets itself (who, when, derived flags) are ignored on import
        const input: Row = {};
        header.forEach((h, j) => { if (def.fields.some(f => f.name === h)) input[h] = table[i]![j] ?? ""; });
        const idText = header.includes("id") ? String(table[i]![header.indexOf("id")] ?? "").trim() : "";
        try {
          const existing = idText ? await getRow(def, Number(idText), client) : null;
          if (idText && !existing) throw new ValidationError(`no record with id ${idText} (leave id empty to add a new one)`);
          const values = validateRow(def, input, existing);
          if (existing) {
            const after = await updateRow(def, Number(idText), values, email, client);
            if (def.id === "ticket_prices") await client.query(
              "INSERT INTO ticket_price_history (ticket_price_id, changed_by, change_type, before, after) VALUES ($1, $2, 'import', $3, $4)",
              [Number(idText), email, JSON.stringify(existing), JSON.stringify(after)]);
            updated++;
          } else {
            const row = await insertRow(def, values, email, client);
            if (def.id === "ticket_prices") await client.query(
              "INSERT INTO ticket_price_history (ticket_price_id, changed_by, change_type, after) VALUES ($1, $2, 'import', $3)",
              [row["id"], email, JSON.stringify(row)]);
            created++;
          }
        } catch (err) {
          const msg = err instanceof ValidationError ? err.message : friendlyDbError(err) ?? (err as Error).message;
          throw new ValidationError(`Line ${line}: ${msg}`, line);
        }
      }
      await client.query("COMMIT");
      await auditReq(req, res, { action: `${def.id}.import`, resource: def.table, context: { created, updated, rows: table.length - 1 } });
      res.json({ created, updated });
    } catch (err) {
      await client.query("ROLLBACK");
      await auditReq(req, res, { action: `${def.id}.import`, resource: def.table, result: "failure", context: { error: (err as Error).message } });
      sendError(res, err, "Could not import the file");
    } finally {
      client.release();
    }
  });

/** Ticket price change history (who changed what, before and after). */
router.get("/admin/ticket-prices/history", requirePermission("dashboard.read"), async (_req, res): Promise<void> => {
  const { rows } = await pool.query("SELECT * FROM ticket_price_history ORDER BY changed_at DESC LIMIT 200");
  res.json(rows);
});

/** Counts for the dashboard overview. */
router.get("/admin/overview", requirePermission("dashboard.read"), async (_req, res): Promise<void> => {
  const { rows: [o] } = await pool.query(`
    SELECT
      (SELECT count(*) FROM announcements WHERE status = 'published' AND (publish_at IS NULL OR publish_at <= now()) AND (expires_at IS NULL OR expires_at > now()))::int AS active_announcements,
      (SELECT count(*) FROM announcements WHERE status = 'published' AND publish_at > now())::int AS scheduled_announcements,
      (SELECT count(*) FROM events WHERE status = 'published' AND coalesce(end_date, start_date) >= now())::int AS upcoming_events,
      (SELECT count(*) FROM zoo_updates WHERE status = 'published')::int AS published_updates,
      (SELECT count(*) FROM ticket_prices WHERE status = 'published' AND is_verified)::int AS verified_prices,
      (SELECT count(*) FROM ticket_prices WHERE NOT is_verified AND status <> 'archived')::int AS unverified_prices,
      (SELECT count(*) FROM map_pins)::int AS map_locations,
      (SELECT count(*) FROM map_pins WHERE NOT is_active)::int AS hidden_locations,
      (SELECT count(*) FROM form_submissions)::int AS submissions,
      (SELECT count(*) FROM form_submissions WHERE status = 'new')::int AS new_submissions,
      (SELECT count(*) FROM backups WHERE status = 'completed')::int AS backups_completed,
      (SELECT count(*) FROM backups WHERE status = 'failed')::int AS backups_failed,
      (SELECT max(created_at) FROM backups WHERE status = 'completed') AS last_backup_at,
      (SELECT count(*) FROM audit_logs WHERE result = 'failure' AND created_at > now() - interval '7 days')::int AS failed_actions_7d`);
  res.json(o);
});

// ─── Public (visitor website and chatbot) ────────────────────────────────────

router.get("/zoo-updates", async (_req, res): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT id, title, description, category, published_at, updated_at FROM zoo_updates
      WHERE status = 'published' AND (published_at IS NULL OR published_at <= now())
      ORDER BY published_at DESC NULLS LAST LIMIT 50`);
  res.json(rows);
});

/** Published, verified prices in effect today. Unverified prices are never shown. */
export async function currentTicketPrices() {
  const { rows } = await pool.query(
    `SELECT id, category, visitor_type, price, is_free, effective_date, valid_until, source_reference, verified_at, notes, sort_order
       FROM ticket_prices
      WHERE status = 'published' AND is_verified
        AND (effective_date IS NULL OR effective_date <= (now() AT TIME ZONE 'Asia/Manila')::date)
        AND (valid_until IS NULL OR valid_until >= (now() AT TIME ZONE 'Asia/Manila')::date)
      ORDER BY sort_order, category, visitor_type`);
  return rows;
}

router.get("/ticket-prices", async (_req, res): Promise<void> => {
  const prices = await currentTicketPrices();
  const verified = prices.map(p => String(p.verified_at)).sort().at(-1) ?? null;
  res.json({
    prices,
    last_verified: verified,
    sources: [...new Set(prices.map(p => p.source_reference).filter(Boolean))],
    needs_verification: prices.length === 0,
  });
});

export default router;
