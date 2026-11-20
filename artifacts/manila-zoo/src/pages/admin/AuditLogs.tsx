import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, ShieldCheck, ShieldAlert, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage, downloadFile, formatDateTime } from "@/lib/adminApi";

/** Audit log viewer (administrators): server-side records of logins and administrative changes. */
type Log = {
  id: number; created_at: string; actor_email: string | null; actor_role: string | null; action: string; resource: string;
  record_id: string | null; result: "success" | "failure"; before: unknown; after: unknown; context: Record<string, unknown> | null;
};

export default function AuditLogs() {
  const { toast } = useToast();
  const [filters, setFilters] = useState({ user: "", action: "", resource: "all", result: "all", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const [chain, setChain] = useState<{ ok: boolean; checked: number; brokenAt?: number; reason?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const qs = new URLSearchParams({
    user: filters.user, action: filters.action, resource: filters.resource === "all" ? "" : filters.resource,
    result: filters.result === "all" ? "" : filters.result, from: filters.from, to: filters.to,
  }).toString();
  const q = useQuery({
    queryKey: ["/api/admin/audit-logs", qs, page],
    queryFn: () => api<{ rows: Log[]; total: number; page_size: number; resources: string[] }>(`/api/admin/audit-logs?${qs}&page=${page}&page_size=50`),
    placeholderData: prev => prev,
  });
  const set = (k: keyof typeof filters, v: string) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / (q.data?.page_size ?? 50)));

  const verify = async () => {
    setChecking(true);
    try { setChain(await api("/api/admin/audit-logs/verify")); } catch (err) { toast({ title: "Check failed", description: errorMessage(err), variant: "destructive" }); }
    finally { setChecking(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm">
        <span className="text-muted-foreground">Records can't be edited or deleted (enforced by the database), and each is linked to the previous one by a hash, so tampering is detectable.</span>
        <div className="flex items-center gap-2">
          {chain && (chain.ok
            ? <span className="flex items-center gap-1 text-green-700"><ShieldCheck className="h-4 w-4" /> All {chain.checked} records intact</span>
            : <span className="flex items-center gap-1 text-destructive"><ShieldAlert className="h-4 w-4" /> Record #{chain.brokenAt}: {chain.reason}</span>)}
          <Button size="sm" variant="outline" onClick={verify} disabled={checking}>{checking ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}Check integrity</Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="space-y-1"><Label htmlFor="al-user" className="text-xs">User</Label><Input id="al-user" value={filters.user} onChange={e => set("user", e.target.value)} placeholder="email" /></div>
        <div className="space-y-1"><Label htmlFor="al-action" className="text-xs">Action</Label><Input id="al-action" value={filters.action} onChange={e => set("action", e.target.value)} placeholder="e.g. login, publish" /></div>
        <div className="space-y-1">
          <Label htmlFor="al-res" className="text-xs">Resource</Label>
          <Select value={filters.resource} onValueChange={v => set("resource", v)}>
            <SelectTrigger id="al-res"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All</SelectItem>{(q.data?.resources ?? []).map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="al-result" className="text-xs">Result</Label>
          <Select value={filters.result} onValueChange={v => set("result", v)}>
            <SelectTrigger id="al-result"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="success">Success</SelectItem><SelectItem value="failure">Failure</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label htmlFor="al-from" className="text-xs">From</Label><Input id="al-from" type="date" value={filters.from} onChange={e => set("from", e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="al-to" className="text-xs">To</Label><Input id="al-to" type="date" value={filters.to} onChange={e => set("to", e.target.value)} /></div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{q.data?.total ?? 0} records</span>
        <Button variant="outline" size="sm" onClick={() => downloadFile(`/api/admin/audit-logs/export.csv?${qs}`, "audit-log.csv").catch(err => toast({ title: "Export failed", description: errorMessage(err), variant: "destructive" }))}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Card><CardContent className="p-0">
        {q.isLoading ? <div className="py-10"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>
          : q.isError ? <p className="p-6 text-destructive">{errorMessage(q.error)}</p>
          : (q.data?.rows.length ?? 0) === 0 ? <p className="p-6 text-center text-muted-foreground">No records match these filters.</p>
          : (
            <ul className="divide-y text-sm">
              {q.data!.rows.map(l => (
                <li key={l.id}>
                  <button type="button" onClick={() => setOpenId(openId === l.id ? null : l.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-muted/40">
                    {openId === l.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span className="w-40 shrink-0 text-xs text-muted-foreground">{formatDateTime(l.created_at)}</span>
                    <Badge variant={l.result === "success" ? "secondary" : "destructive"} className="shrink-0">{l.result}</Badge>
                    <span className="font-mono text-xs font-semibold">{l.action}</span>
                    <span className="text-xs text-muted-foreground">{l.resource}{l.record_id ? ` #${l.record_id}` : ""}</span>
                    <span className="ml-auto truncate text-xs">{l.actor_email ?? "system"}{l.actor_role ? ` (${l.actor_role})` : ""}</span>
                  </button>
                  {openId === l.id && (
                    <div className="grid gap-3 bg-muted/30 px-4 py-3 text-xs md:grid-cols-3">
                      {(["before", "after", "context"] as const).map(k => (
                        <div key={k}>
                          <p className="mb-1 font-semibold capitalize">{k}</p>
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-card p-2">{l[k] == null ? "—" : JSON.stringify(l[k], null, 2)}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
      </CardContent></Card>
      <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
        <span>Page {page} of {pages}</span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>
    </div>
  );
}
