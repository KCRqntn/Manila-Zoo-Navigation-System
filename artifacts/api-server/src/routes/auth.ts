import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { pool } from "@workspace/db";
import { audit, actorFrom } from "../lib/audit";
import { supabase as serviceClient } from "../lib/supabase";
import { verifiedUser, permissionsOf, roleOf, mustChangeCredentials, PERMISSIONS, ROLE_PERMISSIONS } from "../middleware/access";
import { findAdminByUsername, findAdminById, normalizeUsername, usernameProblem, passwordProblem } from "../lib/adminAccounts";

/**
 * Sign-in through the API so every attempt, successful or not, is recorded in the audit log on the
 * server. The browser then stores the returned Supabase session as usual. Passwords are passed
 * straight to Supabase (which stores only a bcrypt hash) and are never stored or logged here.
 * Staff sign in with their email; administrators created by the Director sign in with their username.
 */
const router = Router();
const url = process.env["VITE_SUPABASE_URL"];
const anonKey = process.env["VITE_SUPABASE_ANON_KEY"];

// Slows down password guessing: at most 5 failed attempts per email/username and address in 10 minutes
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();
const recentFailures = (key: string) => (failures.get(key) ?? []).filter(t => Date.now() - t < WINDOW_MS);

// A fresh client per sign-in so sessions never mix between users
const freshClient = () => createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });

/** The email Supabase knows an administrator's username by, or null when no such username exists */
async function emailForUsername(username: string): Promise<string | null> {
  const row = await findAdminByUsername(username);
  if (!row) return null;
  const { data } = await serviceClient.auth.admin.getUserById(row.user_id);
  return data.user?.email ?? null;
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const identifier = String(req.body?.email ?? req.body?.username ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!identifier || !password) { res.status(400).json({ error: "Email or username and password are required" }); return; }
  if (!url || !anonKey) { res.status(503).json({ error: "Supabase authentication is not configured" }); return; }

  const key = `${identifier}|${req.ip}`;
  if (recentFailures(key).length >= MAX_FAILURES) {
    await audit({ email: identifier }, { action: "auth.login", resource: "session", result: "failure", context: { reason: "too many attempts" } }, req);
    res.status(429).json({ error: "Too many failed attempts. Wait 10 minutes and try again." });
    return;
  }

  const byUsername = !identifier.includes("@");
  const email = byUsername ? await emailForUsername(identifier) : identifier;
  const { data, error } = email
    ? await freshClient().auth.signInWithPassword({ email, password })
    : { data: { session: null, user: null }, error: { message: "Invalid login credentials" } };
  if (error || !data.session || !data.user) {
    failures.set(key, [...recentFailures(key), Date.now()]);
    const unconfirmed = /not confirmed/i.test(error?.message ?? "");
    const banned = /banned/i.test(error?.message ?? "");
    await audit({ email: identifier }, { action: "auth.login", resource: "session", result: "failure", context: { reason: unconfirmed ? "email not confirmed" : banned ? "account deactivated" : "invalid credentials" } }, req);
    res.status(401).json({
      error: banned ? "This account has been deactivated. Contact the Director." : error?.message ?? "Invalid login credentials",
      code: unconfirmed ? "email_not_confirmed" : banned ? "account_deactivated" : "invalid_credentials",
    });
    return;
  }
  failures.delete(key);
  await audit(actorFrom(data.user), { action: "auth.login", resource: "session", recordId: data.user.id, result: "success" }, req);
  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    role: roleOf(data.user),
    must_change_credentials: mustChangeCredentials(data.user),
  });
});

/**
 * First login (or after a reset): the administrator replaces the default username and password.
 * The temporary password is asked again so a session opened before a reset can't take the account over.
 * Afterwards every earlier session is signed out, the old password and username stop working, and a
 * fresh session is returned.
 */
router.post("/auth/change-credentials", async (req, res): Promise<void> => {
  const user = await verifiedUser(req);
  if (!user) { res.status(401).json({ error: "Not signed in" }); return; }
  if (!url || !anonKey || !user.email) { res.status(503).json({ error: "Supabase authentication is not configured" }); return; }
  const row = await findAdminById(user.id);
  if (!row) { res.status(403).json({ error: "Only administrator accounts created by the Director change credentials here." }); return; }

  const currentPassword = String(req.body?.current_password ?? "");
  const newUsername = normalizeUsername(req.body?.new_username);
  const newPassword = String(req.body?.new_password ?? "");
  const confirmPassword = String(req.body?.confirm_password ?? "");

  const key = `change|${user.id}|${req.ip}`;
  if (recentFailures(key).length >= MAX_FAILURES) { res.status(429).json({ error: "Too many failed attempts. Wait 10 minutes and try again." }); return; }

  const problem = usernameProblem(newUsername) ?? passwordProblem(newPassword, newUsername);
  if (problem) { res.status(400).json({ error: problem, field: problem.startsWith("Username") ? "new_username" : "new_password" }); return; }
  if (newPassword !== confirmPassword) { res.status(400).json({ error: "The two new passwords don't match.", field: "confirm_password" }); return; }
  if (newPassword === currentPassword) { res.status(400).json({ error: "Choose a new password, not the temporary one.", field: "new_password" }); return; }
  if (mustChangeCredentials(user) && newUsername === row.username.toLowerCase()) {
    res.status(400).json({ error: "Choose a new username, not the default one.", field: "new_username" }); return;
  }
  const taken = await findAdminByUsername(newUsername);
  if (taken && taken.user_id !== user.id) { res.status(409).json({ error: `The username "${newUsername}" is already taken.`, field: "new_username" }); return; }

  // Proves the person knows the current (temporary) password; this session is also used below to sign out everywhere
  const check = await freshClient().auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (check.error || !check.data.session) {
    failures.set(key, [...recentFailures(key), Date.now()]);
    await audit(actorFrom(user), { action: "auth.change_credentials", resource: "session", recordId: user.id, result: "failure", context: { reason: "wrong current password" } }, req);
    res.status(401).json({ error: "The current (temporary) password is wrong.", field: "current_password" });
    return;
  }

  // Claim the username first (the unique index settles two people choosing it at once), then change the login
  try {
    await pool.query(
      "UPDATE admin_accounts SET username = $2, must_change_credentials = false, credentials_changed_at = now(), updated_at = now() WHERE user_id = $1",
      [user.id, newUsername],
    );
  } catch (err) {
    const dup = (err as { code?: string }).code === "23505";
    res.status(dup ? 409 : 500).json({ error: dup ? `The username "${newUsername}" is already taken.` : "Could not save the new username. Please try again.", field: dup ? "new_username" : undefined });
    return;
  }
  const { error } = await serviceClient.auth.admin.updateUserById(user.id, {
    password: newPassword,
    app_metadata: { ...user.app_metadata, username: newUsername, must_change_credentials: false },
  });
  if (error) {
    await pool.query(
      "UPDATE admin_accounts SET username = $2, must_change_credentials = $3, credentials_changed_at = $4, updated_at = now() WHERE user_id = $1",
      [user.id, row.username, row.must_change_credentials, row.credentials_changed_at],
    );
    res.status(502).json({ error: `Could not save the new credentials: ${error.message}` });
    return;
  }
  failures.delete(key);

  // End every earlier session of this account (including the one opened with the default credentials)
  await serviceClient.auth.admin.signOut(check.data.session.access_token, "global").catch(() => {});
  const fresh = await freshClient().auth.signInWithPassword({ email: user.email, password: newPassword });
  await audit(actorFrom(user), { action: "auth.change_credentials", resource: "admin_accounts", recordId: user.id, before: { username: row.username }, after: { username: newUsername } }, req);
  if (fresh.error || !fresh.data.session) { res.json({ signed_out: true }); return; }
  res.json({ access_token: fresh.data.session.access_token, refresh_token: fresh.data.session.refresh_token, username: newUsername });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const user = await verifiedUser(req);
  if (user) await audit(actorFrom(user), { action: "auth.logout", resource: "session", recordId: user.id }, req);
  res.sendStatus(204);
});

/** The signed-in account's role and permissions, for showing the right dashboard sections. */
router.get("/auth/me", async (req, res): Promise<void> => {
  const user = await verifiedUser(req);
  if (!user) { res.status(401).json({ error: "Not signed in" }); return; }
  const username = user.app_metadata?.["username"];
  res.json({
    id: user.id,
    email: user.email,
    username: typeof username === "string" ? username : null,
    full_name: (user.user_metadata?.["full_name"] as string | undefined) ?? null,
    role: roleOf(user),
    permissions: permissionsOf(user),
    must_change_credentials: mustChangeCredentials(user),
  });
});

/** The roles and what each can do (shown on the Users & Roles page). */
router.get("/auth/roles", (_req, res): void => {
  res.json({
    roles: Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => ({ role, permissions: perms })),
    permissions: Object.entries(PERMISSIONS).map(([id, label]) => ({ id, label })),
  });
});

export default router;
