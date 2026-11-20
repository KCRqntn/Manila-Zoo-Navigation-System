import type { RequestHandler } from "express";
import type { User } from "@supabase/supabase-js";
import { requirePermission } from "./access";
import { audit, actorFrom } from "../lib/audit";

/**
 * Staff access for the dashboard's content routes (animals, map, QR, events, FAQ, games…):
 * reading needs "dashboard.read" (admin, editor, viewer), changing needs "content.write"
 * (admin, editor). Sensitive routes use requirePermission directly (users, backups, audit, settings).
 * Roles come from app_metadata, which only the service key can change; see middleware/access.ts.
 *
 * Every change made through these routes is written to the audit log when the response is sent,
 * with its result (success or failure by status code). Routes that log their own detailed
 * before/after records (datasets, map versions, backups…) use requirePermission instead.
 */
const readAccess = requirePermission("dashboard.read");
const writeAccess = requirePermission("content.write");

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") { readAccess(req, res, next); return; }
  writeAccess(req, res, () => {
    res.on("finish", () => {
      const path = req.originalUrl.split("?")[0]!.replace(/^\/api/, "");
      const parts = path.split("/").filter(Boolean);
      const recordId = parts.find(p => /^\d+$/.test(p)) ?? null;
      void audit(actorFrom(res.locals["user"] as User | undefined), {
        action: `${req.method.toLowerCase()} ${parts.map(p => (/^\d+$/.test(p) ? ":id" : p)).join("/")}`,
        resource: parts[0] ?? "api",
        recordId,
        result: res.statusCode < 400 ? "success" : "failure",
        context: { status: res.statusCode },
      }, req);
    });
    next();
  });
};
