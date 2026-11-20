import { Router } from "express";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { pool } from "@workspace/db";
import { requirePermission, staffUser } from "../middleware/access";
import { auditReq } from "../lib/audit";
import { toCsv } from "../lib/csv";

/**
 * Visitor form submissions.
 *   Public:  POST /forms/inquiry    the contact / group-visit inquiry form on the Help page
 *   Admin:   /admin/submissions     inquiries, account registrations and private animal feedback
 * Only the fields the zoo needs to reply are collected. Viewing, status changes and exports are
 * audited; exports leave out phone numbers unless asked for, and never include passwords or tokens.
 */
const router = Router();

const supabaseUrl = process.env["VITE_SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const supabaseAdmin = supabaseUrl && serviceKey
  ? createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

const STATUSES = ["new", "in_review", "resolved", "archived"];

// At most 5 submissions per address per hour, against spam
const recent = new Map<string, number[]>();

router.post("/forms/inquiry", async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  // Hidden field real visitors never fill (bots do)
  if (str(b.website, 100)) { res.status(201).json({ ok: true }); return; }
  const form = {
    form_type: b.form_type === "group_visit" ? "group_visit" : "inquiry",
    name: str(b.name, 120),
    email: str(b.email, 200).toLowerCase() || null,
    phone: str(b.phone, 40) || null,
    subject: str(b.subject, 200) || null,
    message: str(b.message, 2000),
    visit_date: str(b.visit_date, 10) || null,
    group_size: b.group_size === "" || b.group_size == null ? null : Number(b.group_size),
  };
  const errors: string[] = [];
  if (form.name.length < 2) errors.push("Enter your name");
  if (!form.email && !form.phone) errors.push("Enter an email address or a phone number so the zoo can reply");
  if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errors.push("Enter a valid email address");
  if (form.phone && !/^[+\d][\d\s-]{6,19}$/.test(form.phone)) errors.push("Enter a valid phone number");
  if (form.message.length < 5) errors.push("Write your message");
  if (form.visit_date) {
    const d = new Date(`${form.visit_date}T00:00:00+08:00`);
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" })); today.setHours(0, 0, 0, 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.visit_date) || Number.isNaN(d.getTime())) errors.push("Enter a valid visit date");
    else if (d < today) errors.push("The visit date can't be in the past");
  }
  if (form.group_size != null && (!Number.isInteger(form.group_size) || form.group_size < 1 || form.group_size > 1000)) errors.push("Group size must be from 1 to 1000");
  if (errors.length) { res.status(400).json({ error: errors.join(". ") }); return; }

  const ip = req.ip ?? "unknown";
  const times = (recent.get(ip) ?? []).filter(t => Date.now() - t < 3600_000);
  if (times.length >= 30) {  // per address: groups on one Wi-Fi share it
    res.status(429).json({ error: "Too many messages from this device. Please try again later." }); return; }
  recent.set(ip, [...times, Date.now()]);

  // The same person sending the same message again is a duplicate, not a new submission
  const fingerprint = createHash("sha256").update([form.form_type, form.email ?? form.phone, form.message.toLowerCase()].join("|")).digest("hex");
  try {
    const { rows } = await pool.query(
      `INSERT INTO form_submissions (form_type, name, email, phone, subject, message, visit_date, group_size, fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, created_at`,
      [form.form_type, form.name, form.email, form.phone, form.subject, form.message, form.visit_date, form.group_size, fingerprint]);
    res.status(201).json({ ok: true, id: rows[0].id });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") { res.status(409).json({ error: "We already received this message. The zoo will get back to you." }); return; }
    if ((err as { code?: string }).code === "23514") { res.status(400).json({ error: "Some details aren't valid. Check the form and try again." }); return; }
    throw err;
  }
});

// ─── Admin ────────────────────────────────────────────────────────────────────

const read = requirePermission("submissions.read");
const write = requirePermission("submissions.write");

function filters(q: Record<string, unknown>) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  if (STATUSES.includes(String(q["status"]))) add("status = ?", q["status"]);
  if (["inquiry", "group_visit"].includes(String(q["form_type"]))) add("form_type = ?", q["form_type"]);
  if (q["search"]) {
    params.push(`%${String(q["search"]).trim()}%`);
    const n = params.length;
    where.push(`(name ILIKE $${n} OR email ILIKE $${n} OR subject ILIKE $${n} OR message ILIKE $${n})`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(q["from"] ?? ""))) add("created_at >= ?::date", q["from"]);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(q["to"] ?? ""))) add("created_at < (?::date + 1)", q["to"]);
  return { where: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

router.get("/admin/submissions", read, async (req, res): Promise<void> => {
  const { where, params } = filters(req.query);
  const pageSize = Math.min(100, Math.max(1, Number(req.query["page_size"]) || 20));
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const { rows: [{ count }] } = await pool.query(`SELECT count(*)::int AS count FROM form_submissions ${where}`, params);
  const { rows } = await pool.query(
    `SELECT id, form_type, name, email, phone, subject, message, visit_date, group_size, status, admin_note, created_at, updated_at, updated_by
       FROM form_submissions ${where} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
  const { rows: counts } = await pool.query("SELECT status, count(*)::int AS n FROM form_submissions GROUP BY status");
  res.json({ rows, total: count, page, page_size: pageSize, by_status: Object.fromEntries(counts.map(c => [c.status, c.n])) });
});

router.get("/admin/submissions/:id", read, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const { rows } = await pool.query("SELECT * FROM form_submissions WHERE id = $1", [id]);
  if (!rows[0]) { res.status(404).json({ error: "Submission not found" }); return; }
  const { fingerprint: _f, ...record } = rows[0];
  // Opening a record with personal details is recorded
  await auditReq(req, res, { action: "submission.view", resource: "form_submissions", recordId: id });
  res.json(record);
});

router.patch("/admin/submissions/:id", write, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const status = req.body?.status;
  const note = typeof req.body?.admin_note === "string" ? req.body.admin_note.trim().slice(0, 1000) : undefined;
  if (status !== undefined && !STATUSES.includes(status)) { res.status(400).json({ error: `Status must be one of: ${STATUSES.join(", ")}` }); return; }
  const { rows: [before] } = await pool.query("SELECT id, status, admin_note FROM form_submissions WHERE id = $1", [id]);
  if (!before) { res.status(404).json({ error: "Submission not found" }); return; }
  const { rows: [after] } = await pool.query(
    `UPDATE form_submissions SET status = coalesce($1, status), admin_note = coalesce($2, admin_note), updated_at = now(), updated_by = $3
      WHERE id = $4 RETURNING id, status, admin_note, updated_at, updated_by`,
    [status ?? null, note ?? null, staffUser(res).email ?? null, id]);
  await auditReq(req, res, { action: "submission.update", resource: "form_submissions", recordId: id, before, after: { status: after.status, admin_note: after.admin_note } });
  res.json(after);
});

router.get("/admin/submissions-export.csv", write, async (req, res): Promise<void> => {
  const { where, params } = filters(req.query);
  const withPhone = req.query["include_phone"] === "1";
  const { rows } = await pool.query(`SELECT * FROM form_submissions ${where} ORDER BY created_at DESC`, params);
  const columns = ["id", "created_at", "form_type", "status", "name", "email", ...(withPhone ? ["phone"] : []), "subject", "message", "visit_date", "group_size", "admin_note"];
  await auditReq(req, res, { action: "submission.export", resource: "form_submissions", context: { rows: rows.length, include_phone: withPhone, filters: req.query } });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="submissions-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(columns, rows));
});

/** Account registrations (visitor sign-ups), from Supabase Auth: name, email, dates and role only. */
router.get("/admin/registrations", read, async (req, res): Promise<void> => {
  if (!supabaseAdmin) { res.status(503).json({ error: "Supabase Admin API is not configured" }); return; }
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) { res.status(502).json({ error: error.message }); return; }
  const search = String(req.query["search"] ?? "").toLowerCase();
  const rows = data.users
    .map(u => ({
      id: u.id,
      full_name: (u.user_metadata?.["full_name"] as string | undefined) ?? null,
      email: u.email ?? "",
      role: String(u.app_metadata?.["role"] ?? "visitor"),
      email_confirmed: !!u.email_confirmed_at,
      registered_at: u.created_at,
      last_login: u.last_sign_in_at ?? null,
    }))
    .filter(r => !search || r.email.toLowerCase().includes(search) || (r.full_name ?? "").toLowerCase().includes(search))
    .sort((a, b) => b.registered_at.localeCompare(a.registered_at));
  await auditReq(req, res, { action: "registration.list", resource: "users", context: { rows: rows.length } });
  res.json(rows);
});

export default router;
