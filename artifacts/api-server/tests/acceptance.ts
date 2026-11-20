/**
 * Acceptance test of the admin features (datasets, roles, audit log, map versions, submissions,
 * Row Level Security, encrypted full/differential backup and restore) against the RUNNING API.
 *
 * WARNING: it creates temporary accounts and records, makes real backups, and RESTORES the
 * database to a differential backup taken seconds earlier: any real change made by someone else
 * during the run is rolled back (it stays in the safety backup). Run it only when nobody else is
 * using the system, and afterwards delete its test backups (they use a random passphrase).
 *
 *   set RUN_DESTRUCTIVE_TESTS=1 && npx tsx --env-file=../../.env ./tests/acceptance.ts
 */
if (process.env["RUN_DESTRUCTIVE_TESTS"] !== "1") {
  console.error("Refusing to run: this test restores the database. Set RUN_DESTRUCTIVE_TESTS=1 to confirm.");
  process.exit(1);
}
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { pool } from "@workspace/db";

/** End-to-end checks of the new admin features against the running API (temporary accounts, cleaned up after). */
const API = "http://127.0.0.1:5000/api";
const url = process.env["VITE_SUPABASE_URL"]!;
const anonKey = process.env["VITE_SUPABASE_ANON_KEY"]!;
const service = createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const tag = randomBytes(3).toString("hex");
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300)}`}`);
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Acct = { id: string; email: string; password: string; token: string };
const accounts: Acct[] = [];
async function makeAccount(role: string): Promise<Acct> {
  const email = `zoo-test-${role}-${tag}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role } });
  if (error) throw error;
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const j = await r.json() as { access_token: string };
  const acct = { id: data.user!.id, email, password, token: j.access_token };
  accounts.push(acct);
  return acct;
}
async function call(acct: Acct | null, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra };
  if (acct) headers["Authorization"] = `Bearer ${acct.token}`;
  if (body !== undefined && typeof body !== "string") headers["Content-Type"] = "application/json";
  if (typeof body === "string") headers["Content-Type"] = "text/csv";
  const r = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}

const created: { dataset: string; id: number }[] = [];
try {
  const admin = await makeAccount("admin");
  const editor = await makeAccount("editor");
  const viewer = await makeAccount("viewer");
  const visitor = await makeAccount("visitor");

  // ── Login auditing ──
  const bad = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: admin.email, password: "wrong-password" }) });
  check("login: wrong password rejected", bad.status === 401);
  const me = await call(editor, "GET", "/auth/me");
  check("auth/me reports role and permissions", me.json.role === "editor" && me.json.permissions.includes("content.write") && !me.json.permissions.includes("backup.manage"), me.json);

  // ── Row Level Security: the public key can't read or write tables directly ──
  const rest = await fetch(`${url}/rest/v1/chat_history?select=id&limit=1`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
  const restRows = await rest.json();
  check("RLS: public key reads nothing from chat_history", Array.isArray(restRows) ? restRows.length === 0 : rest.status >= 400, restRows);
  const restWrite = await fetch(`${url}/rest/v1/animals`, { method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "hacked" }) });
  check("RLS: public key can't insert animals", restWrite.status >= 400, restWrite.status);

  // ── Role-based access ──
  check("viewer can't create records", (await call(viewer, "POST", "/admin/datasets/zoo_updates", { title: "x", description: "y" })).status === 403);
  check("visitor can't read admin datasets", (await call(visitor, "GET", "/admin/datasets/zoo_updates")).status === 403);
  check("no login: 401", (await call(null, "GET", "/admin/datasets/zoo_updates")).status === 401);
  check("editor can't list users", (await call(editor, "GET", "/users")).status === 403);
  check("editor can't read audit logs", (await call(editor, "GET", "/admin/audit-logs")).status === 403);
  check("editor can't unlock backups", (await call(editor, "POST", "/admin/backup/unlock", { password: editor.password })).status === 403);
  check("viewer can read dashboard reports", (await call(viewer, "GET", "/reports/dashboard")).status === 200);

  // ── Zoo updates: draft -> publish -> public ──
  const up = await call(editor, "POST", "/admin/datasets/zoo_updates", { title: `Test update ${tag}`, description: "Acceptance test record", category: "general" });
  check("zoo update: editor creates draft", up.status === 201 && up.json.status === "draft", up.json);
  created.push({ dataset: "zoo_updates", id: up.json.id });
  let pub = await call(null, "GET", "/zoo-updates");
  check("zoo update: draft not public", !pub.json.some((u: any) => u.id === up.json.id));
  const published = await call(editor, "PATCH", `/admin/datasets/zoo_updates/${up.json.id}`, { status: "published" });
  check("zoo update: publish sets published_at", published.status === 200 && !!published.json.published_at, published.json);
  pub = await call(null, "GET", "/zoo-updates");
  check("zoo update: published one is public", pub.json.some((u: any) => u.id === up.json.id));
  check("zoo update: duplicate title rejected (409)", (await call(editor, "POST", "/admin/datasets/zoo_updates", { title: `Test update ${tag}`, description: "dup" })).status === 409);
  check("zoo update: missing description rejected", (await call(editor, "POST", "/admin/datasets/zoo_updates", { title: "No description" })).status === 400);
  check("zoo update: can't delete while published", (await call(editor, "DELETE", `/admin/datasets/zoo_updates/${up.json.id}`)).status === 409);
  const list = await call(viewer, "GET", `/admin/datasets/zoo_updates?search=${tag}&page=1&page_size=5`);
  check("datasets: search + pagination", list.status === 200 && list.json.total >= 1 && list.json.page_size === 5, list.json);

  // ── Ticket prices: verification rules ──
  const unverified = await call(editor, "POST", "/admin/datasets/ticket_prices", { category: `Test ticket ${tag}`, visitor_type: "All visitors", price: 50, status: "published" });
  check("tickets: unverified price can't be published", unverified.status === 400, unverified.json);
  check("tickets: negative price rejected", (await call(editor, "POST", "/admin/datasets/ticket_prices", { category: `Neg ${tag}`, price: -5 })).status === 400);
  check("tickets: invalid date rejected", (await call(editor, "POST", "/admin/datasets/ticket_prices", { category: `Date ${tag}`, price: 5, effective_date: "2026-13-45" })).status === 400);
  check("tickets: valid-until before effective rejected", (await call(editor, "POST", "/admin/datasets/ticket_prices", { category: `Range ${tag}`, price: 5, effective_date: "2026-10-10", valid_until: "2026-10-01" })).status === 400);
  const draftPrice = await call(editor, "POST", "/admin/datasets/ticket_prices", { category: `Test ticket ${tag}`, visitor_type: "All visitors", price: 50 });
  check("tickets: draft price saved", draftPrice.status === 201, draftPrice.json);
  created.push({ dataset: "ticket_prices", id: draftPrice.json.id });
  const publicPrices = await call(null, "GET", "/ticket-prices");
  check("tickets: public shows only verified prices", publicPrices.json.prices.length === 9 && !publicPrices.json.prices.some((p: any) => p.category.includes(tag)), publicPrices.json.prices.length);
  const hist = await call(viewer, "GET", "/admin/ticket-prices/history");
  check("tickets: change history recorded", hist.json.some((h: any) => h.ticket_price_id === draftPrice.json.id));

  // ── Announcements: scheduling and expiry ──
  const expired = await call(editor, "POST", "/admin/datasets/announcements", { title: `Old ${tag}`, content: "x", status: "published", expires_at: "2020-01-01 09:00" });
  check("announcements: already-expired can't be published", expired.status === 400, expired.json);
  const future = await call(editor, "POST", "/admin/datasets/announcements", { title: `Future ${tag}`, content: "Scheduled test", status: "published", publish_at: "2099-01-01 09:00" });
  created.push({ dataset: "announcements", id: future.json.id });
  const urgent = await call(editor, "POST", "/admin/datasets/announcements", { title: `Urgent ${tag}`, content: "Urgent test", status: "published", priority: "urgent" });
  created.push({ dataset: "announcements", id: urgent.json.id });
  const publicAnn = await call(null, "GET", "/announcements");
  check("announcements: scheduled one hidden until its time", !publicAnn.json.some((a: any) => a.id === future.json.id));
  check("announcements: urgent one first", publicAnn.json[0]?.id === urgent.json.id, publicAnn.json.map((a: any) => a.title));

  // ── Events: map place, status ──
  const pins = await call(null, "GET", "/map/pins");
  const lion = pins.json.find((p: any) => p.name === "Apex Predators");
  const ev = await call(editor, "POST", "/admin/datasets/events", { title: `Test event ${tag}`, start_date: "2099-05-01 10:00", end_date: "2099-05-01 11:00", pin_id: lion.id, status: "draft" });
  created.push({ dataset: "events", id: ev.json.id });
  check("events: end before start rejected", (await call(editor, "POST", "/admin/datasets/events", { title: `Bad ${tag}`, start_date: "2099-05-01 10:00", end_date: "2099-05-01 09:00" })).status === 400);
  let pubEv = await call(null, "GET", "/events");
  check("events: draft hidden from visitors", !pubEv.json.some((e: any) => e.id === ev.json.id));
  await call(editor, "PATCH", `/admin/datasets/events/${ev.json.id}`, { status: "cancelled" });
  pubEv = await call(null, "GET", "/events");
  const shown = pubEv.json.find((e: any) => e.id === ev.json.id);
  check("events: cancelled shown with map place", shown?.status === "cancelled" && shown?.pin_name === "Apex Predators", shown);

  // ── CSV import: all-or-nothing ──
  const badCsv = `title,description,category,status\nImport A ${tag},Good row,general,draft\nImport B ${tag},,general,draft\n`;
  const badImport = await call(editor, "POST", "/admin/datasets/zoo_updates/import", badCsv);
  check("import: error names the line and changes nothing", badImport.status === 400 && /Line 3/.test(badImport.json.error), badImport.json);
  const afterBad = await call(viewer, "GET", `/admin/datasets/zoo_updates?search=Import A ${tag}`);
  check("import: failed file left no rows", afterBad.json.total === 0);
  const goodImport = await call(editor, "POST", "/admin/datasets/zoo_updates/import", `title,description,category,status\nImport A ${tag},Good row,general,draft\n`);
  check("import: valid file imported", goodImport.status === 200 && goodImport.json.created === 1, goodImport.json);
  const imported = await call(viewer, "GET", `/admin/datasets/zoo_updates?search=Import A ${tag}`);
  if (imported.json.rows[0]) created.push({ dataset: "zoo_updates", id: imported.json.rows[0].id });
  const csv = await fetch(`${API}/admin/datasets/zoo_updates/export.csv`, { headers: { Authorization: `Bearer ${viewer.token}` } });
  check("export: CSV with header", csv.status === 200 && (await csv.text()).includes("title,description"));

  // ── Settings: public site URL ──
  check("settings: localhost URL refused", (await call(editor, "PUT", "/admin/settings/public_site_url", { value: "http://localhost:4173" })).status === 400);
  const before = (await call(null, "GET", "/settings/public")).json.public_site_url;
  const setUrl = await call(editor, "PUT", "/admin/settings/public_site_url", { value: "https://example-zoo-test.trycloudflare.com" });
  check("settings: editor sets public URL", setUrl.status === 200);
  await call(admin, "PUT", "/admin/settings/public_site_url", { value: before ?? "" });
  check("settings: editor can't change other settings", (await call(editor, "PUT", "/admin/settings/announcements_archive_after_days", { value: 3 })).status === 403);

  // ── Visitor form submissions ──
  const form = { name: "Test Visitor", email: `visitor-${tag}@example.com`, message: `Acceptance test inquiry ${tag}`, form_type: "inquiry" };
  check("form: missing contact rejected", (await call(null, "POST", "/forms/inquiry", { name: "A B", message: "Hello there" })).status === 400);
  check("form: past visit date rejected", (await call(null, "POST", "/forms/inquiry", { ...form, visit_date: "2020-01-01" })).status === 400);
  const sub = await call(null, "POST", "/forms/inquiry", form);
  check("form: valid inquiry accepted", sub.status === 201, sub.json);
  check("form: duplicate rejected", (await call(null, "POST", "/forms/inquiry", form)).status === 409);
  check("submissions: visitors can't list", (await call(visitor, "GET", "/admin/submissions")).status === 403);
  const subs = await call(viewer, "GET", `/admin/submissions?search=${tag}`);
  check("submissions: viewer lists", subs.json.total === 1, subs.json);
  check("submissions: viewer can't change status", (await call(viewer, "PATCH", `/admin/submissions/${sub.json.id}`, { status: "resolved" })).status === 403);
  check("submissions: editor resolves", (await call(editor, "PATCH", `/admin/submissions/${sub.json.id}`, { status: "resolved" })).json.status === "resolved");

  // ── Map: validation, hidden places, versions ──
  check("map: position outside zoo rejected", (await call(editor, "POST", "/map/pins", { name: `Far ${tag}`, pin_type: "facility", lat: 14.6, lng: 121.0 })).status === 400);
  // ~100 m east of the fence: close by, but still outside
  check("map: position just outside the fence rejected", (await call(editor, "POST", "/map/pins", { name: `Near ${tag}`, pin_type: "facility", lat: 14.5641, lng: 120.9912 })).status === 400);
  check("map: walkway leaving the zoo rejected", (await call(editor, "POST", "/map/paths", { name: `Out ${tag}`, geometry: { type: "LineString", coordinates: [[120.9885585, 14.564893], [120.9946, 14.5634]] } })).status === 400);
  check("map: map center outside zoo rejected", (await call(editor, "PATCH", "/map/config", { center_lat: 14.5632, center_lng: 121.0167 })).status === 400);
  const outside = await call(null, "GET", "/map/nearest?lat=14.5634&lng=120.9946&kind=restroom");
  check("map: routing from outside the zoo refused", outside.status === 422 && outside.json.code === "outside_zoo" && /outside Manila Zoo/.test(outside.json.error), outside.json);
  check("map: routing from inside the zoo works", (await call(null, "GET", "/map/nearest?lat=14.564893&lng=120.9885585&kind=restroom")).status === 200);
  const hidden = await call(editor, "POST", "/map/pins", { name: `Hidden ${tag}`, pin_type: "facility", lat: 14.5648, lng: 120.9878, is_active: false, show_label: false });
  check("map: hidden place created", hidden.status === 201 && hidden.json.show_label === false, hidden.json);
  check("map: hidden place not shown to visitors", !(await call(null, "GET", "/map/pins")).json.some((p: any) => p.id === hidden.json.id));
  check("map: hidden place shown to staff", (await call(viewer, "GET", "/map/pins")).json.some((p: any) => p.id === hidden.json.id));
  const ver = await call(editor, "POST", "/admin/map/versions", { note: `test ${tag}` });
  check("map: version saved", ver.status === 201 && ver.json.pin_count > 20, ver.json);
  await call(editor, "PATCH", `/map/pins/${hidden.json.id}`, { name: `Renamed ${tag}` });
  const restore = await call(editor, "POST", `/admin/map/versions/${ver.json.id}/restore`, {});
  const afterRestore = (await call(viewer, "GET", "/map/pins")).json.find((p: any) => p.id === hidden.json.id);
  check("map: version restored (name back)", restore.status === 200 && afterRestore?.name === `Hidden ${tag}`, { restore: restore.json, name: afterRestore?.name });
  await call(editor, "DELETE", `/map/pins/${hidden.json.id}`);

  // ── Audit log ──
  const logs = await call(admin, "GET", `/admin/audit-logs?action=zoo_updates&page_size=50`);
  check("audit: dataset changes logged", logs.json.rows.some((r: any) => r.action === "zoo_updates.publish" && r.actor_email === editor.email), logs.json.rows?.slice(0, 3));
  const loginLogs = await call(admin, "GET", `/admin/audit-logs?action=auth.login&user=${tag}`);
  check("audit: failed and successful logins logged", loginLogs.json.rows.some((r: any) => r.result === "failure") && loginLogs.json.rows.some((r: any) => r.result === "success"));
  const noSecrets = await pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE (coalesce(before::text,'') || coalesce(after::text,'') || coalesce(context::text,'')) ILIKE ANY ($1)", [[`%${admin.password}%`, `%${admin.token.slice(20, 60)}%`]]);
  check("audit: no passwords or tokens stored", noSecrets.rows[0].n === 0);
  let tamper = "";
  try { await pool.query("UPDATE audit_logs SET action = 'x' WHERE id = (SELECT max(id) FROM audit_logs)"); } catch (e) { tamper = (e as Error).message; }
  check("audit: records can't be changed", /append-only/.test(tamper), tamper);
  try { await pool.query("TRUNCATE audit_logs"); tamper = ""; } catch (e) { tamper = (e as Error).message; }
  check("audit: log can't be truncated", /append-only/.test(tamper), tamper);
  const chain = await call(admin, "GET", "/admin/audit-logs/verify");
  check("audit: hash chain verifies", chain.json.ok === true, chain.json);

  // ── Backup and recovery ──
  const passphrase = randomBytes(24).toString("base64url");
  check("backup: locked without password", (await call(admin, "POST", "/admin/backup/create", { type: "full", passphrase })).status === 401);
  check("backup: wrong password refused", (await call(admin, "POST", "/admin/backup/unlock", { password: "nope" })).status === 401);
  const session = (await call(admin, "POST", "/admin/backup/unlock", { password: admin.password })).json.session;
  const hdr = { "X-Backup-Session": session };
  check("backup: short passphrase refused", (await call(admin, "POST", "/admin/backup/create", { type: "full", passphrase: "short" }, hdr)).status === 400);
  const waitJob = async (job: string) => {
    for (let i = 0; i < 300; i++) {
      const j = await call(admin, "GET", `/admin/backup/jobs/${job}`);
      if (j.json.status !== "running") return j.json;
      await sleep(1000);
    }
    return { status: "timeout" };
  };
  const fullJob = await waitJob((await call(admin, "POST", "/admin/backup/create", { type: "full", passphrase }, hdr)).json.job);
  check("backup: full backup completed", fullJob.status === "completed", fullJob);
  const fullId = fullJob.result?.id;

  // A known change, then a differential
  const marker = await call(editor, "POST", "/admin/datasets/zoo_updates", { title: `Backup marker ${tag}`, description: "Exists only in the differential" });
  const diffJob = await waitJob((await call(admin, "POST", "/admin/backup/create", { type: "differential", passphrase }, hdr)).json.job);
  check("backup: differential completed", diffJob.status === "completed", diffJob);
  check("backup: differential holds only the changes", diffJob.result?.changed_rows > 0 && diffJob.result?.changed_rows < fullJob.result?.row_count / 10, { diff: diffJob.result?.changed_rows, full: fullJob.result?.row_count });
  const diffId = diffJob.result?.id;
  const { rows: [meta] } = await pool.query("SELECT base_backup_id, file_name FROM backups WHERE id = $1", [diffId]);
  check("backup: differential points at the full backup", meta.base_backup_id === fullId, meta);
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { BACKUP_DIR } = await import("../src/lib/backup");
  const raw = await fs.readFile(path.join(BACKUP_DIR, meta.file_name));
  check("backup: file is encrypted (no readable data)", !raw.includes(Buffer.from(`Backup marker ${tag}`)) && !raw.includes(Buffer.from("Panthera leo")));
  const verify = await call(admin, "GET", `/admin/backup/${diffId}/verify`);
  check("backup: integrity check passes", verify.json.ok === true, verify.json);

  // Change data after the differential, then restore it
  await call(editor, "PATCH", `/admin/datasets/zoo_updates/${marker.json.id}`, { title: `Changed after backup ${tag}` });
  const after = await call(editor, "POST", "/admin/datasets/zoo_updates", { title: `Created after backup ${tag}`, description: "Should disappear on restore" });
  check("restore: needs typed confirmation", (await call(admin, "POST", `/admin/backup/${diffId}/restore`, { passphrase }, hdr)).status === 400);
  const wrongPass = await waitJob((await call(admin, "POST", `/admin/backup/${diffId}/restore`, { passphrase: "x".repeat(20), confirm: "RESTORE" }, hdr)).json.job);
  check("restore: wrong passphrase fails before changing anything", wrongPass.status === "failed" && /passphrase/i.test(wrongPass.error), wrongPass);
  const restoreJob = await waitJob((await call(admin, "POST", `/admin/backup/${diffId}/restore`, { passphrase, confirm: "RESTORE" }, hdr)).json.job);
  check("restore: completed with a safety backup", restoreJob.status === "completed" && restoreJob.result?.safety_backup > 0, restoreJob);
  const m = await call(viewer, "GET", `/admin/datasets/zoo_updates/${marker.json.id}`);
  check("restore: data back to the differential's state", m.json.title === `Backup marker ${tag}`, m.json.title);
  check("restore: rows created after the backup are gone", (await call(viewer, "GET", `/admin/datasets/zoo_updates/${after.json.id}`)).status === 404);
  const animals = await call(null, "GET", "/animals?limit=100");
  check("restore: animals intact", (Array.isArray(animals.json) ? animals.json : animals.json.animals).length === 33);
  const auditAfter = await call(admin, "GET", "/admin/audit-logs?action=backup.restore");
  check("restore: audit log kept and recorded the restore", auditAfter.json.rows.some((r: any) => r.action === "backup.restore" && r.result === "success"));
  created.push({ dataset: "zoo_updates", id: marker.json.id });
  // The safety + test backups stay in the catalogue (deleting backups isn't offered); remove the test files' rows? Kept for review.
} catch (err) {
  fail++;
  console.log("ERROR", err);
} finally {
  // Clean up test records and accounts
  for (const c of created) {
    await pool.query(`UPDATE "${c.dataset}" SET status = 'archived' WHERE id = $1`, [c.id]).catch(() => {});
    await pool.query(`DELETE FROM "${c.dataset}" WHERE id = $1`, [c.id]).catch(() => {});
  }
  await pool.query("DELETE FROM zoo_updates WHERE title LIKE $1", [`%${tag}%`]).catch(() => {});
  await pool.query("DELETE FROM ticket_price_history WHERE ticket_price_id IS NULL AND (before->>'category') LIKE $1", [`%${tag}%`]).catch(() => {});
  await pool.query("DELETE FROM form_submissions WHERE message LIKE $1", [`%${tag}%`]).catch(() => {});
  await pool.query("DELETE FROM map_pins WHERE name LIKE $1", [`%${tag}%`]).catch(() => {});
  for (const a of accounts) await service.auth.admin.deleteUser(a.id);
  console.log(`\n${pass} passed, ${fail} failed (temporary accounts removed)`);
  await pool.end();
}
