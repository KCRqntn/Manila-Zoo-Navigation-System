import { Router } from "express";
import { pool } from "@workspace/db";
import { requirePermission } from "../middleware/access";
import { auditReq, verifyAuditChain } from "../lib/audit";
import { toCsv } from "../lib/csv";

/** Audit log viewer for administrators: filter, paginate, export, and check the hash chain. */
const router = Router();
const canRead = requirePermission("audit.read");

function filters(q: Record<string, unknown>) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace(/\?/g, `$${params.length}`)); };
  if (q["user"]) add("actor_email ILIKE ?", `%${String(q["user"]).trim()}%`);
  if (q["action"]) add("action ILIKE ?", `%${String(q["action"]).trim()}%`);
  if (q["resource"]) add("resource = ?", String(q["resource"]));
  if (q["result"] === "success" || q["result"] === "failure") add("result = ?", q["result"]);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(q["from"] ?? ""))) add("created_at >= (?::date::timestamp AT TIME ZONE 'Asia/Manila')", q["from"]);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(q["to"] ?? ""))) add("created_at < ((?::date + 1)::timestamp AT TIME ZONE 'Asia/Manila')", q["to"]);
  return { where: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

router.get("/admin/audit-logs", canRead, async (req, res): Promise<void> => {
  const { where, params } = filters(req.query);
  const pageSize = Math.min(200, Math.max(1, Number(req.query["page_size"]) || 50));
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const { rows: [{ count }] } = await pool.query(`SELECT count(*)::int AS count FROM audit_logs ${where}`, params);
  const { rows } = await pool.query(
    `SELECT id, created_at, actor_email, actor_role, action, resource, record_id, result, before, after, context
       FROM audit_logs ${where} ORDER BY id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
  const { rows: resources } = await pool.query("SELECT DISTINCT resource FROM audit_logs ORDER BY 1");
  res.json({ rows, total: count, page, page_size: pageSize, resources: resources.map(r => r.resource) });
});

router.get("/admin/audit-logs/verify", canRead, async (req, res): Promise<void> => {
  const result = await verifyAuditChain();
  await auditReq(req, res, { action: "audit.verify", resource: "audit_logs", result: result.ok ? "success" : "failure", context: result });
  res.json(result);
});

router.get("/admin/audit-logs/export.csv", canRead, async (req, res): Promise<void> => {
  const { where, params } = filters(req.query);
  const { rows } = await pool.query(
    `SELECT id, created_at, actor_email, actor_role, action, resource, record_id, result, before, after, context, hash
       FROM audit_logs ${where} ORDER BY id LIMIT 50000`, params);
  await auditReq(req, res, { action: "audit.export", resource: "audit_logs", context: { rows: rows.length, filters: req.query } });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(["id", "created_at", "actor_email", "actor_role", "action", "resource", "record_id", "result", "before", "after", "context", "hash"], rows));
});

export default router;
