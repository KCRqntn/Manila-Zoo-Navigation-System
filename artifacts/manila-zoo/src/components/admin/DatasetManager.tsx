import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Download, Eye, EyeOff, Loader2, Pencil, Plus, Search, Trash2, Upload, Ban, ShieldCheck, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { api, jsonBody, errorMessage, downloadFile, formatDateTime, useStaff } from "@/lib/adminApi";

/**
 * Manages one dataset (Zoo Updates, Ticket Prices, Announcements, Events) through the
 * /api/admin/datasets endpoints: table with search, status filter and pagination; a form built from
 * the server's field definitions; publish / unpublish / archive / cancel; delete with confirmation;
 * CSV import (all-or-nothing) and export. The server validates everything again.
 */
type Field = { name: string; label: string; type: string; required?: boolean; options?: string[]; help?: string; default?: unknown; min?: number; max?: number };
type DatasetMeta = { id: string; label: string; fields: Field[]; statuses: string[] };
type Row = Record<string, unknown> & { id: number; status: string };
export type Column = { key: string; label: string; render?: (row: Row) => React.ReactNode };

const STATUS_STYLE: Record<string, string> = {
  published: "bg-green-600 text-white", draft: "bg-slate-500 text-white", archived: "bg-zinc-300 text-zinc-800",
  cancelled: "bg-orange-500 text-white",
};

// Date-times are edited as Manila time, whatever the browser's time zone
const MANILA_MS = 8 * 3600 * 1000;
const toLocalInput = (v: unknown) => (v ? new Date(new Date(String(v)).getTime() + MANILA_MS).toISOString().slice(0, 16) : "");
const fromLocalInput = (v: string) => (v ? `${v}:00+08:00` : "");

export function DatasetManager({ dataset, columns, intro, pinOptions }: {
  dataset: string;
  columns: Column[];
  intro?: React.ReactNode;
  /** Map places for an Events "Map place" field */
  pinOptions?: { id: number; name: string }[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const staff = useStaff();
  const canWrite = staff.can("content.write");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null | "new">(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; label: string; destructive?: boolean; run: () => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const meta = useQuery({
    queryKey: ["/api/admin/datasets"],
    queryFn: () => api<DatasetMeta[]>("/api/admin/datasets"),
    staleTime: Infinity,
  });
  const def = meta.data?.find(d => d.id === dataset);
  const listKey = ["/api/admin/datasets", dataset, search, status, page];
  const list = useQuery({
    queryKey: listKey,
    queryFn: () => api<{ rows: Row[]; total: number; page: number; page_size: number }>(
      `/api/admin/datasets/${dataset}?search=${encodeURIComponent(search)}&status=${status === "all" ? "" : status}&page=${page}&page_size=15`),
    placeholderData: prev => prev,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/admin/datasets", dataset] });

  const act = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: success });
      refresh();
    } catch (err) {
      toast({ title: "Not saved", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };
  const setRowStatus = (row: Row, next: string, label: string) =>
    act(() => api(`/api/admin/datasets/${dataset}/${row.id}`, jsonBody("PATCH", { status: next })), label);

  const importFile = async (file: File) => {
    const text = await file.text();
    await act(async () => {
      const r = await api<{ created: number; updated: number }>(`/api/admin/datasets/${dataset}/import`, { method: "POST", headers: { "Content-Type": "text/csv" }, body: text });
      toast({ title: `Imported: ${r.created} added, ${r.updated} updated` });
    }, "Import finished");
    if (fileRef.current) fileRef.current.value = "";
  };

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (list.data?.page_size ?? 15)));

  return (
    <div className="space-y-4">
      {intro}
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder={`Search ${def?.label.toLowerCase() ?? ""}…`} className="pl-8" aria-label="Search" />
        </div>
        <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {def?.statuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => downloadFile(`/api/admin/datasets/${dataset}/export.csv`, `${dataset}.csv`).catch(err => toast({ title: "Export failed", description: errorMessage(err), variant: "destructive" }))}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
        {canWrite && (
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); }} />
            <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()} title="Use the columns from Export. All rows are checked first; a file with any error changes nothing.">
              <Upload className="mr-2 h-4 w-4" /> Import CSV
            </Button>
            <Button onClick={() => setEditing("new")}><Plus className="mr-2 h-4 w-4" /> New</Button>
          </>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map(c => <TableHead key={c.key}>{c.label}</TableHead>)}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.isLoading ? (
                  <TableRow><TableCell colSpan={columns.length + 2} className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
                ) : list.isError ? (
                  <TableRow><TableCell colSpan={columns.length + 2} className="py-10 text-center text-destructive">{errorMessage(list.error)}</TableCell></TableRow>
                ) : (list.data?.rows.length ?? 0) === 0 ? (
                  <TableRow><TableCell colSpan={columns.length + 2} className="py-10 text-center text-muted-foreground">
                    {search || status !== "all" ? "No records match your search." : "No records yet."}{canWrite && !search && status === "all" ? " Click New to add one." : ""}
                  </TableCell></TableRow>
                ) : list.data!.rows.map(row => (
                  <TableRow key={row.id}>
                    {columns.map(c => <TableCell key={c.key} className="max-w-xs align-top">{c.render ? c.render(row) : String(row[c.key] ?? "—")}</TableCell>)}
                    <TableCell className="align-top"><Badge className={`capitalize ${STATUS_STYLE[row.status] ?? ""}`}>{row.status}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-right align-top">
                      {canWrite && (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" title="Edit" aria-label="Edit" onClick={() => setEditing(row)}><Pencil className="h-4 w-4" /></Button>
                          {row.status !== "published" ? (
                            <Button size="icon" variant="ghost" title="Publish" aria-label="Publish" disabled={busy}
                              onClick={() => setConfirm({ title: "Publish this record?", description: "Visitors will see it on the website (at its publish time, if one is set).", label: "Publish", run: () => setRowStatus(row, "published", "Published") })}>
                              <Eye className="h-4 w-4 text-green-600" />
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" title="Unpublish (back to draft)" aria-label="Unpublish" disabled={busy} onClick={() => setRowStatus(row, "draft", "Moved back to draft")}>
                              <EyeOff className="h-4 w-4" />
                            </Button>
                          )}
                          {dataset === "events" && row.status === "published" && (
                            <Button size="icon" variant="ghost" title="Cancel event" aria-label="Cancel event" disabled={busy}
                              onClick={() => setConfirm({ title: "Cancel this event?", description: "Visitors will see it marked as cancelled.", label: "Cancel event", destructive: true, run: () => setRowStatus(row, "cancelled", "Event cancelled") })}>
                              <Ban className="h-4 w-4 text-orange-600" />
                            </Button>
                          )}
                          {row.status !== "archived" && (
                            <Button size="icon" variant="ghost" title="Archive" aria-label="Archive" disabled={busy}
                              onClick={() => setConfirm({ title: "Archive this record?", description: "It will be hidden from visitors but kept for reference. You can publish it again later.", label: "Archive", run: () => setRowStatus(row, "archived", "Archived") })}>
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" title={row.status === "published" ? "Unpublish or archive first" : "Delete"} aria-label="Delete" disabled={busy || row.status === "published"}
                            onClick={() => setConfirm({ title: "Delete permanently?", description: "This can't be undone. Archive instead if you may need it later.", label: "Delete", destructive: true, run: () => act(() => api(`/api/admin/datasets/${dataset}/${row.id}`, { method: "DELETE" }), "Deleted") })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} record{total === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span>Page {page} of {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>

      {def && editing !== null && (
        <RecordDialog def={def} row={editing === "new" ? null : editing} pinOptions={pinOptions}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
      )}
      {confirm && (
        <ConfirmDialog open onOpenChange={o => !o && setConfirm(null)} title={confirm.title} description={confirm.description}
          confirmLabel={confirm.label} destructive={confirm.destructive} onConfirm={() => { const c = confirm; setConfirm(null); void c.run(); }} />
      )}
    </div>
  );
}

function RecordDialog({ def, row, pinOptions, onClose, onSaved }: { def: DatasetMeta; row: Row | null; pinOptions?: { id: number; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const initial = Object.fromEntries(def.fields.map(f => {
    const v = row ? row[f.name] : f.default;
    if (f.type === "datetime") return [f.name, toLocalInput(v)];
    if (f.type === "date") return [f.name, v ? String(v).slice(0, 10) : ""];
    if (f.type === "bool") return [f.name, !!v];
    return [f.name, v == null ? "" : String(v)];
  }));
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: unknown) => setValues(prev => ({ ...prev, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    // Send only fields that changed (all fields for a new record)
    const body: Record<string, unknown> = {};
    for (const f of def.fields) {
      const raw = values[f.name];
      if (row && raw === initial[f.name]) continue;
      const v = f.type === "datetime" ? fromLocalInput(String(raw ?? "")) : raw;
      body[f.name] = v === "" ? null : v;
    }
    try {
      if (row) await api(`/api/admin/datasets/${def.id}/${row.id}`, jsonBody("PATCH", body));
      else await api(`/api/admin/datasets/${def.id}`, jsonBody("POST", body));
      toast({ title: row ? "Saved" : "Created" });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row ? `Edit ${def.label.replace(/s$/, "").toLowerCase()}` : `New ${def.label.replace(/s$/, "").toLowerCase()}`}</DialogTitle>
          <DialogDescription>Fields marked * are required. Times are Manila time.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {def.fields.map(f => {
              const id = `ds-${f.name}`;
              const wide = f.type === "longtext" || f.name === "title" || f.name === "category" || f.name === "source_reference";
              const label = <Label htmlFor={id}>{f.label}{f.required ? " *" : ""}</Label>;
              let input: React.ReactNode;
              if (f.type === "longtext") input = <Textarea id={id} rows={4} value={String(values[f.name] ?? "")} onChange={e => set(f.name, e.target.value)} required={f.required} />;
              else if (f.type === "enum") input = (
                <Select value={String(values[f.name] ?? "")} onValueChange={v => set(f.name, v)}>
                  <SelectTrigger id={id}><SelectValue placeholder="Choose…" /></SelectTrigger>
                  <SelectContent>{f.options!.map(o => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}</SelectContent>
                </Select>
              );
              else if (f.type === "bool") input = <div className="flex h-10 items-center"><Switch id={id} checked={!!values[f.name]} onCheckedChange={v => set(f.name, v)} /></div>;
              else if (f.name === "pin_id" && pinOptions) input = (
                <Select value={String(values[f.name] || "none")} onValueChange={v => set(f.name, v === "none" ? "" : v)}>
                  <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not on the map</SelectItem>
                    {pinOptions.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              );
              else input = (
                <Input id={id} required={f.required}
                  type={f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : f.type === "number" || f.type === "int" ? "number" : f.type === "url" ? "url" : "text"}
                  step={f.type === "number" ? "0.01" : f.type === "int" ? "1" : undefined} min={f.min} max={f.type === "number" || f.type === "int" ? f.max : undefined}
                  value={String(values[f.name] ?? "")} onChange={e => set(f.name, e.target.value)} />
              );
              return (
                <div key={f.name} className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
                  {label}
                  {input}
                  {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
                </div>
              );
            })}
          </div>
          {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Small renderers shared by the dataset pages. */
export const cell = {
  date: (key: string) => (row: Row) => <span className="whitespace-nowrap">{formatDateTime(row[key])}</span>,
  clamp: (key: string) => (row: Row) => <span className="line-clamp-2">{String(row[key] ?? "—")}</span>,
  verified: (row: Row) => row["is_verified"]
    ? <span className="inline-flex items-center gap-1 text-green-700"><ShieldCheck className="h-4 w-4" /> Verified {String(row["verified_at"] ?? "")}</span>
    : <span className="inline-flex items-center gap-1 text-amber-600"><ShieldAlert className="h-4 w-4" /> Needs verification</span>,
};
