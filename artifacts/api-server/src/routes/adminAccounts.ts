import { Router } from "express";
import { pool } from "@workspace/db";
import { supabase } from "../lib/supabase";
import { requirePermission, staffUser } from "../middleware/access";
import { auditReq } from "../lib/audit";
import {
  normalizeUsername, usernameProblem, passwordProblem, temporaryPassword, placeholderEmail,
  findAdminByUsername, findAdminById, type AdminAccountRow,
} from "../lib/adminAccounts";

/**
 * Admin Account Management, for the Director only (permission "admins.manage", which no other role has).
 * The Director creates administrator accounts with a default username and password; the new
 * administrator must replace both at first login (see POST /auth/change-credentials). Accounts can be
 * deactivated, reactivated and reset (a new temporary password, which again forces the change).
 */
const router = Router();
const directorOnly = requirePermission("admins.manage");
const BAN_FOREVER = "876000h"; // 100 years: how the existing Users page disables accounts too

type Listed = AdminAccountRow & { last_login: string | null; email: string | null };

async function withLogin(row: AdminAccountRow): Promise<Listed> {
  const { data } = await supabase.auth.admin.getUserById(row.user_id);
  return { ...row, last_login: data.user?.last_sign_in_at ?? null, email: data.user?.email ?? null };
}

/** The administrator account behind :id, or a 404 already sent */
async function target(id: string, res: import("express").Response): Promise<AdminAccountRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(400).json({ error: "Invalid account id" }); return null; }
  const row = await findAdminById(id);
  if (!row) { res.status(404).json({ error: "Administrator account not found" }); return null; }
  return row;
}

router.get("/admin-accounts", directorOnly, async (_req, res): Promise<void> => {
  const { rows } = await pool.query<AdminAccountRow>("SELECT * FROM admin_accounts ORDER BY created_at DESC");
  res.json(await Promise.all(rows.map(withLogin)));
});

/** A suggested default username and temporary password for the create form (nothing is saved) */
router.get("/admin-accounts/suggestion", directorOnly, async (_req, res): Promise<void> => {
  let username = "";
  for (let i = 0; i < 20 && !username; i++) {
    const candidate = `admin${String(Math.floor(1000 + Math.random() * 9000))}`;
    if (!(await findAdminByUsername(candidate))) username = candidate;
  }
  res.json({ username, password: temporaryPassword() });
});

router.post("/admin-accounts", directorOnly, async (req, res): Promise<void> => {
  const fullName = String(req.body?.full_name ?? "").trim();
  const username = normalizeUsername(req.body?.username);
  const password = String(req.body?.password ?? "");
  if (fullName.length < 2 || fullName.length > 120) { res.status(400).json({ error: "Enter the administrator's full name (2–120 characters)." }); return; }
  const problem = usernameProblem(username) ?? passwordProblem(password, username);
  if (problem) { res.status(400).json({ error: problem }); return; }
  if (await findAdminByUsername(username)) { res.status(409).json({ error: `The username "${username}" is already taken.` }); return; }

  const director = staffUser(res);
  const { data, error } = await supabase.auth.admin.createUser({
    email: placeholderEmail(),
    password,
    email_confirm: true,
    app_metadata: { role: "admin", username, must_change_credentials: true, created_by: director.id },
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    await auditReq(req, res, { action: "admin_account.create", resource: "admin_accounts", result: "failure", context: { username, error: error?.message } });
    res.status(502).json({ error: `Could not create the account: ${error?.message ?? "unknown error"}` });
    return;
  }
  try {
    await pool.query(
      "INSERT INTO admin_accounts (user_id, username, full_name, created_by) VALUES ($1, $2, $3, $4)",
      [data.user.id, username, fullName, director.email ?? director.id],
    );
  } catch (err) {
    // Keep Supabase and the table in step: remove the login if its record couldn't be saved
    await supabase.auth.admin.deleteUser(data.user.id);
    const taken = (err as { code?: string }).code === "23505";
    res.status(taken ? 409 : 500).json({ error: taken ? `The username "${username}" is already taken.` : "Could not save the account. Please try again." });
    return;
  }
  await auditReq(req, res, { action: "admin_account.create", resource: "admin_accounts", recordId: data.user.id, after: { username, full_name: fullName, role: "admin" } });
  const row = await findAdminById(data.user.id);
  res.status(201).json(await withLogin(row!));
});

router.post("/admin-accounts/:id/deactivate", directorOnly, async (req, res): Promise<void> => {
  const row = await target(String(req.params["id"]), res);
  if (!row) return;
  if (!row.is_active) { res.status(409).json({ error: "This account is already deactivated." }); return; }
  // A ban blocks sign-in and token refresh, and the API refuses the account's current tokens at once
  const { error } = await supabase.auth.admin.updateUserById(row.user_id, { ban_duration: BAN_FOREVER });
  if (error) { res.status(502).json({ error: error.message }); return; }
  await pool.query("UPDATE admin_accounts SET is_active = false, updated_at = now() WHERE user_id = $1", [row.user_id]);
  await auditReq(req, res, { action: "admin_account.deactivate", resource: "admin_accounts", recordId: row.user_id, before: { username: row.username, is_active: true }, after: { username: row.username, is_active: false } });
  res.json(await withLogin({ ...row, is_active: false }));
});

router.post("/admin-accounts/:id/reactivate", directorOnly, async (req, res): Promise<void> => {
  const row = await target(String(req.params["id"]), res);
  if (!row) return;
  if (row.is_active) { res.status(409).json({ error: "This account is already active." }); return; }
  const { error } = await supabase.auth.admin.updateUserById(row.user_id, { ban_duration: "none" });
  if (error) { res.status(502).json({ error: error.message }); return; }
  await pool.query("UPDATE admin_accounts SET is_active = true, updated_at = now() WHERE user_id = $1", [row.user_id]);
  await auditReq(req, res, { action: "admin_account.reactivate", resource: "admin_accounts", recordId: row.user_id, before: { username: row.username, is_active: false }, after: { username: row.username, is_active: true } });
  res.json(await withLogin({ ...row, is_active: true }));
});

/**
 * Reset: a new temporary password (the old password stops working at once) and the first-login change
 * is required again. The username stays, so the Director can tell the administrator how to sign in.
 */
router.post("/admin-accounts/:id/reset", directorOnly, async (req, res): Promise<void> => {
  const row = await target(String(req.params["id"]), res);
  if (!row) return;
  const password = req.body?.password ? String(req.body.password) : temporaryPassword();
  const problem = passwordProblem(password, row.username);
  if (problem) { res.status(400).json({ error: problem }); return; }
  const { data: current } = await supabase.auth.admin.getUserById(row.user_id);
  if (!current.user) { res.status(404).json({ error: "The login for this account no longer exists." }); return; }
  const { error } = await supabase.auth.admin.updateUserById(row.user_id, {
    password,
    app_metadata: { ...current.user.app_metadata, must_change_credentials: true },
  });
  if (error) { res.status(502).json({ error: error.message }); return; }
  await pool.query("UPDATE admin_accounts SET must_change_credentials = true, last_reset_at = now(), updated_at = now() WHERE user_id = $1", [row.user_id]);
  await auditReq(req, res, { action: "admin_account.reset", resource: "admin_accounts", recordId: row.user_id, after: { username: row.username, must_change_credentials: true } });
  const updated = await findAdminById(row.user_id);
  // The temporary password is returned this once so the Director can pass it on; it is not stored anywhere
  res.json({ account: await withLogin(updated!), username: row.username, temporary_password: password });
});

export default router;
