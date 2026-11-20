import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Download, Loader2, Search, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { api, jsonBody, errorMessage, downloadFile, formatDateTime, useStaff } from "@/lib/adminApi";

/** Visitor form submissions: inquiries / group-visit requests from the website, and account registrations. */
type Submission = {
  id: number; form_type: string; name: string; email: string | null; phone: string | null; subject: string | null; message: string;
  visit_date: string | null; group_size: number | null; status: string; admin_note: string | null; created_at: string; updated_at: string; updated_by: string | null;
};
const STATUSES = ["new", "in_review", "resolved", "archived"];
const STATUS_LABEL: Record<string, string> = { new: "New", in_review: "In review", resolved: "Resolved", archived: "Archived" };
const STATUS_STYLE: Record<string, string> = { new: "bg-blue-600 text-white", in_review: "bg-amber-500 text-white", resolved: "bg-green-600 text-white", archived: "bg-zinc-300 text-zinc-800" };

export default function Submissions() {
  return (
    <Tabs defaultValue="inquiries" className="space-y-4">
      <TabsList>
        <TabsTrigger value="inquiries">Inquiries & group visits</TabsTrigger>
        <TabsTrigger value="registrations">Account registrations</TabsTrigger>
      </TabsList>
      <TabsContent value="inquiries"><Inquiries /></TabsContent>
      <TabsContent value="registrations"><Registrations /></TabsContent>
      <p className="text-xs text-muted-foreground">
        Private animal feedback is on the <Link href="/admin/feedback" className="underline">Animal Feedback</Link> page. Opening a submission, changing its status and exporting are recorded in the audit log.
      </p>
    </Tabs>
  );
}

function Inquiries() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const staff = useStaff();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const [includePhone, setIncludePhone] = useState(false);
  const qs = `search=${encodeURIComponent(search)}&status=${status === "all" ? "" : status}&form_type=${type === "all" ? "" : type}&from=${from}&to=${to}`;
  const list = useQuery({
    queryKey: ["/api/admin/submissions", qs, page],
    queryFn: () => api<{ rows: Submission[]; total: number; page_size: number; by_status: Record<string, number> }>(`/api/admin/submissions?${qs}&page=${page}&page_size=15`),
    placeholderData: prev => prev,
  });
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / (list.data?.page_size ?? 15)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STATUSES.map(s => (
          <button key={s} type="button" onClick={() => { setStatus(status === s ? "all" : s); setPage(1); }}
            className={`rounded-xl border bg-card p-3 text-left transition-colors ${status === s ? "border-primary" : "hover:bg-muted/50"}`}>
            <p className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</p>
            <p className="text-2xl font-bold">{list.data?.by_status[s] ?? 0}</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, email, message…" className="pl-8" aria-label="Search submissions" />
        </div>
        <Select value={type} onValueChange={v => { setType(v); setPage(1); }}>
          <SelectTrigger className="w-40" aria-label="Form type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All forms</SelectItem>
            <SelectItem value="inquiry">Inquiries</SelectItem>
            <SelectItem value="group_visit">Group visits</SelectItem>
          </SelectContent>
        </Select>
        <div className="space-y-1"><Label htmlFor="sub-from" className="text-xs">From</Label><Input id="sub-from" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="w-40" /></div>
        <div className="space-y-1"><Label htmlFor="sub-to" className="text-xs">To</Label><Input id="sub-to" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="w-40" /></div>
        {staff.can("submissions.write") && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><Checkbox checked={includePhone} onCheckedChange={v => setIncludePhone(!!v)} /> include phone numbers</label>
            <Button variant="outline" onClick={() => downloadFile(`/api/admin/submissions-export.csv?${qs}${includePhone ? "&include_phone=1" : ""}`, "submissions.csv").catch(err => toast({ title: "Export failed", description: errorMessage(err), variant: "destructive" }))}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        )}
      </div>

      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Received</TableHead><TableHead>Form</TableHead><TableHead>Name</TableHead><TableHead>Subject / message</TableHead><TableHead>Status</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
            ) : list.isError ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-destructive">{errorMessage(list.error)}</TableCell></TableRow>
            ) : (list.data?.rows.length ?? 0) === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No submissions{search || status !== "all" || type !== "all" ? " match these filters" : " yet"}.</TableCell></TableRow>
            ) : list.data!.rows.map(s => (
              <TableRow key={s.id} className="cursor-pointer" onClick={() => setOpen(s.id)}>
                <TableCell className="whitespace-nowrap text-xs">{formatDateTime(s.created_at)}</TableCell>
                <TableCell>{s.form_type === "group_visit" ? "Group visit" : "Inquiry"}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="max-w-sm"><span className="line-clamp-2">{s.subject ? <b>{s.subject}: </b> : null}{s.message}</span></TableCell>
                <TableCell><Badge className={STATUS_STYLE[s.status]}>{STATUS_LABEL[s.status]}</Badge></TableCell>
                <TableCell><Button size="icon" variant="ghost" aria-label="Open"><Eye className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>
      <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
        <span>Page {page} of {pages}</span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>
      {open !== null && <SubmissionDialog id={open} canWrite={staff.can("submissions.write")} onClose={() => setOpen(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["/api/admin/submissions"] })} />}
    </div>
  );
}

function SubmissionDialog({ id, canWrite, onClose, onSaved }: { id: number; canWrite: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const q = useQuery({ queryKey: ["/api/admin/submissions", id], queryFn: () => api<Submission>(`/api/admin/submissions/${id}`) });
  const [status, setStatus] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const s = q.data;
  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/admin/submissions/${id}`, jsonBody("PATCH", { status: status ?? s?.status, admin_note: note ?? s?.admin_note ?? "" }));
      toast({ title: "Submission updated" });
      onSaved();
      onClose();
    } catch (err) {
      toast({ title: "Not saved", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{s ? `${s.form_type === "group_visit" ? "Group visit request" : "Inquiry"} from ${s.name}` : "Submission"}</DialogTitle>
          <DialogDescription>{s ? `Received ${formatDateTime(s.created_at)}` : ""}</DialogDescription>
        </DialogHeader>
        {!s ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /> : (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5">
              {s.email && <><dt className="text-muted-foreground">Email</dt><dd className="col-span-2 break-all"><a className="underline" href={`mailto:${s.email}`}>{s.email}</a></dd></>}
              {s.phone && <><dt className="text-muted-foreground">Phone</dt><dd className="col-span-2">{s.phone}</dd></>}
              {s.visit_date && <><dt className="text-muted-foreground">Visit date</dt><dd className="col-span-2">{s.visit_date}</dd></>}
              {s.group_size && <><dt className="text-muted-foreground">Group size</dt><dd className="col-span-2">{s.group_size}</dd></>}
              {s.subject && <><dt className="text-muted-foreground">Subject</dt><dd className="col-span-2">{s.subject}</dd></>}
            </dl>
            <p className="whitespace-pre-line rounded-lg bg-muted/50 p-3">{s.message}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="sub-status">Status</Label>
                <Select value={status ?? s.status} onValueChange={setStatus} disabled={!canWrite}>
                  <SelectTrigger id="sub-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(x => <SelectItem key={x} value={x}>{STATUS_LABEL[x]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sub-note">Staff note</Label>
                <Textarea id="sub-note" rows={2} value={note ?? s.admin_note ?? ""} onChange={e => setNote(e.target.value)} disabled={!canWrite} placeholder="e.g. Replied by email on…" />
              </div>
            </div>
            {s.updated_by && <p className="text-xs text-muted-foreground">Last updated {formatDateTime(s.updated_at)} by {s.updated_by}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {canWrite && <Button onClick={save} disabled={saving || !s}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Registrations() {
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["/api/admin/registrations", search],
    queryFn: () => api<{ id: string; full_name: string | null; email: string; role: string; email_confirmed: boolean; registered_at: string; last_login: string | null }[]>(`/api/admin/registrations?search=${encodeURIComponent(search)}`),
    placeholderData: prev => prev,
  });
  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…" className="pl-8" aria-label="Search registrations" />
      </div>
      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Registered</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Confirmed</TableHead><TableHead>Role</TableHead><TableHead>Last login</TableHead></TableRow></TableHeader>
          <TableBody>
            {q.isLoading ? <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
              : q.isError ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-destructive">{errorMessage(q.error)}</TableCell></TableRow>
              : (q.data ?? []).map(r => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(r.registered_at)}</TableCell>
                  <TableCell>{r.full_name ?? "—"}</TableCell>
                  <TableCell className="break-all">{r.email}</TableCell>
                  <TableCell>{r.email_confirmed ? "Yes" : <span className="text-amber-600">Not yet</span>}</TableCell>
                  <TableCell className="capitalize">{r.role}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(r.last_login)}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>
      <p className="text-xs text-muted-foreground">Visitors register on the website to save favourites and earn game points. Change roles on the <Link href="/admin/users" className="underline">Users & Roles</Link> page (administrators only).</p>
    </div>
  );
}
