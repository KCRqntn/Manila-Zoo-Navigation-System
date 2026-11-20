import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { pool } from "@workspace/db";
import { requirePermission, staffUser } from "../middleware/access";
import { auditReq, audit, actorFrom } from "../lib/audit";
import { createBackup, restoreBackup, verifyChain, validatePassphrase, BACKUP_DIR } from "../lib/backup";
import { logger } from "../lib/logger";

/**
 * Backup and Recovery (administrators only, permission "backup.manage").
 * Every operation first needs a backup session: the administrator re-enters their account password
 * (POST /admin/backup/unlock), which returns a session id valid for 15 minutes. Backups and restores
 * run as jobs whose real progress the dashboard polls; nothing is reported done before it is.
 */
const router = Router();
const canBackup = requirePermission("backup.manage");
const url = process.env["VITE_SUPABASE_URL"];
const anonKey = process.env["VITE_SUPABASE_ANON_KEY"];

// Backup sessions: hashed id -> user id and expiry (in memory: a server restart ends them)
const sessions = new Map<string, { userId: string; expires: number }>();
const SESSION_MS = 15 * 60 * 1000;
const hashId = (id: string) => createHash("sha256").update(id).digest("hex");

function requireBackupSession(req: Request, res: Response, next: NextFunction) {
  const id = String(req.headers["x-backup-session"] ?? "");
  const s = id ? sessions.get(hashId(id)) : undefined;
  if (!s || s.expires < Date.now() || s.userId !== staffUser(res).id) {
    res.status(401).json({ error: "Unlock backups with your password first", code: "backup_locked" });
    return;
  }
  next();
}

router.post("/admin/backup/unlock", canBackup, async (req, res): Promise<void> => {
  const user = staffUser(res);
  const password = String(req.body?.password ?? "");
  if (!password || !url || !anonKey || !user.email) { res.status(400).json({ error: "Enter your account password" }); return; }
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password });
  if (error || data.user?.id !== user.id) {
    await auditReq(req, res, { action: "backup.unlock", resource: "backups", result: "failure", context: { reason: "wrong password" } });
    res.status(401).json({ error: "Wrong password" });
    return;
  }
  const id = randomBytes(32).toString("base64url");
  sessions.set(hashId(id), { userId: user.id, expires: Date.now() + SESSION_MS });
  await auditReq(req, res, { action: "backup.unlock", resource: "backups" });
  res.json({ session: id, expires_in: SESSION_MS / 1000 });
});

// ─── Jobs ──────────────────────────────────────────────────────────────────────

type Job = { id: string; kind: string; status: "running" | "completed" | "failed"; stage: string; percent: number; result?: unknown; error?: string; userId: string; started: number };
const jobs = new Map<string, Job>();
let busy = false;

function startJob(kind: string, userId: string, work: (progress: (stage: string, percent: number) => void) => Promise<unknown>): Job | null {
  if (busy) return null;
  busy = true;
  const job: Job = { id: randomBytes(8).toString("hex"), kind, status: "running", stage: "Starting", percent: 0, userId, started: Date.now() };
  jobs.set(job.id, job);
  work((stage, percent) => { job.stage = stage; job.percent = Math.round(percent); })
    .then(result => { job.status = "completed"; job.result = result; job.percent = 100; job.stage = "Done"; })
    .catch(err => { job.status = "failed"; job.error = (err as Error).message; job.stage = "Failed"; logger.error({ err, kind }, "Backup job failed"); })
    .finally(() => { busy = false; });
  return job;
}

router.get("/admin/backup/jobs/:id", canBackup, (req, res): void => {
  const job = jobs.get(String(req.params["id"]));
  if (!job || job.userId !== staffUser(res).id) { res.status(404).json({ error: "Job not found" }); return; }
  const { userId: _u, ...view } = job;
  res.json(view);
});

// ─── Catalogue ─────────────────────────────────────────────────────────────────

router.get("/admin/backup/list", canBackup, async (_req, res): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT id, backup_type, base_backup_id, reason, status, created_at, finished_at, created_by, file_name, size_bytes,
            sha256, row_count, changed_rows, file_count, error FROM backups ORDER BY id DESC LIMIT 200`);
  res.json({ backups: rows, storage: { location: "Private folder on the server", folder_name: BACKUP_DIR.split(/[\\/]/).slice(-2).join("/") } });
});

/** Integrity check without the passphrase (SHA-256 of the file and of its full backup). */
router.get("/admin/backup/:id/verify", canBackup, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  try {
    const chain = await verifyChain(id);
    await auditReq(req, res, { action: "backup.verify", resource: "backups", recordId: id, context: { chain: chain.map(c => c.record.id) } });
    res.json({ ok: true, chain: chain.map(c => ({ id: c.record.id, type: c.record.backup_type })) });
  } catch (err) {
    await auditReq(req, res, { action: "backup.verify", resource: "backups", recordId: id, result: "failure", context: { error: (err as Error).message } });
    res.json({ ok: false, error: (err as Error).message });
  }
});

// ─── Operations (need an unlocked backup session) ──────────────────────────────

router.post("/admin/backup/create", canBackup, requireBackupSession, async (req, res): Promise<void> => {
  const type = req.body?.type === "differential" ? "differential" : req.body?.type === "full" ? "full" : null;
  if (!type) { res.status(400).json({ error: "Choose a full or differential backup" }); return; }
  let passphrase: string;
  try { passphrase = validatePassphrase(req.body?.passphrase); } catch (err) { res.status(400).json({ error: (err as Error).message }); return; }
  const user = staffUser(res);
  const actor = actorFrom(user);
  await auditReq(req, res, { action: `backup.${type}.start`, resource: "backups" });
  const job = startJob(`backup-${type}`, user.id, async progress => {
    try {
      const result = await createBackup({ type, passphrase, by: user.email ?? null, reason: "manual", onProgress: progress });
      await audit(actor, { action: `backup.${type}`, resource: "backups", recordId: result.id, after: { size_bytes: result.size_bytes, sha256: result.sha256, row_count: result.row_count, changed_rows: result.changed_rows, file_count: result.file_count }, context: { encrypted: "AES-256-GCM", verified: true } }, req);
      return result;
    } catch (err) {
      await audit(actor, { action: `backup.${type}`, resource: "backups", result: "failure", context: { error: (err as Error).message } }, req);
      throw err;
    }
  });
  if (!job) { res.status(409).json({ error: "Another backup or restore is running. Wait for it to finish." }); return; }
  res.status(202).json({ job: job.id });
});

/**
 * Restore. Needs the typed confirmation "RESTORE", checks the whole chain first, then makes a
 * safety full backup of the current state (same passphrase) before replacing any data.
 */
router.post("/admin/backup/:id/restore", canBackup, requireBackupSession, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (req.body?.confirm !== "RESTORE") { res.status(400).json({ error: "Type RESTORE to confirm" }); return; }
  let passphrase: string;
  try { passphrase = validatePassphrase(req.body?.passphrase); } catch (err) { res.status(400).json({ error: (err as Error).message }); return; }
  const user = staffUser(res);
  const actor = actorFrom(user);
  await auditReq(req, res, { action: "backup.restore.start", resource: "backups", recordId: id });
  const job = startJob("restore", user.id, async progress => {
    try {
      progress("Checking the backup before anything changes", 2);
      await verifyChain(id, passphrase);
      progress("Making a safety backup of the current data", 5);
      const safety = await createBackup({ type: "full", passphrase, by: user.email ?? null, reason: `before restoring #${id}`, onProgress: (s, p) => progress(`Safety backup: ${s}`, 5 + p * 0.3) });
      await audit(actor, { action: "backup.full", resource: "backups", recordId: safety.id, context: { reason: `safety backup before restoring #${id}` } }, req);
      const result = await restoreBackup(id, passphrase, (s, p) => progress(s, 35 + p * 0.65));
      await audit(actor, { action: "backup.restore", resource: "backups", recordId: id, after: result, context: { safety_backup: safety.id } }, req);
      return { ...result, safety_backup: safety.id };
    } catch (err) {
      await audit(actor, { action: "backup.restore", resource: "backups", recordId: id, result: "failure", context: { error: (err as Error).message } }, req);
      throw err;
    }
  });
  if (!job) { res.status(409).json({ error: "Another backup or restore is running. Wait for it to finish." }); return; }
  res.status(202).json({ job: job.id });
});

export default router;
