import { createClient, type User } from "@supabase/supabase-js";
import type { RequestHandler, Response } from "express";

const supabaseUrl = process.env["VITE_SUPABASE_URL"];
const supabaseAnonKey = process.env["VITE_SUPABASE_ANON_KEY"];
const supabase = supabaseUrl && supabaseAnonKey && !supabaseUrl.includes("placeholder") && !supabaseAnonKey.includes("placeholder")
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

/**
 * Requires a signed-in visitor. The token is verified with Supabase (never trusted as-is), so
 * things like game points can't be claimed for someone else. The user is in res.locals.user.
 */
export const requireUser: RequestHandler = async (req, res, next) => {
  if (!supabase) {
    res.status(503).json({ error: "Supabase authentication is not configured" });
    return;
  }
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Please log in first" });
    return;
  }
  const { data, error } = await supabase.auth.getUser(authorization.slice("Bearer ".length));
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid authentication token" });
    return;
  }
  res.locals["user"] = data.user;
  next();
};

export const currentUser = (res: Response): User => res.locals["user"] as User;

/** Short public name for leaderboards: "Maria S." from the sign-up name, else part of the email. */
export function publicName(user: User): string {
  const full = String(user.user_metadata?.["full_name"] ?? "").trim();
  if (full) {
    const parts = full.split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.` : parts[0]!;
  }
  const local = (user.email ?? "Visitor").split("@")[0]!;
  return `${local.slice(0, 3)}***`;
}
