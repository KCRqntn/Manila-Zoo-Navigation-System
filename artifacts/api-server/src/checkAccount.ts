import { createClient } from "@supabase/supabase-js";

/**
 * Read-only account check: does a login exist, is it confirmed, which role, last sign-in.
 *   pnpm --filter @workspace/api-server exec tsx --env-file=../../.env ./src/checkAccount.ts <email> [email...]
 * Prints no passwords or keys.
 */
const emails = process.argv.slice(2).map(e => e.toLowerCase());
const url = process.env["VITE_SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !serviceKey) { console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"); process.exit(1); }

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (error) { console.error(`Could not list users: ${error.message}`); process.exit(1); }

console.log(`Supabase project: ${new URL(url).host} · ${data.users.length} account(s) in total`);
for (const email of emails) {
  const u = data.users.find(x => x.email?.toLowerCase() === email);
  if (!u) { console.log(`✖ ${email}: no account`); continue; }
  console.log(`✔ ${email}: role=${u.app_metadata?.["role"] ?? "visitor"} · confirmed=${u.email_confirmed_at ? "yes" : "NO"} · created=${u.created_at} · last sign-in=${u.last_sign_in_at ?? "never"} · providers=${(u.app_metadata?.["providers"] as string[] | undefined)?.join(",") ?? "email"}`);
}
