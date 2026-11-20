import { AuthClient } from '@supabase/auth-js'

// The website only uses Supabase for logging in (all data goes through our own /api), so it loads
// just the login client instead of the full supabase-js bundle (database, storage, realtime): about
// a third less JavaScript before the first page can show.
//
// Same settings supabase-js gives its login client, including the storage key, so a login saved by
// the earlier version is still found. The login is kept in this browser (survives closing the tab
// and restarting the phone) and its access token is renewed automatically; see the session policy
// in contexts/AuthContext.tsx
const url = new URL(import.meta.env.VITE_SUPABASE_URL || "https://placeholder-url.supabase.co")
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-key"

export const supabase = {
  auth: new AuthClient({
    url: new URL("auth/v1", url.href.endsWith("/") ? url.href : url.href + "/").href,
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    storageKey: `sb-${url.hostname.split(".")[0]}-auth-token`,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "implicit",
  }),
}
