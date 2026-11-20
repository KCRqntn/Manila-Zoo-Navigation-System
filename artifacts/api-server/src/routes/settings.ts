import { Router } from "express";
import { pool } from "@workspace/db";
import { requirePermission, staffUser, permissionsOf } from "../middleware/access";
import { auditReq } from "../lib/audit";
import { SETTINGS, getSettings } from "../lib/settings";

const router = Router();

/** Settings the visitor website needs (e.g. the public address the QR code opens). */
router.get("/settings/public", async (_req, res): Promise<void> => {
  res.json(await getSettings(true));
});

router.get("/admin/settings", requirePermission("dashboard.read"), async (_req, res): Promise<void> => {
  const values = await getSettings(false);
  res.json(Object.entries(SETTINGS).map(([key, d]) => ({ key, label: d.label, help: d.help, value: values[key], default: d.default })));
});

/**
 * Changes one setting. The public website address is part of the QR code, so editors (qr.write)
 * may change it; every other setting needs settings.manage (administrators).
 */
router.put("/admin/settings/:key", requirePermission("dashboard.read"), async (req, res): Promise<void> => {
  const key = String(req.params["key"]);
  const def = Object.prototype.hasOwnProperty.call(SETTINGS, key) ? SETTINGS[key]! : null;
  if (!def) { res.status(404).json({ error: "Unknown setting" }); return; }
  const user = staffUser(res);
  const needed = key === "public_site_url" ? "qr.write" : "settings.manage";
  if (!permissionsOf(user).includes(needed)) { res.status(403).json({ error: "Your role can't change this setting" }); return; }
  const value = req.body?.value;
  const problem = def.validate(value);
  if (problem) {
    await auditReq(req, res, { action: "setting.update", resource: "system_settings", recordId: key, result: "failure", context: { error: problem } });
    res.status(400).json({ error: problem });
    return;
  }
  const before = (await getSettings(false))[key];
  await pool.query(
    `INSERT INTO system_settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), user.email ?? null]);
  await auditReq(req, res, { action: key === "public_site_url" ? "qr.site_url_change" : "setting.update", resource: "system_settings", recordId: key, before: { value: before }, after: { value } });
  res.json({ key, value });
});

export default router;
