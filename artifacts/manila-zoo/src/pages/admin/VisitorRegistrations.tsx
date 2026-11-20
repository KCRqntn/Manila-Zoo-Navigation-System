import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, KeyRound, Loader2, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { api, downloadFile, errorMessage, formatDateTime, jsonBody, useStaff } from "@/lib/adminApi";
import { VisitorStats } from "@/components/admin/VisitorStats";

/** Saved visitor registrations (from the website QR code) and the visitor numbers built from them. */
type Registration = { id: string; user_id: string | null; visit_no: number | null; account_visits: number; full_name: string; email: string; phone: string; age: number; sex: string; party_size: number; companions: number; visit_date: string; created_at: string;
  children: number; adults: number; seniors: number; pwd: number; member_ages: string | null };
type Page = { rows: Registration[]; total: number; people: number; page: number; page_size: number };

export default function VisitorRegistrations() {
  const { toast } = useToast();
  const staff = useStaff();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  // One visitor's visit history (from clicking their name)
  const [account, setAccount] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const [withContact, setWithContact] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Forgotten visitor password: confirm, then show the temporary password once
  const [resetAsk, setResetAsk] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  const params = new URLSearchParams({ page: String(page), page_size: "20", ...(search ? { search } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(account ? { user_id: account } : {}) });
  const q = useQuery({ queryKey: ["/api/admin/visitor-registrations", params.toString()], queryFn: () => api<Page>(`/api/admin/visitor-registrations?${params}`) });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.page_size)) : 1;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const p = new URLSearchParams({ ...(search ? { search } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(withContact ? { include_contact: "1" } : {}) });
      await downloadFile(`/api/admin/visitor-registrations-export.csv?${p}`, `visitor-registrations-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      toast({ title: "Export failed", description: errorMessage(err), variant: "destructive" });
    } finally { setExporting(false); }
  };

  const resetPassword = async () => {
    if (!account) return;
    setResetting(true);
    try {
      const r = await api<{ email: string; temporary_password: string }>(`/api/admin/visitor-accounts/${account}/reset-password`, jsonBody("POST", {}));
      setTempPassword({ email: r.email, password: r.temporary_password });
    } catch (err) {
      toast({ title: "Couldn't reset the password", description: errorMessage(err), variant: "destructive" });
    } finally { setResetting(false); setResetAsk(false); }
  };

  return (
    <div className="space-y-6">
      <VisitorStats />

      <Card>
        <CardHeader>
          <CardTitle>Visit records</CardTitle>
          <CardDescription>
            Visit history: each row is one visit (a visitor coming back makes a new row; earlier visits are never changed). "Group size" is the registered visitor plus their companions that day, each counted once; PWD visitors are also counted in their age group. Click a name to see that visitor's visits. Viewing and exporting is recorded in the audit log.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); setPage(1); q.refetch(); }}>
            <div className="min-w-[200px] flex-1 space-y-1.5">
              <Label htmlFor="vr-search">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input id="vr-search" className="pl-8" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Name, email or phone" />
              </div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="vr-from">From</Label><Input id="vr-from" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></div>
            <div className="space-y-1.5"><Label htmlFor="vr-to">To</Label><Input id="vr-to" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></div>
            {staff.can("submissions.write") && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={withContact} onCheckedChange={v => setWithContact(v === true)} /> Include email &amp; phone</label>
                <Button type="button" variant="outline" onClick={exportCsv} disabled={exporting}>
                  {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Export CSV
                </Button>
              </div>
            )}
          </form>

          {account && (
            <p className="flex items-center gap-2 rounded-lg bg-muted p-2 text-sm">
              Showing the visits of <span className="font-medium">{accountName}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setAccount(null); setPage(1); }}>Show everyone</Button>
              {staff.can("users.manage") && (
                <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => setResetAsk(true)} disabled={resetting}>
                  {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />} Reset password
                </Button>
              )}
            </p>
          )}
          {q.data && (
            <p className="text-sm text-muted-foreground">
              {q.data.total.toLocaleString()} visit{q.data.total === 1 ? "" : "s"} · {q.data.people.toLocaleString()} attendance (visitors + companions){search || from || to || account ? " (filtered)" : ""}
            </p>
          )}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registered</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Visit</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                  <TableHead>Sex</TableHead>
                  <TableHead className="text-right">Companions</TableHead>
                  <TableHead className="text-right">Group size</TableHead>
                  <TableHead className="text-right">Children</TableHead>
                  <TableHead className="text-right">Adults</TableHead>
                  <TableHead className="text-right">Seniors</TableHead>
                  <TableHead className="text-right">PWD</TableHead>
                  <TableHead>Ages</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={14} className="py-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
                ) : q.isError ? (
                  <TableRow><TableCell colSpan={14} className="py-8 text-center text-destructive">{errorMessage(q.error)}</TableCell></TableRow>
                ) : q.data!.rows.length === 0 ? (
                  <TableRow><TableCell colSpan={14} className="py-8 text-center text-muted-foreground">No registrations yet.</TableCell></TableRow>
                ) : q.data!.rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</TableCell>
                    <TableCell className="font-medium">
                      {r.user_id
                        ? <button type="button" className="text-left underline-offset-4 hover:underline" onClick={() => { setAccount(r.user_id); setAccountName(r.full_name); setPage(1); }}>{r.full_name}</button>
                        : r.full_name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs">{r.visit_no ? `#${r.visit_no} of ${r.account_visits}` : "—"}</TableCell>
                    <TableCell className="text-xs">{r.email}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{r.phone}</TableCell>
                    <TableCell className="text-right">{r.age}</TableCell>
                    <TableCell className="capitalize">{r.sex}</TableCell>
                    <TableCell className="text-right">{r.companions}</TableCell>
                    <TableCell className="text-right font-semibold">{r.party_size}</TableCell>
                    <TableCell className="text-right">{r.children}</TableCell>
                    <TableCell className="text-right">{r.adults}</TableCell>
                    <TableCell className="text-right">{r.seniors}</TableCell>
                    <TableCell className="text-right">{r.pwd}</TableCell>
                    <TableCell className="min-w-[140px] text-xs text-muted-foreground">{r.member_ages ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span>Page {page} of {pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={resetAsk} onOpenChange={setResetAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {accountName}'s password?</AlertDialogTitle>
            <AlertDialogDescription>
              For a visitor who forgot their password. Check that the person in front of you owns this account (for example, their email and phone number). Their old password stops working, and you'll see a temporary password to give them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); void resetPassword(); }} disabled={resetting}>Reset password</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!tempPassword} onOpenChange={o => { if (!o) setTempPassword(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Temporary password</AlertDialogTitle>
            <AlertDialogDescription>Give this to the visitor. It is shown only once and isn't saved anywhere.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1 rounded-lg bg-muted p-4 text-center">
            <p className="text-sm text-muted-foreground">{tempPassword?.email}</p>
            <p className="select-all font-mono text-2xl font-semibold tracking-wider" data-testid="temp-password">{tempPassword?.password}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
