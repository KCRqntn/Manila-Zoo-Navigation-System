import { pool } from "@workspace/db";

/**
 * Settings administrators can change from the dashboard (System Settings), stored in
 * system_settings. Each has a validator, so a bad value never reaches the database.
 */
type SettingDef = { label: string; help: string; default: unknown; public: boolean; validate: (v: unknown) => string | null };

const isLocal = (host: string) => /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i.test(host);

export const SETTINGS: Record<string, SettingDef> = {
  public_site_url: {
    label: "Public website address",
    help: "The address the visitor QR code opens, e.g. https://manilazoo.example.com. Must be reachable from visitors' phones (not localhost).",
    default: "",
    public: true,
    validate: v => {
      if (v === "") return null;
      if (typeof v !== "string") return "Enter a web address";
      let u: URL;
      try { u = new URL(v); } catch { return "Enter a full web address starting with https://"; }
      if (u.protocol !== "https:") return "Use an https:// address (phones need HTTPS for GPS and the camera)";
      if (isLocal(u.hostname)) return "This is a local address; visitors' phones can't open it. Use the public address.";
      return null;
    },
  },
  show_entry_window: {
    label: "Show the welcome window",
    help: "Shows visitors the small welcome window (open website, QR code, admin login) once per visit.",
    default: true,
    public: true,
    validate: v => (typeof v === "boolean" ? null : "Choose yes or no"),
  },
  announcements_archive_after_days: {
    label: "Archive expired announcements after (days)",
    help: "Expired announcements are hidden right away; after this many days they're moved to Archived. 0 archives them as soon as they expire.",
    default: 7,
    public: false,
    validate: v => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 365 ? null : "Enter a whole number of days from 0 to 365"),
  },
};

export async function getSettings(onlyPublic = false): Promise<Record<string, unknown>> {
  const { rows } = await pool.query<{ key: string; value: unknown }>("SELECT key, value FROM system_settings");
  const stored = new Map(rows.map(r => [r.key, r.value]));
  return Object.fromEntries(Object.entries(SETTINGS)
    .filter(([, d]) => !onlyPublic || d.public)
    .map(([key, d]) => [key, stored.has(key) ? stored.get(key) : d.default]));
}

export async function getSetting<T>(key: keyof typeof SETTINGS): Promise<T> {
  const { rows } = await pool.query<{ value: T }>("SELECT value FROM system_settings WHERE key = $1", [key]);
  return (rows[0]?.value ?? SETTINGS[key]!.default) as T;
}
