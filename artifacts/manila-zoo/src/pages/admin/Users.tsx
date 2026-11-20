import React, { useState } from "react";
import { useListUsers, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Loader2, Search, Check, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { api, jsonBody, errorMessage, formatDateTime, useStaff } from "@/lib/adminApi";

/** Users & Roles (administrators): role changes, enabling/disabling accounts, and what each role can do. */
const ROLES = ["visitor", "viewer", "editor", "admin"];
/** Accounts created on the Admin Accounts page sign in with a username and carry a placeholder email */
const managedOnAdminAccounts = (email: string) => email.endsWith("@staff.manilazoo.invalid");
const ROLE_HELP: Record<string, string> = {
  director: "Everything, plus creating and managing administrator accounts",
  visitor: "Uses the website; can save favourites and earn game points",
  viewer: "Read-only access to the dashboard and submissions",
  editor: "Manages content, datasets, map and QR codes",
  admin: "Everything, including users, backups, audit logs and settings",
};

export default function AdminUsers() {
  const { data: users, isLoading, isError, error } = useListUsers();
  const { user: me } = useAuth();
  // Only the Director may give the administrator role or change administrator accounts (the server enforces this)
  const isDirector = useStaff().role === "director";
  const assignable = isDirector ? ROLES : ROLES.filter(r => r !== "admin");
  const lockReason = (u: { id: string; email: string; role: string }): string | null =>
    u.id === me?.id ? null
      : u.role === "director" ? "The Director account can't be changed here"
      : managedOnAdminAccounts(u.email) ? (isDirector ? "Manage this administrator on the Admin Accounts page" : "Only the Director manages administrator accounts")
      : u.role === "admin" && !isDirector ? "Only the Director manages administrator accounts"
      : null;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<{ id: string; email: string; change: Record<string, unknown>; text: string; destructive?: boolean; del?: boolean } | null>(null);
  const roles = useQuery({ queryKey: ["/api/auth/roles"], queryFn: () => api<{ roles: { role: string; permissions: string[] }[]; permissions: { id: string; label: string }[] }>("/api/auth/roles") });

  const apply = async () => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    try {
      if (p.del) await api(`/api/users/${p.id}`, { method: "DELETE" });
      else await api(`/api/users/${p.id}`, jsonBody("PATCH", p.change));
      toast({ title: p.del ? "User deleted" : "User updated" });
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch (err) {
      toast({ title: "Not changed", description: errorMessage(err), variant: "destructive" });
    }
  };

  const list = (Array.isArray(users) ? users : []).filter(u => !search || u.email.toLowerCase().includes(search.toLowerCase()) || (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>Role changes take effect at the user's next sign-in or page refresh. Every change is recorded in the audit log. The last active administrator can't be demoted, disabled or deleted.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search email or name…" className="pl-8" aria-label="Search users" />
          </div>
          {isLoading ? <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            : isError ? <p className="text-destructive">{errorMessage(error)}</p> : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead>Last login</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {list.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No users found.</TableCell></TableRow> : list.map(u => {
                    const self = u.id === me?.id;
                    const lock = lockReason(u);
                    if (lock) {
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium break-all">{managedOnAdminAccounts(u.email) ? <span className="text-muted-foreground">Admin account (signs in with a username)</span> : u.email}</TableCell>
                          <TableCell>{u.full_name || "—"}</TableCell>
                          <TableCell className="capitalize">{u.role}</TableCell>
                          <TableCell className={u.is_active ? "text-green-700" : "text-destructive"}>{u.is_active ? "Active" : "Disabled"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDateTime(u.created_at)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{u.last_login ? formatDateTime(u.last_login) : "Never"}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{lock}</TableCell>
                        </TableRow>
                      );
                    }
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium break-all">{u.email}{self && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</TableCell>
                        <TableCell>{u.full_name || "—"}</TableCell>
                        <TableCell>
                          {self && !assignable.includes(u.role) ? <span className="capitalize">{u.role}</span> : (
                          <Select value={u.role} disabled={self}
                            onValueChange={role => setPending({ id: u.id, email: u.email, change: { role }, text: `Change ${u.email} from ${u.role} to ${role}? ${ROLE_HELP[role]}.`, destructive: role === "admin" })}>
                            <SelectTrigger className="w-32" aria-label={`Role of ${u.email}`}><SelectValue /></SelectTrigger>
                            <SelectContent>{assignable.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                          </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" disabled={self} className={u.is_active ? "text-green-700" : "text-destructive"}
                            onClick={() => setPending({ id: u.id, email: u.email, change: { is_active: !u.is_active }, text: u.is_active ? `Disable ${u.email}? They won't be able to sign in.` : `Enable ${u.email} again?`, destructive: u.is_active })}>
                            {u.is_active ? "Active" : "Disabled"}
                          </Button>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateTime(u.created_at)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.last_login ? formatDateTime(u.last_login) : "Never"}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={self} aria-label={`Delete ${u.email}`} title={self ? "You can't delete yourself" : "Delete user"}
                            onClick={() => setPending({ id: u.id, email: u.email, change: {}, del: true, destructive: true, text: `Delete ${u.email} permanently? Their favourites and game progress will no longer be linked to an account.` })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What each role can do</CardTitle>
          <CardDescription>Enforced by the server on every request; the dashboard only hides what a role can't use.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {roles.data && (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Permission</TableHead>
                {roles.data.roles.map(r => <TableHead key={r.role} className="text-center capitalize">{r.role}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {roles.data.permissions.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{p.label}</TableCell>
                    {roles.data!.roles.map(r => (
                      <TableCell key={r.role} className="text-center">
                        {r.permissions.includes(p.id) ? <Check className="mx-auto h-4 w-4 text-green-600" aria-label="yes" /> : <Minus className="mx-auto h-4 w-4 text-muted-foreground" aria-label="no" />}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Visitors have none of these; they use the public website only.</p>
        </CardContent>
      </Card>

      {pending && (
        <ConfirmDialog open onOpenChange={o => !o && setPending(null)} title={pending.del ? "Delete user?" : "Change user?"}
          description={pending.text} confirmLabel={pending.del ? "Delete" : "Confirm"} destructive={pending.destructive} onConfirm={apply} />
      )}
    </div>
  );
}
