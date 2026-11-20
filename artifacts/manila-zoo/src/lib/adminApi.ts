import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

/** Shared helpers for the admin dashboard's newer pages (datasets, backups, audit log…). */

export const STAFF_ROLES = ["director", "admin", "editor", "viewer"] as const;
export const isStaffRole = (role: string | undefined) => !!role && (STAFF_ROLES as readonly string[]).includes(role);

export type Permission =
  | "dashboard.read" | "content.write" | "map.write" | "qr.write" | "submissions.read" | "submissions.write"
  | "users.manage" | "audit.read" | "backup.manage" | "settings.manage" | "admins.manage";

export type Me = {
  id: string; email: string; username: string | null; full_name: string | null;
  role: string; permissions: Permission[]; must_change_credentials: boolean;
};

/** The server's message for a failed request ("Only verified prices can be published…"), else a generic one. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const data = (err as { data?: { error?: string } } | null)?.data;
  if (data?.error) return data.error;
  return err instanceof Error && err.message ? err.message : fallback;
}

export const api = <T,>(path: string, init?: RequestInit & { responseType?: "json" | "text" | "blob" }) => customFetch<T>(path, init);
export const jsonBody = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Downloads a file from the API (sent with the login token, unlike a plain link). */
export async function downloadFile(path: string, fileName: string): Promise<void> {
  const blob = await customFetch<Blob>(path, { responseType: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** The signed-in staff member's role and permissions, from the server (the server enforces them too). */
export function useStaff() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["/api/auth/me", user?.id],
    queryFn: () => api<Me>("/api/auth/me"),
    enabled: !!user,
    staleTime: 60_000,
  });
  return {
    role: q.data?.role ?? user?.role ?? "visitor",
    can: (p: Permission) => !!q.data?.permissions.includes(p),
    loading: q.isLoading,
    /** A new or reset administrator who must set their own username and password first */
    mustChangeCredentials: !!q.data?.must_change_credentials,
    username: q.data?.username ?? null,
    fullName: q.data?.full_name ?? null,
    refetch: q.refetch,
  };
}

/** "Oct 21, 2026, 9:05 AM" in Manila time, or "—". */
export function formatDateTime(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${n} B`;
}
