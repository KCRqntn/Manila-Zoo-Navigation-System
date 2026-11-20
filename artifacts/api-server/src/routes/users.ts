import { Router } from "express";
import { createClient, type User } from "@supabase/supabase-js";
import { GetUserParams, UpdateUserParams, UpdateUserBody, DeleteUserParams } from "@workspace/api-zod";
import { requirePermission, STAFF_ROLES, PROTECTED_ROLES, staffUser, roleOf } from "../middleware/access";
import { auditReq } from "../lib/audit";
import { findAdminById } from "../lib/adminAccounts";

const ROLES = ["visitor", ...STAFF_ROLES];
const manageUsers = requirePermission("users.manage");

/**
 * Director-only rules on top of users.manage: only the Director may change or remove administrator
 * accounts or give the administrator role, nobody can change a Director here (that is done with
 * `pnpm create-director`), and accounts made on the Admin Accounts page are managed only there.
 */
async function protectedChange(res: Parameters<Parameters<typeof router.get>[1]>[1], target: User, newRole?: string | null): Promise<string | null> {
  const callerIsDirector = roleOf(staffUser(res)) === "director";
  const targetRole = roleOf(target);
  if (targetRole === "director" || newRole === "director") return "The Director role can't be given or changed here.";
  if (await findAdminById(target.id)) return "This administrator was created on the Admin Accounts page. Manage it there.";
  if ((PROTECTED_ROLES.includes(targetRole) || (newRole != null && PROTECTED_ROLES.includes(newRole))) && !callerIsDirector) {
    return "Only the Director can create or manage administrator accounts.";
  }
  return null;
}

const router = Router();

const supabaseUrl = process.env["VITE_SUPABASE_URL"];
const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

function formatUser(user: User) {
  return {
    id: user.id,
    email: user.email ?? "",
    full_name: (user.user_metadata?.["full_name"] as string | undefined) ?? null,
    avatar_url: (user.user_metadata?.["avatar_url"] as string | undefined) ?? null,
    role: (user.app_metadata?.["role"] as string | undefined) ?? "visitor",
    is_active: !user.banned_until,
    created_at: user.created_at,
    last_login: user.last_sign_in_at ?? null,
  };
}

async function countActiveAdmins(): Promise<number> {
  const { data } = await supabaseAdmin!.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const users: User[] = data && "users" in data ? data.users : [];
  // banned_until is set (in the future) for disabled accounts
  return users.filter(u => PROTECTED_ROLES.includes(String(u.app_metadata?.["role"])) && !(u.banned_until && new Date(u.banned_until) > new Date())).length;
}

function requireSupabase(res: Parameters<Parameters<typeof router.get>[1]>[1]) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: "Supabase Admin API is not configured" });
    return false;
  }
  return true;
}

router.get("/users", manageUsers, async (_req, res): Promise<void> => {
  if (!requireSupabase(res)) return;
  const { data, error } = await supabaseAdmin!.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) { res.status(502).json({ error: error.message }); return; }
  res.json(data.users.map(formatUser));
});

router.get("/users/:id", manageUsers, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!requireSupabase(res)) return;
  const { data, error } = await supabaseAdmin!.auth.admin.getUserById(params.data.id);
  if (error || !data.user) { res.status(404).json({ error: error?.message ?? "User not found" }); return; }
  res.json(formatUser(data.user));
});

router.patch("/users/:id", manageUsers, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!requireSupabase(res)) return;
  const metadata = Object.fromEntries(Object.entries(parsed.data).filter(([key]) => ["full_name", "avatar_url"].includes(key)).map(([key, value]) => [key, value ?? null]));
  const update: { user_metadata: Record<string, unknown>; app_metadata?: Record<string, unknown>; ban_duration?: string } = { user_metadata: metadata };
  // Role goes in app_metadata so users can't change it themselves
  if (parsed.data.role != null && !ROLES.includes(parsed.data.role)) { res.status(400).json({ error: `Role must be one of: ${ROLES.join(", ")}` }); return; }
  const { data: current } = await supabaseAdmin!.auth.admin.getUserById(params.data.id);
  if (!current.user) { res.status(404).json({ error: "User not found" }); return; }
  const blocked = await protectedChange(res, current.user, parsed.data.role);
  if (blocked) { res.status(403).json({ error: blocked }); return; }
  const before = formatUser(current.user);
  // Never leave the system without an administrator (that would lock everyone out of the dashboard)
  const losingAdmin = before.role === "admin" && ((parsed.data.role != null && parsed.data.role !== "admin") || parsed.data.is_active === false);
  if (losingAdmin && (await countActiveAdmins()) <= 1) { res.status(409).json({ error: "This is the only active administrator. Make someone else an administrator first." }); return; }
  if (parsed.data.role != null) update.app_metadata = { ...current.user.app_metadata, role: parsed.data.role };
  if (parsed.data.is_active === false) update.ban_duration = "876000h";
  if (parsed.data.is_active === true) update.ban_duration = "none";
  const { data, error } = await supabaseAdmin!.auth.admin.updateUserById(params.data.id, update);
  if (error || !data.user) {
    await auditReq(req, res, { action: "user.update", resource: "users", recordId: params.data.id, result: "failure", context: { error: error?.message } });
    res.status(404).json({ error: error?.message ?? "User not found" }); return;
  }
  const after = formatUser(data.user);
  const action = before.role !== after.role ? "user.role_change" : before.is_active !== after.is_active ? (after.is_active ? "user.enable" : "user.disable") : "user.update";
  await auditReq(req, res, { action, resource: "users", recordId: params.data.id, before: { email: before.email, role: before.role, is_active: before.is_active }, after: { email: after.email, role: after.role, is_active: after.is_active } });
  res.json(after);
});

router.delete("/users/:id", manageUsers, async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!requireSupabase(res)) return;
  const { data: current } = await supabaseAdmin!.auth.admin.getUserById(params.data.id);
  if (!current.user) { res.status(404).json({ error: "User not found" }); return; }
  if (current.user.id === staffUser(res).id) { res.status(409).json({ error: "You can't delete your own account while signed in." }); return; }
  const blocked = await protectedChange(res, current.user);
  if (blocked) { res.status(403).json({ error: blocked }); return; }
  if (formatUser(current.user).role === "admin" && (await countActiveAdmins()) <= 1) { res.status(409).json({ error: "This is the only active administrator." }); return; }
  const { error } = await supabaseAdmin!.auth.admin.deleteUser(params.data.id);
  await auditReq(req, res, { action: "user.delete", resource: "users", recordId: params.data.id, result: error ? "failure" : "success", before: { email: current.user.email, role: formatUser(current.user).role }, context: error ? { error: error.message } : undefined });
  if (error) { res.status(404).json({ error: error.message }); return; }
  res.sendStatus(204);
});

export default router;
