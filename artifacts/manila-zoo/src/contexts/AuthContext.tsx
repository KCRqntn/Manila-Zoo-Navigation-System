import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { customFetch } from "@workspace/api-client-react";
import { supabase } from "../lib/supabase";

type User = {
  id: string;
  email?: string;
  role: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  /** True when a saved login ended without the person logging out (expired, revoked or idle too long) */
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Session policy. Supabase Auth keeps the login: a short-lived access token (renewed automatically)
 * and a refresh token, saved in this browser so closing the tab or restarting the phone keeps the
 * visitor logged in. The server never trusts the browser: every API call is checked with Supabase.
 * On top of that, a login that hasn't been used for a while ends here, on this device:
 *  - visitors: after 30 days without opening the site (their own phone)
 *  - staff: after 12 hours without activity (shared office computers)
 * When a saved login ends without "Log out" (expired, revoked, or idle), sessionExpired is set so the
 * page can say so and offer the login again. Logging out ends the session on the server as well.
 */
const IDLE_LIMIT_MS = { visitor: 30 * 24 * 3600_000, staff: 12 * 3600_000 };
const LAST_ACTIVE_KEY = "mz-last-active";
const STAFF_ROLES = ["director", "admin", "editor", "viewer"];
const roleOf = (s: Session) => (s.user.app_metadata?.["role"] as string) || "visitor";
const toUser = (s: Session): User => ({ id: s.user.id, email: s.user.email, role: roleOf(s) });
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: policy still checked by the server */ } },
};
/** Whether this browser holds a saved Supabase login (checked before Supabase loads it) */
const hasSavedLogin = () => { try { return Object.keys(localStorage).some(k => k.startsWith("sb-") && k.endsWith("-auth-token")); } catch { return false; } };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const hadLogin = hasSavedLogin();
    // Read before anything on this page load can update it
    const lastActive = Number(store.get(LAST_ACTIVE_KEY) ?? Date.now());
    // The saved login is checked once below; until then, ignore Supabase's own startup report
    let checked = false;

    supabase.auth.getSession().then(async ({ data: { session } }: { data: { session: Session | null } }) => {
      if (session?.user) {
        const limit = STAFF_ROLES.includes(roleOf(session)) ? IDLE_LIMIT_MS.staff : IDLE_LIMIT_MS.visitor;
        if (Date.now() - lastActive > limit) {
          // Idle too long on this device: end the login (on the server too) and say why
          await supabase.auth.signOut().catch(() => {});
          setSessionExpired(true);
          setUser(null);
        } else {
          store.set(LAST_ACTIVE_KEY, String(Date.now()));
          setUser(toUser(session));
        }
      } else if (hadLogin) {
        // A saved login could not be renewed (expired or revoked)
        setSessionExpired(true);
      }
      checked = true;
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string, session: Session | null) => {
      if (!checked) return;
      if (session?.user) {
        setUser(toUser(session));
        setSessionExpired(false);
        store.set(LAST_ACTIVE_KEY, String(Date.now()));
      } else {
        setUser(null);
      }
      setLoading(false);
      void event;
    });

    // Activity keeps the login alive (recorded at most once a minute)
    let lastWrite = 0;
    const touch = () => { if (Date.now() - lastWrite > 60_000) { lastWrite = Date.now(); store.set(LAST_ACTIVE_KEY, String(lastWrite)); } };
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("keydown", touch);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, []);

  const signOut = async () => {
    // Recorded in the audit log by the server before the session ends; signOut() also revokes the
    // refresh token on the server, so the old login can't be renewed
    await customFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    await supabase.auth.signOut();
    setSessionExpired(false);
  };
  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  return (
    <AuthContext.Provider value={{ user, loading, sessionExpired, clearSessionExpired, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
