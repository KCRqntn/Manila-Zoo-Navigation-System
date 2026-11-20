import { createClient, type User } from "@supabase/supabase-js";
import type { Request, RequestHandler, Response } from "express";

/**
 * Role-based access control, enforced here on the server (the dashboard only hides what a role
 * can't use). The role is read from the account's app_metadata, which only the service key can
 * change, never from anything the browser sends.
 */
export const STAFF_ROLES = ["director", "admin", "editor", "viewer"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
/** Roles only the Director may create, change or remove */
export const PROTECTED_ROLES: readonly string[] = ["director", "admin"];

export const PERMISSIONS = {
  "dashboard.read": "View the dashboard, reports and records",
  "content.write": "Manage animals, datasets, events, announcements, FAQ and games",
  "map.write": "Edit map locations, buildings and walkways",
  "qr.write": "Manage QR codes and the visitor QR settings",
  "submissions.read": "View visitor form submissions",
  "submissions.write": "Update submission status and export submissions",
  "users.manage": "Change user roles and accounts",
  "audit.read": "View and export audit logs",
  "backup.manage": "Create backups and restore data",
  "settings.manage": "Change system settings",
  "admins.manage": "Create, deactivate, reactivate and reset administrator accounts (Director only)",
} as const;
export type Permission = keyof typeof PERMISSIONS;

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];
export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  director: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter(p => p !== "admins.manage"),
  editor: ["dashboard.read", "content.write", "map.write", "qr.write", "submissions.read", "submissions.write"],
  viewer: ["dashboard.read", "submissions.read"],
};

export const roleOf = (user: User): string => String(user.app_metadata?.["role"] ?? "visitor");
/** A new or reset administrator must choose their own username and password before using the dashboard */
export const mustChangeCredentials = (user: User): boolean => user.app_metadata?.["must_change_credentials"] === true;
/** Disabled accounts are banned in Supabase; their tokens stop working at once, not only at the next refresh */
const isDisabled = (user: User): boolean => !!user.banned_until && new Date(user.banned_until) > new Date();
export const permissionsOf = (user: User): Permission[] =>
  mustChangeCredentials(user) ? [] : ROLE_PERMISSIONS[roleOf(user) as StaffRole] ?? [];
export const can = (user: User, permission: Permission) => permissionsOf(user).includes(permission);

const supabaseUrl = process.env["VITE_SUPABASE_URL"];
const supabaseAnonKey = process.env["VITE_SUPABASE_ANON_KEY"];
const authClient = supabaseUrl && supabaseAnonKey && !supabaseUrl.includes("placeholder") && !supabaseAnonKey.includes("placeholder")
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

/** The signed-in account behind a request's bearer token, verified with Supabase; null if none or invalid. */
export async function verifiedUser(req: Request): Promise<User | null> {
  const authorization = req.headers.authorization;
  if (!authClient || !authorization?.startsWith("Bearer ")) return null;
  const { data, error } = await authClient.auth.getUser(authorization.slice("Bearer ".length));
  return error || !data.user || isDisabled(data.user) ? null : data.user;
}

/** The staff member making the request (set by requirePermission). */
export const staffUser = (res: Response): User => res.locals["user"] as User;

/** Allows the request only for a signed-in account whose role has the permission. */
export function requirePermission(permission: Permission): RequestHandler {
  return async (req, res, next) => {
    if (!authClient) { res.status(503).json({ error: "Supabase authentication is not configured" }); return; }
    if (!req.headers.authorization?.startsWith("Bearer ")) { res.status(401).json({ error: "Bearer authentication is required" }); return; }
    const user = await verifiedUser(req);
    if (!user) { res.status(401).json({ error: "Invalid authentication token" }); return; }
    if (mustChangeCredentials(user)) {
      res.status(403).json({ error: "Set your own username and password before using the dashboard.", code: "credentials_change_required" });
      return;
    }
    if (!can(user, permission)) {
      res.status(403).json({ error: `Your role (${roleOf(user)}) can't do this: ${PERMISSIONS[permission].toLowerCase()}` });
      return;
    }
    res.locals["user"] = user;
    next();
  };
}
