import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCb } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { promises as fs, constants as fsConstants } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { pool } from "@workspace/db";
import { supabase } from "./supabase";

/**
 * Encrypted full and differential backups of the Manila Zoo system. (Documented for administrators
 * in deploy/BACKUP.md.)
 *
 * SCOPE
 *  - Database: every table in the public schema except audit_logs (append-only, never rolled back),
 *    backups (this catalogue) and schema_migrations. Each row is stored as the exact JSON text
 *    Postgres produces (row_to_json), and restored with json_populate_recordset, so every value
 *    (timestamps, numerics, arrays, JSON) round-trips unchanged.
 *  - Uploaded files: every object in the Supabase Storage buckets (animal photos).
 *  - Not included: Supabase Auth accounts (managed by Supabase), the source code and the AI model
 *    files (kept as files; back them up by copying the project folder).
 *
 * BACKUP CHAIN
 *  - Full: every row of every table in scope and every stored file, at one point in time.
 *  - Differential: the changes since the most recent completed full backup. The full backup is
 *    decrypted and each table is compared row by row (by id, on the exact row text): new or changed
 *    rows are stored whole, deleted rows by id. Files are compared by name, size and last-modified
 *    time; new or changed files are stored, removed ones listed. A differential records its full
 *    backup's id and SHA-256, so restoring it needs exactly that full backup.
 *
 * ENCRYPTION
 *  - Contents are gzipped, then encrypted with AES-256-GCM (authenticated). The 256-bit key is
 *    derived from the administrator's backup passphrase with scrypt (N=2^15, r=8, p=1) and a random
 *    16-byte salt per file. The passphrase and key are never stored or logged; the file header
 *    (format, ids, salt, IV) is authenticated as additional data, so changing it is detected.
 *  - File layout: "MZB1" | header length (4 bytes, big-endian) | header JSON | 12-byte IV |
 *    16-byte GCM tag | ciphertext.
 *  - The catalogue stores each file's SHA-256, so integrity can be checked without the passphrase;
 *    decryption also fails if a single byte was changed.
 */

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;
const KDF = { name: "scrypt", N: 32768, r: 8, p: 1, keylen: 32 };
const MAGIC = Buffer.from("MZB1");
const EXCLUDED_TABLES = new Set(["audit_logs", "backups", "schema_migrations"]);

export const BACKUP_DIR = path.resolve(process.env["BACKUP_DIR"] ?? path.join(process.cwd(), "..", "..", "backups", "encrypted"));

export type Progress = (stage: string, percent: number) => void;
type Header = { format: "manila-zoo-backup"; version: 1; backup_id: number; type: "full" | "differential"; base_backup_id: number | null; base_sha256: string | null; created_at: string; kdf: typeof KDF & { salt: string } };
type StoredFile = { bucket: string; name: string; size: number; updated_at: string | null; content_type: string | null; data?: string };
export type FullPayload = {
  type: "full";
  tables: Record<string, { columns: string[]; key: string; rows: string[] }>;
  files: StoredFile[];
};
export type DiffPayload = {
  type: "differential";
  tables: Record<string, { columns: string[]; key: string; upserts: string[]; deletes: (string | number)[] }>;
  files: { upserts: StoredFile[]; deletes: { bucket: string; name: string }[] };
};
type Payload = FullPayload | DiffPayload;

export function validatePassphrase(p: unknown): string {
  if (typeof p !== "string" || p.length < 12) throw new Error("The backup passphrase must be at least 12 characters");
  if (p.length > 200) throw new Error("The backup passphrase is too long");
  return p;
}

// ─── Encryption ────────────────────────────────────────────────────────────────

async function encrypt(payload: Payload, header: Omit<Header, "kdf">, passphrase: string): Promise<Buffer> {
  const salt = randomBytes(16);
  const fullHeader: Header = { ...header, kdf: { ...KDF, salt: salt.toString("base64") } };
  const key = await scrypt(passphrase, salt, KDF.keylen, { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 128 * KDF.N * KDF.r * 2 });
  const iv = randomBytes(12);
  const headerBuf = Buffer.from(JSON.stringify(fullHeader), "utf8");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(headerBuf);
  const ciphertext = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(payload), "utf8"))), cipher.final()]);
  const tag = cipher.getAuthTag();
  key.fill(0);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(headerBuf.length);
  return Buffer.concat([MAGIC, len, headerBuf, iv, tag, ciphertext]);
}

export function readHeader(file: Buffer): Header {
  if (file.length < 40 || !file.subarray(0, 4).equals(MAGIC)) throw new Error("Not a Manila Zoo backup file");
  const len = file.readUInt32BE(4);
  return JSON.parse(file.subarray(8, 8 + len).toString("utf8")) as Header;
}

async function decrypt(file: Buffer, passphrase: string): Promise<{ header: Header; payload: Payload }> {
  const header = readHeader(file);
  const len = file.readUInt32BE(4);
  const headerBuf = file.subarray(8, 8 + len);
  const iv = file.subarray(8 + len, 20 + len);
  const tag = file.subarray(20 + len, 36 + len);
  const ciphertext = file.subarray(36 + len);
  const k = header.kdf;
  const key = await scrypt(passphrase, Buffer.from(k.salt, "base64"), k.keylen, { N: k.N, r: k.r, p: k.p, maxmem: 128 * k.N * k.r * 2 });
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(headerBuf);
  decipher.setAuthTag(tag);
  let plain: Buffer;
  try {
    plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("Wrong passphrase, or the backup file was changed or damaged");
  } finally {
    key.fill(0);
  }
  return { header, payload: JSON.parse(gunzipSync(plain).toString("utf8")) as Payload };
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

// ─── Reading the current state ─────────────────────────────────────────────────

/** Tables in scope, parents before children (for inserting), with their columns. */
export async function scopeTables(): Promise<{ name: string; columns: string[]; key: string }[]> {
  const { rows: tables } = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  const names = tables.map(t => t.table_name).filter(n => !EXCLUDED_TABLES.has(n));
  const { rows: fks } = await pool.query<{ child: string; parent: string }>(
    `SELECT tc.table_name AS child, ccu.table_name AS parent FROM information_schema.table_constraints tc
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`);
  const ordered: string[] = [];
  const visit = (n: string, stack: Set<string>) => {
    if (ordered.includes(n) || stack.has(n)) return;
    stack.add(n);
    for (const f of fks) if (f.child === n && f.parent !== n && names.includes(f.parent)) visit(f.parent, stack);
    ordered.push(n);
  };
  names.sort().forEach(n => visit(n, new Set()));
  const { rows: cols } = await pool.query<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY ordinal_position");
  // Each table's primary key column (all tables in scope have a single-column key: usually id)
  const { rows: keys } = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT tc.table_name, k.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_name = tc.table_name
      WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'`);
  return ordered.map(name => {
    const pk = keys.filter(k => k.table_name === name).map(k => k.column_name);
    if (pk.length !== 1) throw new Error(`Table ${name} needs a single-column primary key to be backed up`);
    return { name, columns: cols.filter(c => c.table_name === name).map(c => c.column_name), key: pk[0]! };
  });
}

async function readTables(onProgress: Progress, from: number, to: number): Promise<FullPayload["tables"]> {
  const tables = await scopeTables();
  const out: FullPayload["tables"] = {};
  for (const [i, t] of tables.entries()) {
    const { rows } = await pool.query<{ j: string }>(`SELECT row_to_json(t)::text AS j FROM "${t.name}" t ORDER BY "${t.key}"`);
    out[t.name] = { columns: t.columns, key: t.key, rows: rows.map(r => r.j) };
    onProgress(`Reading table ${t.name}`, from + ((i + 1) / tables.length) * (to - from));
  }
  return out;
}

async function listFiles(): Promise<StoredFile[]> {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Could not list storage buckets: ${error.message}`);
  const files: StoredFile[] = [];
  for (const b of buckets ?? []) {
    const walk = async (prefix: string): Promise<void> => {
      for (let offset = 0; ; offset += 1000) {
        const { data, error: e } = await supabase.storage.from(b.name).list(prefix, { limit: 1000, offset });
        if (e) throw new Error(`Could not list ${b.name}/${prefix}: ${e.message}`);
        if (!data?.length) break;
        for (const o of data) {
          const name = prefix ? `${prefix}/${o.name}` : o.name;
          if (o.id === null) await walk(name);
          else files.push({ bucket: b.name, name, size: Number(o.metadata?.["size"] ?? 0), updated_at: o.updated_at ?? null, content_type: (o.metadata?.["mimetype"] as string) ?? null });
        }
        if (data.length < 1000) break;
      }
    };
    await walk("");
  }
  return files;
}

async function download(f: StoredFile): Promise<string> {
  const { data, error } = await supabase.storage.from(f.bucket).download(f.name);
  if (error || !data) throw new Error(`Could not download ${f.bucket}/${f.name}: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer()).toString("base64");
}

const sameFile = (a: StoredFile, b: StoredFile) => a.size === b.size && a.updated_at === b.updated_at;
const fileKey = (f: { bucket: string; name: string }) => `${f.bucket}/${f.name}`;

// ─── Creating backups ──────────────────────────────────────────────────────────

async function writeArtifact(id: number, type: string, data: Buffer): Promise<string> {
  await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const name = `manila-zoo-${type}-${String(id).padStart(5, "0")}-${new Date().toISOString().replace(/[:.]/g, "-")}.mzb`;
  // "wx": never overwrite an existing file
  await fs.writeFile(path.join(BACKUP_DIR, name), data, { flag: "wx", mode: 0o600 });
  return name;
}

export async function loadArtifact(fileName: string): Promise<Buffer> {
  const safe = path.basename(fileName);
  return fs.readFile(path.join(BACKUP_DIR, safe));
}

type BackupRecord = { id: number; backup_type: string; base_backup_id: number | null; file_name: string; sha256: string; status: string; created_at: string };

export async function createBackup(opts: { type: "full" | "differential"; passphrase: string; by: string | null; reason: string; onProgress: Progress }) {
  const { type, passphrase, by, reason, onProgress } = opts;
  let base: BackupRecord | null = null;
  if (type === "differential") {
    const { rows } = await pool.query<BackupRecord>(
      "SELECT * FROM backups WHERE backup_type = 'full' AND status = 'completed' ORDER BY created_at DESC LIMIT 1");
    base = rows[0] ?? null;
    if (!base) throw new Error("A differential backup needs a full backup first. Create a full backup.");
  }
  const { rows: [record] } = await pool.query<{ id: number; created_at: Date }>(
    "INSERT INTO backups (backup_type, base_backup_id, reason, created_by) VALUES ($1, $2, $3, $4) RETURNING id, created_at",
    [type, base?.id ?? null, reason, by]);
  const id = record!.id;
  try {
    let payload: Payload;
    let rowCount = 0, changedRows = 0, fileCount = 0;
    onProgress("Reading the database", 5);
    const tables = await readTables(onProgress, 5, 35);
    rowCount = Object.values(tables).reduce((n, t) => n + t.rows.length, 0);
    onProgress("Listing uploaded files", 37);
    const files = await listFiles();

    if (type === "full") {
      for (const [i, f] of files.entries()) {
        f.data = await download(f);
        onProgress(`Copying files (${i + 1}/${files.length})`, 40 + ((i + 1) / Math.max(1, files.length)) * 35);
      }
      fileCount = files.length;
      changedRows = rowCount;
      payload = { type: "full", tables, files };
    } else {
      onProgress("Opening the full backup to compare", 40);
      const baseFile = await loadArtifact(base!.file_name);
      if (sha256(baseFile) !== base!.sha256) throw new Error(`Full backup #${base!.id} failed its integrity check; create a new full backup`);
      const { payload: full } = await decrypt(baseFile, passphrase).catch(() => {
        throw new Error(`Could not open full backup #${base!.id}. Use the same passphrase as that full backup.`);
      });
      if (full.type !== "full") throw new Error("The base backup isn't a full backup");
      onProgress("Comparing with the full backup", 50);
      const diffTables: DiffPayload["tables"] = {};
      for (const [name, t] of Object.entries(tables)) {
        const keyOf = (r: string) => JSON.parse(r)[t.key] as string | number;
        const before = new Map<string | number, string>();
        for (const r of full.tables[name]?.rows ?? []) before.set(keyOf(r), r);
        const nowIds = new Set<string | number>();
        const upserts: string[] = [];
        for (const r of t.rows) {
          const rowId = keyOf(r);
          nowIds.add(rowId);
          if (before.get(rowId) !== r) upserts.push(r);
        }
        const deletes = [...before.keys()].filter(k => !nowIds.has(k));
        if (upserts.length || deletes.length || !full.tables[name]) diffTables[name] = { columns: t.columns, key: t.key, upserts, deletes };
        changedRows += upserts.length + deletes.length;
      }
      const baseFiles = new Map(full.files.map(f => [fileKey(f), f]));
      const nowKeys = new Set(files.map(fileKey));
      const changed = files.filter(f => { const b = baseFiles.get(fileKey(f)); return !b || !sameFile(b, f); });
      for (const [i, f] of changed.entries()) {
        f.data = await download(f);
        onProgress(`Copying changed files (${i + 1}/${changed.length})`, 55 + ((i + 1) / Math.max(1, changed.length)) * 20);
      }
      fileCount = changed.length;
      payload = {
        type: "differential",
        tables: diffTables,
        files: { upserts: changed, deletes: full.files.filter(f => !nowKeys.has(fileKey(f))).map(f => ({ bucket: f.bucket, name: f.name })) },
      };
    }

    onProgress("Encrypting", 80);
    const header = {
      format: "manila-zoo-backup" as const, version: 1 as const, backup_id: id, type,
      base_backup_id: base?.id ?? null, base_sha256: base?.sha256 ?? null, created_at: record!.created_at.toISOString(),
    };
    const encrypted = await encrypt(payload, header, passphrase);
    onProgress("Saving the encrypted file", 90);
    const fileName = await writeArtifact(id, type, encrypted);
    // Read it back and check it opens, before reporting success
    onProgress("Verifying the saved backup", 95);
    const check = await loadArtifact(fileName);
    await decrypt(check, passphrase);
    const digest = sha256(check);
    await pool.query(
      `UPDATE backups SET status = 'completed', finished_at = now(), file_name = $1, size_bytes = $2, sha256 = $3,
              row_count = $4, changed_rows = $5, file_count = $6, tables = $7 WHERE id = $8`,
      [fileName, check.length, digest, rowCount, changedRows, fileCount,
        JSON.stringify(Object.fromEntries(Object.entries(payload.tables).map(([n, t]) => [n, "rows" in t ? t.rows.length : t.upserts.length + t.deletes.length]))), id]);
    onProgress("Done", 100);
    return { id, file_name: fileName, size_bytes: check.length, sha256: digest, row_count: rowCount, changed_rows: changedRows, file_count: fileCount };
  } catch (err) {
    await pool.query("UPDATE backups SET status = 'failed', finished_at = now(), error = $1 WHERE id = $2", [(err as Error).message.slice(0, 500), id]);
    throw err;
  }
}

// ─── Verifying and restoring ───────────────────────────────────────────────────

/** Checks a backup (and its full backup) exist and match their SHA-256; with a passphrase also decrypts them. */
export async function verifyChain(id: number, passphrase?: string) {
  const { rows: [b] } = await pool.query<BackupRecord>("SELECT * FROM backups WHERE id = $1", [id]);
  if (!b) throw new Error("Backup not found");
  if (b.status !== "completed") throw new Error(`Backup #${id} didn't complete (${b.status})`);
  const chain: BackupRecord[] = [b];
  if (b.backup_type === "differential") {
    const { rows: [full] } = await pool.query<BackupRecord>("SELECT * FROM backups WHERE id = $1", [b.base_backup_id]);
    if (!full || full.status !== "completed") throw new Error(`Its full backup #${b.base_backup_id} is missing or incomplete`);
    chain.unshift(full);
  }
  const opened: { record: BackupRecord; header: Header; payload?: Payload }[] = [];
  for (const r of chain) {
    let file: Buffer;
    try { file = await loadArtifact(r.file_name); } catch { throw new Error(`The file for backup #${r.id} is missing`); }
    if (sha256(file) !== r.sha256) throw new Error(`Backup #${r.id} failed its integrity check (the file was changed or damaged)`);
    const header = readHeader(file);
    if (header.backup_id !== r.id) throw new Error(`The file for backup #${r.id} belongs to a different backup`);
    if (passphrase) {
      const { payload } = await decrypt(file, passphrase);
      opened.push({ record: r, header, payload });
    } else opened.push({ record: r, header });
  }
  if (chain.length === 2 && opened[1]!.header.base_sha256 !== chain[0]!.sha256) throw new Error("The differential backup doesn't match its full backup");
  return opened;
}

/**
 * Restores the database (and missing or changed files) to the state of a backup. Runs in one
 * transaction: all tables in scope are emptied and refilled, sequences reset, and the result is
 * compared with the backup before committing; any mismatch rolls everything back.
 */
export async function restoreBackup(id: number, passphrase: string, onProgress: Progress) {
  onProgress("Checking backup integrity", 5);
  const opened = await verifyChain(id, passphrase);
  const full = opened[0]!.payload as FullPayload;
  const diff = opened[1]?.payload as DiffPayload | undefined;

  // The target state: the full backup with the differential applied
  const target: Record<string, { columns: string[]; key: string; rows: string[] }> = {};
  for (const [name, t] of Object.entries(full.tables)) target[name] = { columns: t.columns, key: t.key, rows: [...t.rows] };
  if (diff) {
    for (const [name, d] of Object.entries(diff.tables)) {
      const keyOf = (r: string) => JSON.parse(r)[d.key] as string | number;
      const byId = new Map((target[name]?.rows ?? []).map(r => [keyOf(r), r]));
      for (const delId of d.deletes) byId.delete(delId);
      for (const r of d.upserts) byId.set(keyOf(r), r);
      target[name] = { columns: d.columns, key: d.key, rows: [...byId.values()] };
    }
  }
  const files = new Map(full.files.map(f => [fileKey(f), f]));
  if (diff) {
    for (const f of diff.files.deletes) files.delete(fileKey(f));
    for (const f of diff.files.upserts) files.set(fileKey(f), f);
  }

  const current = await scopeTables();
  const client = await pool.connect();
  const restored: Record<string, number> = {};
  try {
    await client.query("BEGIN");
    onProgress("Clearing current data", 25);
    const inScope = current.filter(t => target[t.name]);
    await client.query(`TRUNCATE ${inScope.map(t => `"${t.name}"`).join(", ")} RESTART IDENTITY`);
    for (const [i, t] of inScope.entries()) {
      const data = target[t.name]!;
      // Only columns that exist both now and in the backup (the schema may have gained columns since)
      const cols = t.columns.filter(c => data.columns.includes(c));
      for (let start = 0; start < data.rows.length; start += 500) {
        const chunk = data.rows.slice(start, start + 500);
        await client.query(
          `INSERT INTO "${t.name}" (${cols.map(c => `"${c}"`).join(", ")})
           SELECT ${cols.map(c => `"${c}"`).join(", ")} FROM json_populate_recordset(NULL::"${t.name}", $1::json)`,
          [`[${chunk.join(",")}]`]);
      }
      // Serial ids continue after the restored rows (tables keyed by text have no sequence)
      if (t.key === "id") {
        await client.query(`SELECT setval(seq, GREATEST(coalesce((SELECT max(id) FROM "${t.name}"), 0), 1), (SELECT count(*) > 0 FROM "${t.name}"))
                              FROM (SELECT pg_get_serial_sequence('"${t.name}"', 'id') AS seq) s WHERE seq IS NOT NULL`);
      }
      restored[t.name] = data.rows.length;
      onProgress(`Restoring ${t.name}`, 25 + ((i + 1) / inScope.length) * 50);
    }
    // Verify before committing: same rows, and the same row text where the columns are unchanged
    onProgress("Verifying restored data", 78);
    for (const t of inScope) {
      const data = target[t.name]!;
      const { rows } = await client.query<{ j: string }>(`SELECT row_to_json(x)::text AS j FROM "${t.name}" x`);
      if (rows.length !== data.rows.length) throw new Error(`Verification failed for ${t.name}: ${rows.length} rows instead of ${data.rows.length}`);
      const sameColumns = t.columns.length === data.columns.length && t.columns.every(c => data.columns.includes(c));
      if (sameColumns) {
        const expected = new Set(data.rows);
        if (rows.some(r => !expected.has(r.j))) throw new Error(`Verification failed for ${t.name}: restored values differ from the backup`);
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Files: put back any that are missing or different (files added after the backup are kept)
  onProgress("Restoring uploaded files", 85);
  const now = new Map((await listFiles()).map(f => [fileKey(f), f]));
  let filesRestored = 0;
  const wanted = [...files.values()].filter(f => { const n = now.get(fileKey(f)); return !n || n.size !== f.size; });
  for (const f of wanted) {
    if (!f.data) continue;
    const { error } = await supabase.storage.from(f.bucket).upload(f.name, Buffer.from(f.data, "base64"), { upsert: true, contentType: f.content_type ?? undefined });
    if (error) throw new Error(`Database restored, but file ${f.bucket}/${f.name} couldn't be restored: ${error.message}`);
    filesRestored++;
  }
  onProgress("Done", 100);
  return { tables: restored, rows: Object.values(restored).reduce((a, b) => a + b, 0), files_restored: filesRestored, files_in_backup: files.size };
}
