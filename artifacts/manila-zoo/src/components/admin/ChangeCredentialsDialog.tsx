import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Check, KeyRound, Loader2, LogOut, X } from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { api, jsonBody, errorMessage } from "@/lib/adminApi";

/**
 * Shown over the dashboard when a new (or reset) administrator signs in with the default credentials
 * from the Director. It can't be closed: the dashboard stays locked, here and on the server, until a new
 * username and password are saved. The same rules are checked again on the server.
 */
const RULES: { label: string; test: (p: string, u: string) => boolean }[] = [
  { label: "10 or more characters", test: p => p.length >= 10 },
  { label: "An uppercase and a lowercase letter", test: p => /[A-Z]/.test(p) && /[a-z]/.test(p) },
  { label: "A number", test: p => /\d/.test(p) },
  { label: "A symbol (for example ! @ # $)", test: p => /[^A-Za-z0-9]/.test(p) },
  { label: "Doesn't contain the username", test: (p, u) => !u || !p.toLowerCase().includes(u) },
];
const USERNAME_RULE = /^[a-z0-9._]{4,32}$/;

type Field = "current_password" | "new_username" | "new_password" | "confirm_password";

export function ChangeCredentialsDialog({ defaultUsername }: { defaultUsername: string | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [current, setCurrent] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ field?: Field; message: string } | null>(null);

  const u = username.trim().toLowerCase();
  const usernameOk = USERNAME_RULE.test(u) && u !== (defaultUsername ?? "").toLowerCase();
  const rulesOk = RULES.every(r => r.test(password, u));
  const matches = password.length > 0 && password === confirm;
  const ready = current.length > 0 && usernameOk && rulesOk && matches && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api<{ access_token?: string; refresh_token?: string; username?: string; signed_out?: boolean }>(
        "/api/auth/change-credentials",
        jsonBody("POST", { current_password: current, new_username: u, new_password: password, confirm_password: confirm }),
      );
      if (result.access_token && result.refresh_token) {
        // Earlier sessions were ended on the server; continue with the new one
        await supabase.auth.setSession({ access_token: result.access_token, refresh_token: result.refresh_token });
        await qc.invalidateQueries();
        toast({ title: "Credentials saved", description: `From now on, sign in as "${result.username}" with your new password.` });
      } else {
        toast({ title: "Credentials saved", description: "Sign in again with your new username and password." });
        setLocation("/login");
        await signOut();
      }
    } catch (err) {
      const field = (err as { data?: { field?: Field } }).data?.field;
      setError({ field, message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (f: Field) => error?.field === f ? <p className="text-xs font-medium text-destructive">{error.message}</p> : null;

  return (
    <AlertDialog open>
      <AlertDialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md" onEscapeKeyDown={e => e.preventDefault()}>
        <AlertDialogHeader>
          <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary sm:mx-0"><KeyRound className="h-5 w-5" /></div>
          <AlertDialogTitle>Set your own username and password</AlertDialogTitle>
          <AlertDialogDescription>
            You signed in with the default credentials from the Director. Replace them to open the dashboard. The default username and password stop working once you save.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="cc-current">Temporary password</Label>
            <PasswordInput id="cc-current" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} />
            <p className="text-xs text-muted-foreground">The password the Director gave you.</p>
            {fieldError("current_password")}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc-username">New username</Label>
            <Input id="cc-username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username}
              onChange={e => setUsername(e.target.value)} placeholder="e.g. juan.delacruz" aria-invalid={username.length > 0 && !usernameOk} />
            <p className={`text-xs ${username && !usernameOk ? "text-destructive" : "text-muted-foreground"}`}>
              {username && u === (defaultUsername ?? "").toLowerCase() ? "Choose a username different from the default one." : "4–32 characters: lowercase letters, numbers, dots or underscores."}
            </p>
            {fieldError("new_username")}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc-password">New password</Label>
            <PasswordInput id="cc-password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
            <ul className="grid gap-1 pt-1 text-xs" aria-label="Password requirements">
              {RULES.map(r => {
                const ok = r.test(password, u);
                return (
                  <li key={r.label} className={`flex items-center gap-1.5 ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
                    {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {r.label}
                  </li>
                );
              })}
            </ul>
            {fieldError("new_password")}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc-confirm">Confirm new password</Label>
            <PasswordInput id="cc-confirm" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} aria-invalid={confirm.length > 0 && !matches} />
            {confirm.length > 0 && !matches && <p className="text-xs text-destructive">The passwords don't match.</p>}
            {fieldError("confirm_password")}
          </div>

          {error && !error.field && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error.message}</p>}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" className="text-muted-foreground" onClick={() => { setLocation("/"); void signOut(); }}>
              <LogOut className="mr-2 h-4 w-4" /> Log out
            </Button>
            <Button type="submit" disabled={!ready}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save and continue
            </Button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
