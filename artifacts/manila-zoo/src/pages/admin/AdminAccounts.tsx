import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Loader2, Lock, Power, RefreshCw, RotateCcw, Search, UserPlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { api, jsonBody, errorMessage, formatDateTime, useStaff } from "@/lib/adminApi";

/**
 * Admin Account Management (Director only). The Director creates administrator accounts with a default
 * username and temporary password; the administrator must replace both at first sign-in. Accounts can be
 * deactivated, reactivated and reset. The server allows all of this only for the Director's role.
 */
type AdminAccount = {
  user_id: string; username: string; full_name: string; must_change_credentials: boolean; is_active: boolean;
  created_by: string | null; created_at: string; credentials_changed_at: string | null; last_reset_at: string | null; last_login: string | null;
};
type Handover = { title: string; username: string; password: string; name: string };
type Pending = { kind: "deactivate" | "reactivate" | "reset"; account: AdminAccount };

const KEY = ["/api/admin-accounts"];

function copyText(text: string, done: () => void) {
  navigator.clipboard?.writeText(text).then(done, () => {});
}

function StatusBadge({ a }: { a: AdminAccount }) {
  if (!a.is_active) return <Badge variant="outline" className="border-destructive/40 text-destructive">Deactivated</Badge>;
  if (a.must_change_credentials) return <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">Waiting for first sign-in</Badge>;
  return <Badge variant="outline" className="border-emerald-500/50 text-emerald-700 dark:text-emerald-300">Active</Badge>;
}

export default function AdminAccounts() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const staff = useStaff();
  const allowed = staff.can("admins.manage");
  const accounts = useQuery({ queryKey: KEY, queryFn: () => api<AdminAccount[]>("/api/admin-accounts"), enabled: allowed });

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [handover, setHandover] = useState<Handover | null>(null);

  const suggest = async (keepUsername = false) => {
    try {
      const s = await api<{ username: string; password: string }>("/api/admin-accounts/suggestion");
      if (!keepUsername) setUsername(s.username);
      setPassword(s.password);
    } catch { /* the fields can still be typed in */ }
  };
  useEffect(() => { if (allowed) void suggest(); }, [allowed]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await api<AdminAccount>("/api/admin-accounts", jsonBody("POST", { full_name: fullName, username, password }));
      setHandover({ title: "Administrator account created", username: created.username, password, name: created.full_name });
      setFullName("");
      await suggest();
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (err) {
      toast({ title: "Account not created", description: errorMessage(err), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const run = async () => {
    if (!pending) return;
    const { kind, account } = pending;
    setPending(null);
    setBusyId(account.user_id);
    try {
      if (kind === "reset") {
        const r = await api<{ username: string; temporary_password: string }>(`/api/admin-accounts/${account.user_id}/reset`, jsonBody("POST", {}));
        setHandover({ title: "Account reset", username: r.username, password: r.temporary_password, name: account.full_name });
      } else {
        await api(`/api/admin-accounts/${account.user_id}/${kind}`, jsonBody("POST", {}));
        toast({ title: kind === "deactivate" ? `${account.username} deactivated` : `${account.username} reactivated` });
      }
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (err) {
      toast({ title: "Not changed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (staff.loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!allowed) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Only the Director can manage administrator accounts.</p>
          <p className="text-sm text-muted-foreground">Ask the Director if you need an administrator account created, deactivated or reset.</p>
        </CardContent>
      </Card>
    );
  }

  const list = (accounts.data ?? []).filter(a => !search || `${a.full_name} ${a.username}`.toLowerCase().includes(search.toLowerCase()));
  const confirmText: Record<Pending["kind"], (a: AdminAccount) => { title: string; text: string; label: string; destructive: boolean }> = {
    deactivate: a => ({ title: `Deactivate ${a.username}?`, text: `${a.full_name} is signed out at once and can't sign in until you reactivate the account. Their work and history are kept.`, label: "Deactivate", destructive: true }),
    reactivate: a => ({ title: `Reactivate ${a.username}?`, text: `${a.full_name} can sign in again with their current username and password.`, label: "Reactivate", destructive: false }),
    reset: a => ({ title: `Reset ${a.username}?`, text: `A new temporary password replaces the current one, which stops working at once. At the next sign-in, ${a.full_name} must choose a new username and password again.`, label: "Reset account", destructive: true }),
  };
  const c = pending ? confirmText[pending.kind](pending.account) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /> Create administrator account</CardTitle>
          <CardDescription>
            Give the new administrator these default credentials. At their first sign-in they must choose their own username and password, and the defaults stop working.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="aa-name">Full name</Label>
              <Input id="aa-name" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Maria Santos" required minLength={2} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aa-username">Default username</Label>
              <Input id="aa-username" value={username} onChange={e => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" spellCheck={false} required />
              <p className="text-xs text-muted-foreground">4–32 lowercase letters, numbers, dots or underscores.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aa-password">Temporary password</Label>
              <div className="flex gap-2">
                <Input id="aa-password" value={password} onChange={e => setPassword(e.target.value)} className="font-mono" autoComplete="off" spellCheck={false} required />
                <Button type="button" variant="outline" size="icon" onClick={() => suggest(true)} aria-label="Generate another password" title="Generate another password"><RefreshCw className="h-4 w-4" /></Button>
              </div>
              <p className="text-xs text-muted-foreground">10+ characters with upper and lower case, a number and a symbol.</p>
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={creating || fullName.trim().length < 2 || !username || !password}>
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />} Create account
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Administrator accounts</CardTitle>
          <CardDescription>Every change here is recorded in the audit log. Passwords are never shown again after you hand them over; reset an account to issue a new one.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or username…" className="pl-8" aria-label="Search administrator accounts" />
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.isLoading ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
                ) : accounts.isError ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-destructive">{errorMessage(accounts.error)}</TableCell></TableRow>
                ) : list.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">{search ? "No accounts match your search." : "No administrator accounts yet. Create the first one above."}</TableCell></TableRow>
                ) : list.map(a => (
                  <TableRow key={a.user_id}>
                    <TableCell className="font-medium">{a.full_name}</TableCell>
                    <TableCell className="font-mono text-sm">{a.username}</TableCell>
                    <TableCell><StatusBadge a={a} /></TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(a.created_at)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(a.last_login)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {busyId === a.user_id ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setPending({ kind: "reset", account: a })}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset</Button>
                            {a.is_active
                              ? <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setPending({ kind: "deactivate", account: a })}><Power className="mr-1.5 h-3.5 w-3.5" /> Deactivate</Button>
                              : <Button size="sm" variant="outline" onClick={() => setPending({ kind: "reactivate", account: a })}><Power className="mr-1.5 h-3.5 w-3.5" /> Reactivate</Button>}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {c && pending && (
        <ConfirmDialog open onOpenChange={o => { if (!o) setPending(null); }} title={c.title} description={<p>{c.text}</p>}
          confirmLabel={c.label} destructive={c.destructive} onConfirm={run} />
      )}

      <Dialog open={!!handover} onOpenChange={o => { if (!o) setHandover(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> {handover?.title}</DialogTitle>
            <DialogDescription>
              Give these credentials to {handover?.name} in person or through a private channel. The password is shown only now.
            </DialogDescription>
          </DialogHeader>
          {handover && (
            <div className="space-y-3">
              {([["Username", handover.username], ["Temporary password", handover.password]] as const).map(([label, value]) => (
                <div key={label} className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 select-all rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">{value}</code>
                    <Button type="button" variant="outline" size="icon" aria-label={`Copy ${label.toLowerCase()}`} onClick={() => copyText(value, () => toast({ title: `${label} copied` }))}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">They sign in at <span className="font-medium text-foreground">/login</span> with this username, then set their own username and password before the dashboard opens.</p>
            </div>
          )}
          <DialogFooter><Button onClick={() => setHandover(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
