import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { roleOf } from "../middleware/access";

/**
 * Server-side audit log. Records are append-only (a database trigger rejects UPDATE and DELETE)
 * and each one stores a SHA-256 hash of its own contents plus the previous record's hash, so
 * editing or removing a record directly in the database breaks the chain and shows up in
 * verifyAuditChain(). Limits: someone with full database rights can still drop the trigger and
 * rewrite the whole chain; the chain detects tampering, it can't prevent a database owner.
 *
 * Never pass passwords, tokens, encryption keys or backup contents in before/after/context.
 */
export type AuditEntry = {
  action: string;
  resource: string;
  recordId?: string | number | null;
  result?: "success" | "failure";
  before?: unknown;
  after?: unknown;
  context?: Record<string, unknown>;
};

// Keys whose values are never stored, at any depth
const SECRET_KEYS = /password|passphrase|token|secret|api_?key|anon_?key|service_?role|encryption_?key|private_?key|authorization|cookie/i;
function scrub(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value ?? null;
  if (Array.isArray(value)) return value.map(v => scrub(v, depth + 1));
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    // Undefined values are dropped (JSON storage drops them too, and the hash must match what's stored)
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).map(([k, v]) =>
      [k, SECRET_KEYS.test(k) ? "[removed]" : scrub(v, depth + 1)]));
  }
  return value;
}

// Canonical JSON (keys sorted at every level): Postgres jsonb reorders keys, so the hash is taken
// over a form that reads back identically from the database
function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value as object).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const hashOf = (fields: unknown[]) => createHash("sha256").update(canonical(fields)).digest("hex");

// One writer at a time so each record links to the one before it
let queue: Promise<unknown> = Promise.resolve();

type Actor = { id?: string | null; email?: string | null; role?: string | null };

export function actorFrom(user: User | null | undefined): Actor {
  return user ? { id: user.id, email: user.email ?? null, role: roleOf(user) } : { id: null, email: null, role: null };
}

/** Writes one audit record. Never throws: a failure to log is itself logged to the server log. */
export function audit(actor: Actor, entry: AuditEntry, req?: Request): Promise<void> {
  const context = scrub({
    ...(entry.context ?? {}),
    ...(req ? { ip: req.ip, userAgent: String(req.headers["user-agent"] ?? "").slice(0, 200), method: req.method, path: req.originalUrl.split("?")[0] } : {}),
  });
  const run = async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialise writers across API processes too
      await client.query("SELECT pg_advisory_xact_lock(424242)");
      const { rows } = await client.query<{ hash: string }>("SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1");
      const prevHash = rows[0]?.hash ?? null;
      const createdAt = new Date().toISOString();
      const before = entry.before === undefined ? null : scrub(entry.before);
      const after = entry.after === undefined ? null : scrub(entry.after);
      const recordId = entry.recordId == null ? null : String(entry.recordId);
      const result = entry.result ?? "success";
      const hash = hashOf([prevHash, createdAt, actor.id ?? null, actor.email ?? null, entry.action, entry.resource, recordId, result, before, after, context]);
      await client.query(
        `INSERT INTO audit_logs (created_at, actor_id, actor_email, actor_role, action, resource, record_id, result, before, after, context, prev_hash, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [createdAt, actor.id ?? null, actor.email ?? null, actor.role ?? null, entry.action, entry.resource, recordId, result,
          before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), JSON.stringify(context), prevHash, hash],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error({ err, action: entry.action, resource: entry.resource }, "Could not write audit log");
    } finally {
      client.release();
    }
  };
  const next = queue.then(run, run);
  queue = next;
  return next;
}

/** Audit helper for a route handled by requirePermission (actor = the signed-in staff member). */
export function auditReq(req: Request, res: Response, entry: AuditEntry): Promise<void> {
  return audit(actorFrom(res.locals["user"] as User | undefined), entry, req);
}

/**
 * Recomputes every record's hash and its link to the previous one. Returns the first broken record,
 * if any. Timestamps are compared as stored, so the hash covers the exact server time.
 */
export async function verifyAuditChain(): Promise<{ checked: number; ok: boolean; brokenAt?: number; reason?: string }> {
  const { rows } = await pool.query(
    `SELECT id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
            actor_id, actor_email, action, resource, record_id, result, before, after, context, prev_hash, hash
       FROM audit_logs ORDER BY id`,
  );
  let prev: string | null = null;
  for (const r of rows) {
    if (r.prev_hash !== prev) return { checked: rows.length, ok: false, brokenAt: Number(r.id), reason: "link to the previous record doesn't match" };
    const expected = hashOf([r.prev_hash, r.created_at, r.actor_id, r.actor_email, r.action, r.resource, r.record_id, r.result, r.before, r.after, r.context]);
    if (expected !== r.hash) return { checked: rows.length, ok: false, brokenAt: Number(r.id), reason: "record contents don't match their hash" };
    prev = r.hash;
  }
  return { checked: rows.length, ok: true };
}
