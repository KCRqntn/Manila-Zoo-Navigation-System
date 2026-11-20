import { randomInt } from "node:crypto";
import { Router, type Request } from "express";
import { pool } from "@workspace/db";
import { STAFF_ROLES, requirePermission, verifiedUser } from "../middleware/access";
import { supabase } from "../lib/supabase";
import { audit, actorFrom, auditReq } from "../lib/audit";
import { toCsv } from "../lib/csv";

/**
 * Visitor accounts and visits (the website QR code opens the Visitor Registration page).
 *   Public:  POST /visitor/first-visit     create a visitor account, its profile and the first visit
 *   Visitor: GET  /visitor/me              the signed-in visitor's profile and visit history
 *            POST /visitor/visits          register a new visit (a new group) for the signed-in visitor
 *   Admin:   GET  /admin/visitor-registrations/stats, /admin/visitor-registrations, CSV export
 *            POST /admin/visitor-accounts/:userId/reset-password   temporary password for a visitor who forgot theirs
 *
 * Visitors are counted only from saved visits. Each visit (visitor_registrations) has its own id,
 * date, group size and group members (visitor_group_members): one row per person with an age, one
 * age category (child / adult / senior) and a PWD flag, so PWD overlaps the age categories without
 * counting anyone twice; the members must add up to the group size (checked here and by the
 * database at commit). Logging in counts nothing. Visits are never overwritten; each new visit is a
 * new row with the next visit number for that account.
 * Repeats can't add to the numbers: the browser sends the same visit id on every retry, the id is
 * the primary key, and the same account sending the same group again within 30 minutes is treated
 * as the visit already saved.
 * One count per person per visit day: the registered visitor, and any companion linked to their own
 * visitor account (by that person's email + Visitor ID), can be counted at most once a day, whoever
 * registers them. A database unique index enforces this even for simultaneous requests; the visitor
 * gets a message saying who already counted them. Companions without an account are counted with the
 * visit that lists them (they can't be matched reliably, so they are never merged automatically).
 * Account creation, visits, linked companions, profile changes and duplicate attempts are written to
 * the audit log (never passwords or tokens).
 */
const router = Router();

export const PRIVACY_VERSION = "2026-10-27";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Age categories: children are under 18; senior citizens are 60 and over (Republic Act 9994) */
export const CATEGORIES = { child: { min: 0, max: 17 }, adult: { min: 18, max: 59 }, senior: { min: 60, max: 120 } } as const;
type Category = keyof typeof CATEGORIES;

/** A Philippine mobile number in the form +639XXXXXXXXX ("0917 123 4567", "+63 917-123-4567", "9171234567"), or null */
export function normalizePhPhone(input: string): string | null {
  const digits = input.replace(/[\s().-]/g, "");
  const m = digits.match(/^(?:\+?63|0)?(9\d{9})$/);
  return m ? `+63${m[1]}` : null;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN);

/** link: a companion who has their own visitor account, identified by their email + Visitor ID */
type Member = { age: number; category: Category; is_pwd: boolean; is_registrant: boolean; link: { email: string; code: string } | null };
type Profile = { full_name: string; email: string; phone: string; age: number; sex: "male" | "female" };
type Visit = { id: string; party_size: number; members: Member[]; pwd_consent: boolean };
type Errors = Record<string, string>;
/** A connection inside a transaction (pool.connect() result) */
type PoolClient = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** Checks the person registering (name, email, phone, age, sex) */
function readProfile(b: Record<string, unknown>, errors: Errors, email?: string): Profile {
  const p = {
    full_name: str(b["full_name"], 120).replace(/\s+/g, " "),
    email: (email ?? str(b["email"], 200)).toLowerCase(),
    phone: normalizePhPhone(str(b["phone"], 30)) ?? "",
    age: int(b["age"]),
    sex: (b["sex"] === "male" || b["sex"] === "female" ? b["sex"] : "") as Profile["sex"],
  };
  if (p.full_name.length < 2 || !/\p{L}/u.test(p.full_name)) errors["full_name"] = "Enter your full name.";
  if (!EMAIL.test(p.email)) errors["email"] = "Enter a valid email address.";
  if (!p.phone) errors["phone"] = "Enter a valid Philippine mobile number, e.g. 0917 123 4567.";
  if (!Number.isInteger(p.age) || p.age < 1 || p.age > 120) errors["age"] = "Enter an age from 1 to 120.";
  if (!p.sex) errors["sex"] = "Choose Male or Female.";
  return p;
}

/** Checks a visit: its id, group size and one entry per person (the registrant included, once) */
function readVisit(b: Record<string, unknown>, registrantAge: number, errors: Errors): Visit {
  const v = { id: str(b["visit_id"] ?? b["registration_id"], 36).toLowerCase(), party_size: int(b["party_size"]), pwd_consent: b["pwd_consent"] === true };
  if (!UUID.test(v.id)) errors["visit_id"] = "The form expired. Reload the page and try again.";
  if (!Number.isInteger(v.party_size) || v.party_size < 1 || v.party_size > 500) errors["party_size"] = "Enter the number of visitors in your group, from 1 to 500.";
  if (b["consent"] !== true) errors["consent"] = "Please agree to the privacy notice to register.";
  const raw: unknown[] = Array.isArray(b["members"]) ? (b["members"] as unknown[]).slice(0, 501) : [];
  const members: Member[] = raw.map(m => {
    const o = (m ?? {}) as Record<string, unknown>;
    const l = (o["link"] ?? null) as Record<string, unknown> | null;
    const link = l && typeof l === "object" && (str(l["email"], 200) || str(l["code"], 20))
      ? { email: str(l["email"], 200).toLowerCase(), code: str(l["code"], 20).toUpperCase().replace(/\s+/g, "") } : null;
    return { age: int(o["age"]), category: o["category"] as Category, is_pwd: o["is_pwd"] === true, is_registrant: o["is_registrant"] === true, link };
  });
  const bad = members.findIndex(m => !(m.category in CATEGORIES) || !Number.isInteger(m.age) || m.age < CATEGORIES[m.category].min || m.age > CATEGORIES[m.category].max);
  if (bad >= 0) {
    const m = members[bad]!;
    const label = m.category === "child" ? "a child (under 18)" : m.category === "adult" ? "an adult (18 to 59)" : m.category === "senior" ? "a senior citizen (60 or older)" : "a valid category";
    errors["members"] = `Person ${bad + 1}: the age doesn't fit ${label}.`;
  } else if (Number.isInteger(v.party_size) && members.length !== v.party_size) {
    errors["members"] = `The people listed (${members.length}) must match the number of visitors (${v.party_size}).`;
  } else {
    const registrants = members.filter(m => m.is_registrant);
    if (registrants.length !== 1 || registrants[0]!.age !== registrantAge) errors["members"] = "Include yourself once in the group, with your age.";
  }
  if (members.some(m => m.is_pwd) && !v.pwd_consent) errors["pwd_consent"] = "Please agree to recording PWD status, or don't mark anyone as a PWD.";
  const linked = members.filter(m => m.link);
  if (members.some(m => m.is_registrant && m.link)) errors["members"] = "You are included automatically; don't link your own account.";
  else if (linked.length > 20) errors["members"] = "Link at most 20 companion accounts per visit.";
  else if (linked.some(m => !EMAIL.test(m.link!.email) || !/^MZV-[0-9A-F]{6}$/.test(m.link!.code))) errors["members"] = "Each linked companion needs their email and Visitor ID (MZV-…).";
  return { ...v, members };
}

const bad = (errors: Errors) => ({ error: Object.values(errors).join(" "), fields: errors });

/** A visit that can't be saved as sent; answered with this status, message and code */
class VisitRefused extends Error {
  constructor(readonly status: number, message: string, readonly code: string, readonly context: Record<string, unknown> = {}) { super(message); }
}
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const TODAY = "(now() AT TIME ZONE 'Asia/Manila')::date";

/**
 * Inside the saving transaction: finds the account of each linked companion (email and Visitor ID
 * must both match) and checks that nobody with an account is already counted today. Returns the
 * account id for each person (null for people without a linked account; the registrant is filled in
 * by the database).
 */
async function attendance(c: PoolClient, registrantId: string, v: Visit): Promise<(string | null)[]> {
  const ids: (string | null)[] = [];
  let n = 0;
  for (const m of v.members) {
    if (!m.link) { ids.push(null); continue; }
    n++;
    const { rows: [acc] } = await c.query(
      "SELECT user_id, full_name FROM visitor_profiles WHERE lower(email) = $1 AND upper(visitor_code) = $2", [m.link.email, m.link.code]);
    if (!acc) throw new VisitRefused(400, `Linked companion ${n}: no visitor account matches that email and Visitor ID. Check both with your companion, or add them without linking.`, "link_not_found");
    if (acc.user_id === registrantId) throw new VisitRefused(400, "You are included automatically; don't link your own account.", "link_self");
    if (ids.includes(acc.user_id)) throw new VisitRefused(400, `${firstName(acc.full_name)} is linked twice. Each person can be listed once.`, "link_twice");
    ids.push(acc.user_id);
  }
  const accounts = [registrantId, ...ids.filter((x): x is string => !!x)];
  const { rows: counted } = await c.query(
    `SELECT m.user_id, p.full_name AS person, r.user_id AS by_user, r.full_name AS by_name, r.visit_no
       FROM visitor_group_members m JOIN visitor_registrations r ON r.id = m.registration_id
       LEFT JOIN visitor_profiles p ON p.user_id = m.user_id
      WHERE m.user_id = ANY($1::uuid[]) AND m.visit_date = ${TODAY}`, [accounts]);
  const self = counted.find(x => x.user_id === registrantId);
  if (self && self.by_user === registrantId) {
    throw new VisitRefused(409, `You already registered today's visit (visit #${self.visit_no}). Each person is counted once per visit day. If your group changed, please ask zoo staff at the entrance.`, "already_registered_today", { visit_no: self.visit_no });
  }
  if (self) {
    throw new VisitRefused(409, `You're already counted today: ${firstName(self.by_name)} included you in their group. There's no need to register again; enjoy the zoo!`, "included_by_other");
  }
  if (counted.length) {
    const x = counted[0]!;
    throw new VisitRefused(409, `${firstName(x.person ?? "This companion")} is already counted today (in ${x.by_user === x.user_id ? "their own" : `${firstName(x.by_name)}'s`} visit). Remove them from your group; each person is counted once per visit day.`, "companion_already_counted");
  }
  return ids;
}
/** The database refused a second count of the same account on the same day (two requests at once) */
const countedTwice = (err: unknown) => (err as { constraint?: string }).constraint === "visitor_group_members_one_per_day";
const COUNTED_TWICE = "Someone in this group was just counted in another registration for today. Each person is counted once per visit day; check with your group, or ask zoo staff.";
const groupKey = (members: Member[]) => members.map(m => `${m.age}${m.is_pwd ? "p" : ""}`).sort().join(",");

/** Saves one visit and its people inside the caller's transaction; returns null if this visit id was already saved */
async function insertVisit(c: PoolClient, userId: string, p: Profile, v: Visit, accounts: (string | null)[]) {
  // The account's next visit number (the profile row is locked so two visits can't take the same number)
  await c.query("SELECT 1 FROM visitor_profiles WHERE user_id = $1 FOR UPDATE", [userId]);
  const { rows: [{ next }] } = await c.query("SELECT coalesce(max(visit_no), 0) + 1 AS next FROM visitor_registrations WHERE user_id = $1", [userId]);
  const { rows } = await c.query(
    `INSERT INTO visitor_registrations (id, user_id, visit_no, full_name, email, phone, age, sex, party_size, consent_at, privacy_version, pwd_consent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10, CASE WHEN $11 THEN now() END)
     ON CONFLICT (id) DO NOTHING
     RETURNING id, visit_no, party_size, created_at`,
    [v.id, userId, next, p.full_name, p.email, p.phone, p.age, p.sex, v.party_size, PRIVACY_VERSION, v.members.some(m => m.is_pwd)]);
  if (!rows[0]) return null;
  await c.query(
    `INSERT INTO visitor_group_members (registration_id, member_no, age, age_category, is_pwd, is_registrant, user_id)
     SELECT $1, n, age, category, pwd, registrant, account
       FROM unnest($2::int[], $3::text[], $4::bool[], $5::bool[], $6::uuid[]) WITH ORDINALITY AS m(age, category, pwd, registrant, account, n)`,
    [v.id, v.members.map(m => m.age), v.members.map(m => m.category), v.members.map(m => m.is_pwd), v.members.map(m => m.is_registrant), accounts]);
  return rows[0] as { id: string; visit_no: number; party_size: number; created_at: Date };
}

const visitById = async (id: string) =>
  (await pool.query("SELECT id, user_id, visit_no, party_size, created_at FROM visitor_registrations WHERE id = $1", [id])).rows[0] as
    { id: string; user_id: string | null; visit_no: number | null; party_size: number; created_at: Date } | undefined;

/** The same account sending the same group again shortly after (another tab, the back button) */
async function recentSameGroup(userId: string, v: Visit) {
  const { rows } = await pool.query(
    `SELECT r.id, r.visit_no, r.party_size, r.created_at,
            (SELECT string_agg(m.age::text || CASE WHEN m.is_pwd THEN 'p' ELSE '' END, ',' ORDER BY m.age::text || CASE WHEN m.is_pwd THEN 'p' ELSE '' END)
               FROM visitor_group_members m WHERE m.registration_id = r.id) AS group_key
       FROM visitor_registrations r
      WHERE r.user_id = $1 AND r.party_size = $2 AND r.created_at > now() - interval '30 minutes'`, [userId, v.party_size]);
  return rows.find(r => r.group_key === groupKey(v.members));
}

// Limits per address per hour, so accounts and counts can't be inflated by spam. Generous, because a
// whole group on the same Wi-Fi or mobile network can share one public address
const recent = new Map<string, number[]>();
function overLimit(req: Request, kind: string, max: number): boolean {
  const key = `${kind}:${req.ip ?? "unknown"}`;
  const times = (recent.get(key) ?? []).filter(t => Date.now() - t < 3600_000);
  recent.set(key, times);
  return times.length >= max;
}
const noteUse = (req: Request, kind: string) => recent.get(`${kind}:${req.ip ?? "unknown"}`)?.push(Date.now());

type VisitRow = { id: string; visit_no: number | null; party_size: number; created_at: Date };
const visitAnswer = (row: VisitRow, duplicate: boolean) => ({ ok: true, duplicate, visit_id: row.id, visit_no: row.visit_no, party_size: row.party_size, registered_at: row.created_at });

/** Audit records for a saved visit and each linked companion */
async function auditVisit(actor: ReturnType<typeof actorFrom>, row: VisitRow, v: Visit, accounts: (string | null)[], req: Request) {
  const linked = accounts.filter((x): x is string => !!x);
  await audit(actor, { action: "visitor.visit_created", resource: "visitor_registrations", recordId: row.id,
    context: { visit_no: row.visit_no, party_size: row.party_size, companions: row.party_size - 1, linked_companions: linked.length } }, req);
  for (const id of linked) await audit(actor, { action: "visitor.companion_linked", resource: "visitor_group_members", recordId: id, context: { visit_id: row.id } }, req);
}
/** Answers a refused visit (already counted today, a link that doesn't match) and records the attempt */
async function refuse(req: Request, res: import("express").Response, actor: ReturnType<typeof actorFrom>, err: unknown) {
  const r = err instanceof VisitRefused ? err : new VisitRefused(409, COUNTED_TWICE, "counted_twice");
  await audit(actor, { action: r.status === 409 ? "visitor.duplicate_visit" : "visitor.visit_refused", resource: "visitor_registrations", result: "failure", context: { reason: r.code, ...r.context } }, req);
  res.status(r.status).json({ error: r.message, code: r.code });
}

// ─── First visit: account + profile + visit ───────────────────────────────────

router.post("/visitor/first-visit", async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  // Hidden field real visitors never fill (bots do): accepted, not saved, never counted
  if (str(b["website"], 100)) { res.status(201).json({ ok: true }); return; }
  const errors: Errors = {};
  const profile = readProfile(b, errors);
  const password = typeof b["password"] === "string" ? b["password"] : "";
  if (password.length < 8 || password.length > 72) errors["password"] = "Choose a password of at least 8 characters.";
  const visit = readVisit(b, profile.age, errors);
  if (Object.keys(errors).length) { res.status(400).json(bad(errors)); return; }

  // A retry of a first visit already saved: report it, count nothing new
  const saved = await visitById(visit.id);
  if (saved) { res.status(200).json(visitAnswer(saved, true)); return; }
  if (overLimit(req, "account", 100)) { res.status(429).json({ error: "Too many registrations from this device. Please ask zoo staff for help." }); return; }

  // The account is created confirmed, so the visitor can log in on their next visit without
  // waiting for an email at the zoo gate. Accounts are made here (server side) only.
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: profile.email, password, email_confirm: true, user_metadata: { full_name: profile.full_name },
  });
  if (createError || !created.user) {
    if (/already|registered|exists/i.test(createError?.message ?? "")) {
      // The same request may have just been saved by a parallel try
      await new Promise(r => setTimeout(r, 1500));
      const parallel = await visitById(visit.id);
      if (parallel) { res.status(200).json(visitAnswer(parallel, true)); return; }
      res.status(409).json({ error: "An account with this email already exists. Log in to register your visit.", code: "account_exists" });
      return;
    }
    throw createError ?? new Error("Couldn't create the account");
  }
  const userId = created.user.id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO visitor_profiles (user_id, full_name, email, phone, age, sex, consent_at, privacy_version)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7)`,
      [userId, profile.full_name, profile.email, profile.phone, profile.age, profile.sex, PRIVACY_VERSION]);
    const accounts = await attendance(client, userId, visit);
    const row = await insertVisit(client, userId, profile, visit, accounts);
    await client.query("COMMIT");  // the database checks here that the members add up to the group size
    noteUse(req, "account");
    const actor = actorFrom(created.user);
    await audit(actor, { action: "visitor.account_created", resource: "visitor_profiles", recordId: userId }, req);
    await auditVisit(actor, row!, visit, accounts, req);
    res.status(201).json(visitAnswer(row!, false));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // Nothing was saved, so the new account is removed too: the visitor can simply try again
    await supabase.auth.admin.deleteUser(userId).catch(() => {});
    if (err instanceof VisitRefused || countedTwice(err)) { await refuse(req, res, actorFrom(created.user), err); return; }
    if ((err as { code?: string }).code === "23505") { res.status(409).json({ error: "An account with this email already exists. Log in to register your visit.", code: "account_exists" }); return; }
    if ((err as { code?: string }).code === "23514") { res.status(400).json({ error: "Some details aren't valid. Check the form and try again." }); return; }
    throw err;
  } finally {
    client.release();
  }
});

// ─── Returning visitors (signed in) ───────────────────────────────────────────

/** The signed-in visitor's profile (null until they complete it) and their visit history */
router.get("/visitor/me", async (req, res): Promise<void> => {
  const user = await verifiedUser(req);
  if (!user) { res.status(401).json({ error: "Please log in." }); return; }
  const { rows: [profile] } = await pool.query("SELECT full_name, email, phone, age, sex, visitor_code, created_at FROM visitor_profiles WHERE user_id = $1", [user.id]);
  const { rows: visits } = await pool.query(
    "SELECT visit_no, party_size, visit_date, created_at FROM visitor_registrations WHERE user_id = $1 ORDER BY visit_no DESC LIMIT 20", [user.id]);
  res.json({ email: user.email ?? null, profile: profile ?? null, visits, full_name_hint: (user.user_metadata?.["full_name"] as string | undefined) ?? null });
});

/** A new visit for the signed-in visitor: a new group, saved as a new visit record */
router.post("/visitor/visits", async (req, res): Promise<void> => {
  const user = await verifiedUser(req);
  if (!user) { res.status(401).json({ error: "Please log in again." }); return; }
  // Staff accounts are not visitors: they never get a visitor profile or count as a visit
  if ((STAFF_ROLES as readonly string[]).includes(String(user.app_metadata?.["role"] ?? ""))) {
    res.status(403).json({ error: "This is a staff account. Staff don't register visits; open the Admin Dashboard instead.", code: "staff_account" });
    return;
  }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const errors: Errors = {};
  const { rows: [existing] } = await pool.query("SELECT full_name, email, phone, age, sex FROM visitor_profiles WHERE user_id = $1", [user.id]);
  // Accounts made on the website's sign-up page complete their visitor profile once, here
  const profile: Profile = existing
    ? { ...existing, age: b["age"] === undefined ? existing.age : int(b["age"]) }
    : readProfile(b, errors, user.email ?? "");
  if (existing && (!Number.isInteger(profile.age) || profile.age < 1 || profile.age > 120)) errors["age"] = "Enter your age today, from 1 to 120.";
  const visit = readVisit(b, profile.age, errors);
  if (Object.keys(errors).length) { res.status(400).json(bad(errors)); return; }

  const saved = await visitById(visit.id);
  if (saved) {
    if (saved.user_id !== user.id) { res.status(409).json({ error: "This form was already used. Reload the page and try again." }); return; }
    res.status(200).json(visitAnswer(saved, true)); return;
  }
  const again = existing && await recentSameGroup(user.id, visit);
  if (again) {
    await audit(actorFrom(user), { action: "visitor.duplicate_visit", resource: "visitor_registrations", recordId: again.id, result: "failure", context: { reason: "same group sent again within 30 minutes" } }, req);
    res.status(200).json(visitAnswer(again, true)); return;
  }
  if (overLimit(req, "visit", 200)) { res.status(429).json({ error: "Too many registrations from this device. Please ask zoo staff for help." }); return; }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (!existing) {
      await client.query(
        `INSERT INTO visitor_profiles (user_id, full_name, email, phone, age, sex, consent_at, privacy_version)
         VALUES ($1, $2, $3, $4, $5, $6, now(), $7)`,
        [user.id, profile.full_name, profile.email, profile.phone, profile.age, profile.sex, PRIVACY_VERSION]);
    } else if (profile.age !== existing.age) {
      await client.query("UPDATE visitor_profiles SET age = $2, updated_at = now() WHERE user_id = $1", [user.id, profile.age]);
    }
    const accounts = await attendance(client, user.id, visit);
    const row = await insertVisit(client, user.id, profile, visit, accounts);
    if (!row) { await client.query("ROLLBACK"); const s = await visitById(visit.id); res.status(200).json(visitAnswer(s!, true)); return; }
    await client.query("COMMIT");  // the database checks here that the members add up to the group size
    noteUse(req, "visit");
    const actor = actorFrom(user);
    if (!existing) await audit(actor, { action: "visitor.profile_created", resource: "visitor_profiles", recordId: user.id }, req);
    else if (profile.age !== existing.age) await audit(actor, { action: "visitor.profile_updated", resource: "visitor_profiles", recordId: user.id, before: { age: existing.age }, after: { age: profile.age } }, req);
    await auditVisit(actor, row, visit, accounts, req);
    res.status(201).json(visitAnswer(row, false));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err instanceof VisitRefused || countedTwice(err)) { await refuse(req, res, actorFrom(user), err); return; }
    if ((err as { code?: string }).code === "23505") { res.status(409).json({ error: "This email is already used by another visitor account." }); return; }
    if ((err as { code?: string }).code === "23514") { res.status(400).json({ error: "Some details aren't valid. Check the form and try again." }); return; }
    throw err;
  } finally {
    client.release();
  }
});

// ─── Admin ────────────────────────────────────────────────────────────────────

const AGE_GROUPS = [
  { label: "0–4", min: 0, max: 4 }, { label: "5–12", min: 5, max: 12 }, { label: "13–17", min: 13, max: 17 },
  { label: "18–24", min: 18, max: 24 }, { label: "25–34", min: 25, max: 34 }, { label: "35–44", min: 35, max: 44 },
  { label: "45–59", min: 45, max: 59 }, { label: "60–69", min: 60, max: 69 }, { label: "70+", min: 70, max: 200 },
];

/**
 * Visitor numbers, all from saved visits. A "person-visit" is one person on one visit: the same
 * visitor coming three times counts in three visits. Children, adults and senior citizens add up to
 * the person-visits; PWD is counted alongside them (a senior who is a PWD is in both, once in the total).
 */
router.get("/admin/visitor-registrations/stats", requirePermission("dashboard.read"), async (req, res): Promise<void> => {
  const days = Math.min(365, Math.max(7, Number(req.query["days"]) || 30));
  const today = "(now() AT TIME ZONE 'Asia/Manila')::date";
  const [{ rows: [totals] }, { rows: [todays] }, { rows: [accounts] }, { rows: byDate }, { rows: byWeek }, { rows: byMonth }, { rows: byYear }, { rows: bySex }, { rows: cats }, { rows: ages }, { rows: [unclassified] }] = await Promise.all([
    pool.query("SELECT count(*)::int AS registrations, coalesce(sum(party_size), 0)::int AS people FROM visitor_registrations"),
    pool.query(`SELECT count(*)::int AS registrations, coalesce(sum(party_size), 0)::int AS people FROM visitor_registrations WHERE visit_date = ${today}`),
    pool.query(`SELECT (SELECT count(*)::int FROM visitor_profiles) AS accounts,
                       (SELECT count(*)::int FROM (SELECT user_id FROM visitor_registrations WHERE user_id IS NOT NULL GROUP BY user_id HAVING count(*) > 1) x) AS returning_accounts,
                       (SELECT count(*)::int FROM visitor_registrations WHERE visit_no = 1) AS first_visits,
                       (SELECT count(*)::int FROM visitor_registrations WHERE visit_no > 1) AS return_visits,
                       (SELECT count(*)::int FROM visitor_registrations WHERE user_id IS NULL) AS visits_without_account`),
    pool.query(`SELECT to_char(d, 'YYYY-MM-DD') AS date, count(r.id)::int AS registrations, coalesce(sum(r.party_size), 0)::int AS people
                  FROM generate_series(${today} - ($1::int - 1), ${today}, interval '1 day') AS d
                  LEFT JOIN visitor_registrations r ON r.visit_date = d::date
                 GROUP BY d ORDER BY d`, [days]),
    // Weeks start on Monday (Philippine time)
    pool.query(`SELECT to_char(w, 'YYYY-MM-DD') AS week, count(r.id)::int AS registrations, coalesce(sum(r.party_size), 0)::int AS people
                  FROM generate_series(date_trunc('week', ${today}) - interval '11 weeks', date_trunc('week', ${today}), interval '1 week') AS w
                  LEFT JOIN visitor_registrations r ON date_trunc('week', r.visit_date) = w
                 GROUP BY w ORDER BY w`),
    pool.query(`SELECT to_char(m, 'YYYY-MM') AS month, count(r.id)::int AS registrations, coalesce(sum(r.party_size), 0)::int AS people
                  FROM generate_series(date_trunc('month', ${today}) - interval '11 months', date_trunc('month', ${today}), interval '1 month') AS m
                  LEFT JOIN visitor_registrations r ON date_trunc('month', r.visit_date) = m
                 GROUP BY m ORDER BY m`),
    pool.query(`SELECT extract(year FROM visit_date)::int AS year, count(*)::int AS registrations, coalesce(sum(party_size), 0)::int AS people
                  FROM visitor_registrations GROUP BY 1 ORDER BY 1`),
    pool.query("SELECT sex, count(*)::int AS registrations, sum(party_size)::int AS people FROM visitor_registrations GROUP BY sex"),
    pool.query(`SELECT count(*) FILTER (WHERE age_category = 'child')::int AS children,
                       count(*) FILTER (WHERE age_category = 'adult')::int AS adults,
                       count(*) FILTER (WHERE age_category = 'senior')::int AS seniors,
                       count(*) FILTER (WHERE is_pwd)::int AS pwd,
                       count(*) FILTER (WHERE is_pwd AND age_category = 'child')::int AS pwd_children,
                       count(*) FILTER (WHERE is_pwd AND age_category = 'adult')::int AS pwd_adults,
                       count(*) FILTER (WHERE is_pwd AND age_category = 'senior')::int AS pwd_seniors,
                       count(*) FILTER (WHERE r.visit_date = ${today} AND age_category = 'child')::int AS today_children,
                       count(*) FILTER (WHERE r.visit_date = ${today} AND age_category = 'adult')::int AS today_adults,
                       count(*) FILTER (WHERE r.visit_date = ${today} AND age_category = 'senior')::int AS today_seniors,
                       count(*) FILTER (WHERE r.visit_date = ${today} AND is_pwd)::int AS today_pwd
                  FROM visitor_group_members m JOIN visitor_registrations r ON r.id = m.registration_id`),
    pool.query("SELECT age, count(*)::int AS n FROM visitor_group_members GROUP BY age"),
    // Visits saved before the form asked for group details: their people are in the totals without an age category
    pool.query(`SELECT coalesce(sum(party_size), 0)::int AS people FROM visitor_registrations r
                 WHERE NOT EXISTS (SELECT 1 FROM visitor_group_members m WHERE m.registration_id = r.id)`),
  ]);
  res.json({
    total_registrations: totals.registrations,
    total_people: totals.people,
    today_registrations: todays.registrations,
    today_people: todays.people,
    accounts: accounts.accounts,
    returning_accounts: accounts.returning_accounts,
    // Visits by account: an account's 1st visit vs its 2nd, 3rd… (visits from before accounts have no number)
    first_visits: accounts.first_visits,
    return_visits: accounts.return_visits,
    // Everyone on a visit except the person who registered it
    companions: totals.people - totals.registrations,
    avg_group_size: totals.registrations ? Math.round((totals.people / totals.registrations) * 100) / 100 : 0,
    visits_without_account: accounts.visits_without_account,
    categories: { ...cats[0], unclassified: unclassified.people },
    by_date: byDate,
    by_week: byWeek,
    by_month: byMonth,
    by_year: byYear,
    by_sex: ["male", "female"].map(s => ({ sex: s, registrations: bySex.find(r => r.sex === s)?.registrations ?? 0, people: bySex.find(r => r.sex === s)?.people ?? 0 })),
    by_age: AGE_GROUPS.map(g => ({ group: g.label, people: ages.filter(a => a.age >= g.min && a.age <= g.max).reduce((s, a) => s + a.n, 0) })),
  });
});

function filters(q: Record<string, unknown>) {
  const where: string[] = [], params: unknown[] = [];
  const search = String(q["search"] ?? "").trim();
  if (search) { params.push(`%${search.toLowerCase()}%`); where.push(`(lower(r.full_name) LIKE $${params.length} OR lower(r.email) LIKE $${params.length} OR r.phone LIKE $${params.length})`); }
  for (const [key, op] of [["from", ">="], ["to", "<="]] as const) {
    const v = String(q[key] ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { params.push(v); where.push(`r.visit_date ${op} $${params.length}`); }
  }
  const user = String(q["user_id"] ?? "");
  if (UUID.test(user)) { params.push(user); where.push(`r.user_id = $${params.length}`); }
  return { where: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

// Per-visit group breakdown, for the list and the export
const GROUP_COLUMNS = `
  (SELECT count(*) FROM visitor_group_members m WHERE m.registration_id = r.id AND m.age_category = 'child')::int AS children,
  (SELECT count(*) FROM visitor_group_members m WHERE m.registration_id = r.id AND m.age_category = 'adult')::int AS adults,
  (SELECT count(*) FROM visitor_group_members m WHERE m.registration_id = r.id AND m.age_category = 'senior')::int AS seniors,
  (SELECT count(*) FROM visitor_group_members m WHERE m.registration_id = r.id AND m.is_pwd)::int AS pwd,
  (SELECT string_agg(m.age::text || CASE WHEN m.is_pwd THEN ' (PWD)' ELSE '' END, ', ' ORDER BY m.member_no) FROM visitor_group_members m WHERE m.registration_id = r.id) AS member_ages,
  (SELECT count(*) FROM visitor_registrations o WHERE o.user_id = r.user_id)::int AS account_visits,
  (r.party_size - 1) AS companions`;

router.get("/admin/visitor-registrations", requirePermission("submissions.read"), async (req, res): Promise<void> => {
  const { where, params } = filters(req.query);
  const pageSize = Math.min(100, Math.max(1, Number(req.query["page_size"]) || 20));
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const { rows: [{ count, people }] } = await pool.query(`SELECT count(*)::int AS count, coalesce(sum(r.party_size), 0)::int AS people FROM visitor_registrations r ${where}`, params);
  const { rows } = await pool.query(
    `SELECT r.id, r.user_id, r.visit_no, r.full_name, r.email, r.phone, r.age, r.sex, r.party_size, r.visit_date, r.created_at, ${GROUP_COLUMNS}
       FROM visitor_registrations r ${where} ORDER BY r.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
  // Listing personal details is recorded
  await auditReq(req, res, { action: "visitor_registration.list", resource: "visitor_registrations", context: { page, rows: rows.length, filters: req.query } });
  res.json({ rows, total: count, people, page, page_size: pageSize });
});

router.get("/admin/visitor-registrations-export.csv", requirePermission("submissions.write"), async (req, res): Promise<void> => {
  const { where, params } = filters(req.query);
  const withContact = req.query["include_contact"] === "1";
  const { rows } = await pool.query(`SELECT r.*, ${GROUP_COLUMNS} FROM visitor_registrations r ${where} ORDER BY r.created_at DESC`, params);
  const columns = ["id", "created_at", "visit_date", "user_id", "visit_no", "full_name", ...(withContact ? ["email", "phone"] : []), "age", "sex", "companions", "party_size", "children", "adults", "seniors", "pwd", "member_ages"];
  await auditReq(req, res, { action: "visitor_registration.export", resource: "visitor_registrations", context: { rows: rows.length, include_contact: withContact, filters: req.query } });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="visitor-visits-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(columns, rows));
});

// ─── Forgotten passwords ──────────────────────────────────────────────────────

// No look-alike characters (0/O, 1/l/I), so the password can be read out or written down at the gate
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const tempPassword = () => Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join("")).join("-");

/**
 * Zoo staff give a visitor who forgot their password a temporary one (shown once to the staff
 * member, never stored). Only visitor accounts with a profile qualify: staff accounts are refused.
 * The reset is recorded in the audit log without the password.
 */
router.post("/admin/visitor-accounts/:userId/reset-password", requirePermission("users.manage"), async (req, res): Promise<void> => {
  const userId = String(req.params["userId"] ?? "");
  if (!UUID.test(userId)) { res.status(400).json({ error: "Unknown visitor account." }); return; }
  const { rows: [profile] } = await pool.query("SELECT full_name, email FROM visitor_profiles WHERE user_id = $1", [userId]);
  if (!profile) { res.status(404).json({ error: "No visitor account with this id." }); return; }
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) { res.status(404).json({ error: "This visitor's login account no longer exists." }); return; }
  if ((STAFF_ROLES as readonly string[]).includes(String(data.user.app_metadata?.["role"] ?? ""))) {
    res.status(403).json({ error: "This is a staff account. Change staff passwords in Users." });
    return;
  }
  const password = tempPassword();
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password });
  if (updateError) throw updateError;
  await auditReq(req, res, { action: "visitor_account.reset_password", resource: "visitor_profiles", recordId: userId, context: { email: profile.email } });
  res.json({ ok: true, full_name: profile.full_name, email: profile.email, temporary_password: password });
});

export default router;
