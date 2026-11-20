import { randomBytes, randomInt } from "crypto";
import { pool } from "@workspace/db";

/**
 * Rules shared by the Director's Admin Accounts module and the first-login credential change.
 * Passwords are only ever handed to Supabase Auth (which stores a bcrypt hash); nothing here keeps them.
 */
export const USERNAME_RULE = /^[a-z0-9._]{4,32}$/;
export const USERNAME_HELP = "4–32 characters: lowercase letters, numbers, dots or underscores";
export const PASSWORD_HELP = "At least 10 characters, with an uppercase letter, a lowercase letter, a number and a symbol";

export const normalizeUsername = (v: unknown) => String(v ?? "").trim().toLowerCase();

export function usernameProblem(username: string): string | null {
  return USERNAME_RULE.test(username) ? null : `Username must be ${USERNAME_HELP}.`;
}

export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < 10 || password.length > 72) return "Password must be 10 to 72 characters long.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return `Password must have ${PASSWORD_HELP.replace(/^At least 10 characters, with /, "")}.`;
  }
  if (username && password.toLowerCase().includes(username.toLowerCase())) return "Password must not contain the username.";
  return null;
}

/** A temporary password that meets the rules: 14 characters from an unambiguous alphabet */
export function temporaryPassword(): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%*?-"];
  const all = sets.join("");
  const chars = sets.map(s => s[randomInt(s.length)]);
  while (chars.length < 14) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

/** Supabase Auth needs an email for each login; administrators sign in with a username, so they get a placeholder that can never receive mail */
export const placeholderEmail = () => `admin-${randomBytes(6).toString("hex")}@staff.manilazoo.invalid`;

export type AdminAccountRow = {
  user_id: string; username: string; full_name: string; must_change_credentials: boolean; is_active: boolean;
  created_by: string | null; created_at: string; updated_at: string; credentials_changed_at: string | null; last_reset_at: string | null;
};

export async function findAdminByUsername(username: string): Promise<AdminAccountRow | null> {
  const { rows } = await pool.query<AdminAccountRow>("SELECT * FROM admin_accounts WHERE lower(username) = lower($1)", [username]);
  return rows[0] ?? null;
}

export async function findAdminById(userId: string): Promise<AdminAccountRow | null> {
  const { rows } = await pool.query<AdminAccountRow>("SELECT * FROM admin_accounts WHERE user_id = $1", [userId]);
  return rows[0] ?? null;
}
