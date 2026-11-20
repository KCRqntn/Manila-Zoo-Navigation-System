import { pool } from "@workspace/db";

// Anything that runs SQL: the pool or one connection inside a transaction
type PoolClient = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };

/**
 * Declarative definitions of the admin-managed datasets (Zoo Updates, Ticket Prices, Announcements,
 * Events). One definition drives validation, listing (search, filter, pagination), create/update,
 * publication status, CSV import/export and auditing, so every dataset behaves the same way.
 * Table and column names come only from these definitions, never from the request.
 */
export type FieldType = "text" | "longtext" | "enum" | "date" | "datetime" | "number" | "int" | "bool" | "url";
export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  min?: number;
  options?: string[];
  default?: unknown;
  help?: string;
  /** Not editable (set by the server) */
  readOnly?: boolean;
};
export type Row = Record<string, unknown>;
export type DatasetDef = {
  id: string;
  table: string;
  label: string;
  fields: Field[];
  search: string[];
  orderBy: string;
  statuses: string[];
  /** Fills derived columns and checks rules that span fields; returns an error message or null */
  prepare?: (row: Row, existing: Row | null) => string | null;
  /** Columns the table has besides the fields (kept in exports) */
  extraColumns?: string[];
};

export class ValidationError extends Error {
  constructor(message: string, public readonly line?: number) { super(message); }
}

// Manila time is used when a date-time is given without a time zone (Philippines has no DST)
function parseDateTime(v: string): Date | null {
  const s = v.trim().replace(" ", "T");
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : /^\d{4}-\d\d-\d\d$/.test(s) ? `${s}T00:00:00+08:00` : `${s}+08:00`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Converts one input value to the column's type, or throws a ValidationError naming the field. */
export function normalizeValue(field: Field, raw: unknown): unknown {
  const empty = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
  if (empty) {
    if (field.required) throw new ValidationError(`${field.label} is required`);
    return field.type === "bool" ? (field.default ?? false) : null;
  }
  const s = typeof raw === "string" ? raw.trim() : raw;
  switch (field.type) {
    case "text": case "longtext": case "url": {
      const text = String(s);
      const max = field.max ?? (field.type === "longtext" ? 5000 : 300);
      if (text.length > max) throw new ValidationError(`${field.label} must be at most ${max} characters`);
      if (field.type === "url" && !/^(https?:\/\/|\/)[^\s]+$/i.test(text)) throw new ValidationError(`${field.label} must be a web address starting with https://`);
      return text;
    }
    case "enum": {
      const v = String(s).toLowerCase();
      const hit = field.options!.find(o => o.toLowerCase() === v);
      if (!hit) throw new ValidationError(`${field.label} must be one of: ${field.options!.join(", ")}`);
      return hit;
    }
    case "date": {
      const v = String(s);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())) throw new ValidationError(`${field.label} must be a date like 2026-10-21`);
      return v;
    }
    case "datetime": {
      const d = s instanceof Date ? s : parseDateTime(String(s));
      if (!d) throw new ValidationError(`${field.label} must be a date and time like 2026-10-21 09:00`);
      return d.toISOString();
    }
    case "number": case "int": {
      const n = typeof s === "number" ? s : Number(String(s).replace(/[₱,\s]/g, ""));
      if (!Number.isFinite(n)) throw new ValidationError(`${field.label} must be a number`);
      if (field.type === "int" && !Number.isInteger(n)) throw new ValidationError(`${field.label} must be a whole number`);
      if (field.min != null && n < field.min) throw new ValidationError(`${field.label} can't be less than ${field.min}`);
      if (field.max != null && n > field.max) throw new ValidationError(`${field.label} can't be more than ${field.max}`);
      return n;
    }
    case "bool": {
      if (typeof s === "boolean") return s;
      const v = String(s).toLowerCase();
      if (["true", "yes", "1", "y", "oo"].includes(v)) return true;
      if (["false", "no", "0", "n", "hindi"].includes(v)) return false;
      throw new ValidationError(`${field.label} must be yes or no`);
    }
  }
}

const editable = (def: DatasetDef) => def.fields.filter(f => !f.readOnly);

/**
 * Validates a full row (create) or a partial one (update, merged with the existing row).
 * Returns only the columns to write.
 */
export function validateRow(def: DatasetDef, input: Row, existing: Row | null): Row {
  const out: Row = {};
  for (const f of editable(def)) {
    const provided = Object.prototype.hasOwnProperty.call(input, f.name);
    if (!provided && existing) continue;
    out[f.name] = normalizeValue(f, provided ? input[f.name] : f.default);
  }
  // Stored timestamps come back as Date objects; compare everything as ISO text
  const stored = Object.fromEntries(Object.entries(existing ?? {}).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]));
  const merged: Row = { ...stored, ...out };
  const problem = def.prepare?.(merged, existing);
  if (problem) throw new ValidationError(problem);
  // prepare() may fill derived columns (published_at, is_active…); carry them into the write
  for (const [k, v] of Object.entries(merged)) {
    if (!(k in out) && (!existing || stored[k] !== v) && k !== "id" && k !== "created_at") out[k] = v;
  }
  return out;
}

const q = (name: string) => `"${name.replace(/"/g, "")}"`;

export async function listRows(def: DatasetDef, opts: { search?: string; status?: string; page?: number; pageSize?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.search?.trim()) {
    params.push(`%${opts.search.trim()}%`);
    where.push(`(${def.search.map(c => `${q(c)}::text ILIKE $${params.length}`).join(" OR ")})`);
  }
  if (opts.status && def.statuses.includes(opts.status)) {
    params.push(opts.status);
    where.push(`status = $${params.length}`);
  }
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const page = Math.max(1, opts.page ?? 1);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows: [{ count }] } = await pool.query(`SELECT count(*)::int AS count FROM ${q(def.table)} ${clause}`, params);
  const { rows } = await pool.query(
    `SELECT * FROM ${q(def.table)} ${clause} ORDER BY ${def.orderBy} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
  return { rows, total: count as number, page, page_size: pageSize };
}

export async function getRow(def: DatasetDef, id: number, client: PoolClient | typeof pool = pool): Promise<Row | null> {
  const { rows } = await client.query(`SELECT * FROM ${q(def.table)} WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * Date-times are sent to Postgres as Date objects: the driver adds the +08:00 offset (the API runs in
 * Manila time, see index.ts), which timestamptz columns store exactly and the older "timestamp"
 * columns (events, announcements) keep as Manila wall-clock time. An ISO string ending in Z would
 * be stored 8 hours early in those older columns.
 */
function toDb(def: DatasetDef, values: Row): Row {
  const out: Row = { ...values };
  for (const f of def.fields) if (f.type === "datetime" && typeof out[f.name] === "string") out[f.name] = new Date(String(out[f.name]));
  return out;
}

export async function insertRow(def: DatasetDef, input: Row, actorEmail: string | null, client: PoolClient | typeof pool = pool): Promise<Row> {
  const values = toDb(def, input);
  const cols = Object.keys(values);
  const all = [...cols, "created_by", "updated_by"];
  const { rows } = await client.query(
    `INSERT INTO ${q(def.table)} (${all.map(q).join(", ")}) VALUES (${all.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
    [...cols.map(c => values[c]), actorEmail, actorEmail]);
  return rows[0];
}

export async function updateRow(def: DatasetDef, id: number, input: Row, actorEmail: string | null, client: PoolClient | typeof pool = pool): Promise<Row | null> {
  const values = toDb(def, input);
  const cols = Object.keys(values);
  const sets = [...cols.map((c, i) => `${q(c)} = $${i + 1}`), `updated_by = $${cols.length + 1}`, "updated_at = now()"];
  const { rows } = await client.query(
    `UPDATE ${q(def.table)} SET ${sets.join(", ")} WHERE id = $${cols.length + 2} RETURNING *`,
    [...cols.map(c => values[c]), actorEmail, id]);
  return rows[0] ?? null;
}

/** Postgres errors that are the user's fault, as a readable message (else null). */
export function friendlyDbError(err: unknown): string | null {
  const e = err as { code?: string; detail?: string; constraint?: string };
  if (e.code === "23505") return "A record with the same details already exists (duplicate).";
  if (e.code === "23514") return `The values break a rule (${e.constraint ?? "check"}). Check dates, prices and required details.`;
  if (e.code === "23503") return "This record is linked to another record that doesn't exist or still uses it.";
  if (e.code === "22P02" || e.code === "22007" || e.code === "22008") return "One of the values has the wrong format.";
  return null;
}

// ─── The datasets ─────────────────────────────────────────────────────────────

const STATUS3 = ["draft", "published", "archived"];
const nowIso = () => new Date().toISOString();

export const DATASETS: Record<string, DatasetDef> = {
  zoo_updates: {
    id: "zoo_updates", table: "zoo_updates", label: "Zoo Updates",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200 },
      { name: "description", label: "Description", type: "longtext", required: true, max: 5000 },
      { name: "category", label: "Category", type: "enum", options: ["general", "animals", "facilities", "schedule", "conservation", "advisory"], default: "general" },
      { name: "status", label: "Status", type: "enum", options: STATUS3, default: "draft" },
      { name: "published_at", label: "Date published", type: "datetime", help: "Set automatically when first published" },
    ],
    search: ["title", "description", "category"],
    orderBy: "coalesce(published_at, created_at) DESC, id DESC",
    statuses: STATUS3,
    extraColumns: ["created_at", "updated_at", "created_by", "updated_by"],
    prepare: row => {
      if (row["status"] === "published" && !row["published_at"]) row["published_at"] = nowIso();
      return null;
    },
  },

  ticket_prices: {
    id: "ticket_prices", table: "ticket_prices", label: "Ticket Prices",
    fields: [
      { name: "category", label: "Ticket category", type: "text", required: true, max: 200, help: "e.g. Adults and children 3 years old and above" },
      { name: "visitor_type", label: "Visitor type", type: "enum", options: ["Manila resident", "Non-Manila resident", "All visitors"], default: "All visitors" },
      { name: "price", label: "Price (₱)", type: "number", min: 0, max: 100000 },
      { name: "is_free", label: "Free admission", type: "bool", default: false },
      { name: "effective_date", label: "Effective date", type: "date" },
      { name: "valid_until", label: "Valid until", type: "date" },
      { name: "status", label: "Status", type: "enum", options: STATUS3, default: "draft" },
      { name: "is_verified", label: "Verified official price", type: "bool", default: false },
      { name: "source_reference", label: "Source / verification reference", type: "text", max: 500, help: "Where the price was confirmed, e.g. the official Manila Zoo website or a zoo signboard" },
      { name: "verified_at", label: "Last verified", type: "date" },
      { name: "notes", label: "Notes", type: "longtext", max: 1000 },
      { name: "sort_order", label: "Display order", type: "int", min: 0, max: 1000, default: 0 },
    ],
    search: ["category", "visitor_type", "source_reference", "notes"],
    orderBy: "sort_order, category, visitor_type",
    statuses: STATUS3,
    extraColumns: ["created_at", "updated_at", "created_by", "updated_by"],
    prepare: row => {
      if (row["is_free"] && row["price"] != null && Number(row["price"]) !== 0) return "A free ticket can't also have a price";
      if (row["is_free"]) row["price"] = null;
      if (!row["is_free"] && row["price"] == null && row["is_verified"]) return "A verified price needs an amount (or mark it as free)";
      if (row["is_verified"] && (!row["source_reference"] || !row["verified_at"])) return "A verified price needs its source and the date it was verified";
      if (row["verified_at"] && String(row["verified_at"]) > new Date().toISOString().slice(0, 10)) return "The verification date can't be in the future";
      if (row["status"] === "published" && !row["is_verified"]) return "Only verified prices can be published. Confirm the price with an official source first.";
      if (row["valid_until"] && row["effective_date"] && String(row["valid_until"]) < String(row["effective_date"])) return "Valid until must be on or after the effective date";
      return null;
    },
  },

  announcements: {
    id: "announcements", table: "announcements", label: "Announcements",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200 },
      { name: "content", label: "Message", type: "longtext", required: true, max: 2000 },
      { name: "type", label: "Type", type: "enum", options: ["info", "advisory", "closure", "safety", "event"], default: "info" },
      { name: "priority", label: "Priority", type: "enum", options: ["low", "normal", "high", "urgent"], default: "normal" },
      { name: "status", label: "Status", type: "enum", options: STATUS3, default: "draft" },
      { name: "publish_at", label: "Publish on", type: "datetime", help: "Leave empty to publish right away" },
      { name: "expires_at", label: "Expires on", type: "datetime", help: "Hidden automatically after this; leave empty to keep it" },
    ],
    search: ["title", "content", "type"],
    orderBy: "CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, created_at DESC",
    statuses: STATUS3,
    extraColumns: ["is_active", "created_at", "updated_at", "created_by", "updated_by"],
    prepare: row => {
      if (row["publish_at"] && row["expires_at"] && String(row["expires_at"]) <= String(row["publish_at"])) return "Expires on must be after Publish on";
      if (row["status"] === "published" && row["expires_at"] && new Date(String(row["expires_at"])) <= new Date()) return "This announcement has already expired; change Expires on before publishing";
      row["is_active"] = row["status"] === "published";
      return null;
    },
  },

  events: {
    id: "events", table: "events", label: "Events",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 200 },
      { name: "description", label: "Description", type: "longtext", max: 3000 },
      { name: "start_date", label: "Starts", type: "datetime", required: true },
      { name: "end_date", label: "Ends", type: "datetime" },
      { name: "location", label: "Location (text)", type: "text", max: 200, help: "Where in the zoo, e.g. Plaza area" },
      { name: "pin_id", label: "Map place", type: "int", min: 1, help: "Shows the event on that place on the map" },
      { name: "image_url", label: "Image link", type: "url", max: 1000 },
      { name: "status", label: "Status", type: "enum", options: ["draft", "published", "cancelled", "archived"], default: "draft" },
      { name: "publish_at", label: "Publish on", type: "datetime", help: "Leave empty to publish right away" },
    ],
    search: ["title", "description", "location"],
    orderBy: "start_date DESC NULLS LAST",
    statuses: ["draft", "published", "cancelled", "archived"],
    extraColumns: ["is_active", "created_at", "updated_at", "created_by", "updated_by"],
    prepare: row => {
      if (row["end_date"] && row["start_date"] && String(row["end_date"]) < String(row["start_date"])) return "Ends must be after Starts";
      // Visitors see published events, and cancelled ones (marked as cancelled)
      row["is_active"] = row["status"] === "published" || row["status"] === "cancelled";
      return null;
    },
  },
};

/** Columns written by export and accepted by import, in order. */
export const exportColumns = (def: DatasetDef) => ["id", ...def.fields.map(f => f.name), ...(def.extraColumns ?? [])];
