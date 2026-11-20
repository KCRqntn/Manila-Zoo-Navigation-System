import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * Creates a login account, or changes an existing account's role.
 *
 *   pnpm create-director <email> [password] [full name]  → Director (creates and manages administrators)
 *   pnpm create-admin    <email> [password] [full name]  → administrator
 *   pnpm create-tourist  <email> [password] [full name]  → tourist (visitor)
 *
 * The password is required for a new account and optional for an existing one (given = reset).
 * The role is stored in app_metadata, which only this service key can change.
 */
const args = process.argv.slice(2);
const tourist = args.includes("--tourist");
const director = args.includes("--director");
const [email, password, ...nameParts] = args.filter(a => a !== "--tourist" && a !== "--director");

const role = tourist ? "visitor" : director ? "director" : "admin";
const label = tourist ? "tourist" : director ? "Director" : "administrator";
const command = tourist ? "create-tourist" : director ? "create-director" : "create-admin";
const fullName = nameParts.join(" ") || (tourist ? "Zoo Visitor" : director ? "Zoo Director" : "Zoo Administrator");

const url = process.env["VITE_SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/** Explains the common "can't reach Supabase" failure instead of a bare "fetch failed". */
function explain(message: string): string {
  if (!/fetch failed/i.test(message)) return message;
  return `Can't reach Supabase at ${new URL(url!).host}. If your internet works, the Supabase project is paused or ` +
    "deleted: open https://supabase.com/dashboard, restore it, then run this again.";
}

async function findUser(supabase: SupabaseClient, target: string): Promise<User | undefined> {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(explain(`Could not list users: ${error.message}`));
    const hit = data.users.find(u => u.email?.toLowerCase() === target.toLowerCase());
    if (hit || data.users.length < 1000) return hit;
  }
}

async function run() {
  if (!email || !email.includes("@")) fail(`Usage: pnpm ${command} <email> [password] [full name]`);
  if (password != null && password.length < 8) fail("Use a password of at least 8 characters.");
  if (!url || !serviceKey) fail("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the project's .env file.");

  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const existing = await findUser(supabase, email);

  let user: User;
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      app_metadata: { ...existing.app_metadata, role },
      email_confirm: true,
      ...(password ? { password } : {}),
    });
    if (error || !data.user) fail(`Could not update ${email}: ${error?.message}`);
    user = data.user;
    console.log(`✔ ${email} is now ${tourist ? "a tourist" : director ? "the Director" : "an administrator"} account${password ? " (password reset)" : ""}.`);
  } else {
    if (!password) fail(`No account for ${email} yet, so a password is needed to create it.`);
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no confirmation email needed
      app_metadata: { role },
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) fail(`Could not create ${email}: ${error?.message}`);
    user = data.user;
    console.log(`✔ Created ${label} account ${email}.`);
  }

  // Supabase deployments also check public.profiles.role in their row-level security policies.
  // The table doesn't exist when only Supabase Auth is used, so a failure here is fine.
  const { error: profileError } = await supabase.from("profiles").upsert({ id: user.id, email, full_name: fullName, role });
  if (!profileError) console.log(`✔ Supabase profile set to ${role}.`);

  console.log(tourist
    ? "Sign in at /login to use the zoo as a visitor (favorites, chat history)."
    : "Sign in at /login; you'll be taken to the admin dashboard.");
}

run().catch(err => fail(explain(err instanceof Error ? err.message : String(err))));
