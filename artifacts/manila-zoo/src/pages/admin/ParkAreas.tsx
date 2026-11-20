import React, { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Loader2, TreePine, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PositionPicker } from "@/components/admin/PositionPicker";
import { ShapeIcon } from "@/components/map/TreeLegend";
import { api, jsonBody, errorMessage, useStaff } from "@/lib/adminApi";
import {
  MARKER_SHAPE_OPTIONS, PARK_AREAS_KEY, TREE_STATUSES, treeStatus, useParkAreas,
  type ParkZone, type TreeStatus, type ZoneTree,
} from "@/lib/parkAreas";
import type { TreeShape } from "@/lib/treeSurvey";

// ─── Zone form ───────────────────────────────────────────────────────────────

type ZoneDraft = { id?: number; name: string; marker_shape: TreeShape | ""; marker_color: string; description: string; species: string };
const EMPTY_ZONE: ZoneDraft = { name: "", marker_shape: "", marker_color: "#2d6a4f", description: "", species: "" };
const toZoneDraft = (z: ParkZone): ZoneDraft => ({ id: z.id, name: z.name, marker_shape: z.marker_shape, marker_color: z.marker_color, description: z.description ?? "", species: z.legend_species.join("\n") });

function ZoneForm({ initial, zones, onClose }: { initial: ZoneDraft; zones: ParkZone[]; onClose: () => void }) {
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const set = <K extends keyof ZoneDraft>(k: K, v: ZoneDraft[K]) => { setD(p => ({ ...p, [k]: v })); setErrors(e => ({ ...e, [k]: "" })); };

  const save = async () => {
    const e: Record<string, string> = {};
    const name = d.name.trim();
    if (!name) e.name = "Enter the park area's name.";
    else if (zones.some(z => z.id !== d.id && z.name.trim().toLowerCase() === name.toLowerCase())) e.name = `A park area called "${name}" already exists.`;
    if (!d.marker_shape) e.marker_shape = "Choose a marker shape.";
    if (!/^#[0-9a-fA-F]{6}$/.test(d.marker_color)) e.marker_color = "Use a colour like #2d6a4f.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = { name, marker_shape: d.marker_shape, marker_color: d.marker_color, description: d.description, legend_species: d.species.split("\n").map(s => s.trim()).filter(Boolean) };
      if (d.id) await api(`/api/admin/park-areas/${d.id}`, jsonBody("PUT", body));
      else await api("/api/admin/park-areas", jsonBody("POST", body));
      await queryClient.invalidateQueries({ queryKey: PARK_AREAS_KEY });
      toast({ title: d.id ? "Park area updated" : "Park area added", description: `${name} is updated on the 3D map and its legend.` });
      onClose();
    } catch (err) {
      toast({ title: "Couldn't save the park area", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) => errors[k] ? <p className="text-xs text-destructive">{errors[k]}</p> : null;
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="zone-name">Name</Label>
        <Input id="zone-name" value={d.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Mali Area" aria-invalid={!!errors.name} />
        {err("name")}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="zone-shape">Marker shape</Label>
          <Select value={d.marker_shape} onValueChange={v => set("marker_shape", v as TreeShape)}>
            <SelectTrigger id="zone-shape" aria-invalid={!!errors.marker_shape}><SelectValue placeholder="Choose a shape" /></SelectTrigger>
            <SelectContent>
              {MARKER_SHAPE_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value}>
                  <span className="flex items-center gap-2"><ShapeIcon shape={s.value} color={d.marker_color} /> {s.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {err("marker_shape")}
        </div>
        <div>
          <Label htmlFor="zone-color">Marker colour</Label>
          <div className="flex gap-2">
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(d.marker_color) ? d.marker_color : "#2d6a4f"} onChange={e => set("marker_color", e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-md border bg-background p-1" aria-label="Pick the marker colour" />
            <Input id="zone-color" value={d.marker_color} onChange={e => set("marker_color", e.target.value.trim())} className="font-mono" aria-invalid={!!errors.marker_color} />
          </div>
          {err("marker_color")}
        </div>
      </div>
      <div>
        <Label htmlFor="zone-desc">Description (optional)</Label>
        <Textarea id="zone-desc" rows={2} value={d.description} onChange={e => set("description", e.target.value)} />
      </div>
      <div>
        <Label htmlFor="zone-species">Species in this zone's legend (one per line, optional)</Label>
        <Textarea id="zone-species" rows={5} value={d.species} onChange={e => set("species", e.target.value)} placeholder={"Narra\nMolave"} />
        <p className="mt-1 text-xs text-muted-foreground">Listed in the map's tree legend and suggested when adding a tree.</p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {d.id ? "Save changes" : "Add park area"}</Button>
      </DialogFooter>
    </div>
  );
}

// ─── Tree form ───────────────────────────────────────────────────────────────

type TreeDraft = { id?: number; zone_id: number; species: string; status: TreeStatus; notes: string; lat: number | null; lng: number | null };

function TreeForm({ initial, zones, onClose }: { initial: TreeDraft; zones: ParkZone[]; onClose: () => void }) {
  const [d, setD] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const zone = zones.find(z => z.id === d.zone_id);
  const set = <K extends keyof TreeDraft>(k: K, v: TreeDraft[K]) => { setD(p => ({ ...p, [k]: v })); setErrors(e => ({ ...e, [k]: "" })); };

  const save = async () => {
    const e: Record<string, string> = {};
    if (!d.species.trim()) e.species = "Enter the tree's species.";
    if (d.lat == null || d.lng == null || !Number.isFinite(d.lat) || !Number.isFinite(d.lng)) e.position = "Set the map position.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = { zone_id: d.zone_id, species: d.species.trim(), status: d.status, notes: d.notes, lat: d.lat, lng: d.lng };
      if (d.id) await api(`/api/admin/trees/${d.id}`, jsonBody("PUT", body));
      else await api(`/api/admin/park-areas/${d.zone_id}/trees`, jsonBody("POST", body));
      await queryClient.invalidateQueries({ queryKey: PARK_AREAS_KEY });
      toast({ title: d.id ? "Tree updated" : "Tree added", description: `${body.species} · ${zone?.name ?? ""}` });
      onClose();
    } catch (err) {
      toast({ title: "Couldn't save the tree", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) => errors[k] ? <p className="text-xs text-destructive">{errors[k]}</p> : null;
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="tree-species">Species</Label>
        <Input id="tree-species" list="tree-species-options" value={d.species} onChange={e => set("species", e.target.value)} placeholder="e.g. Narra" aria-invalid={!!errors.species} />
        <datalist id="tree-species-options">{zone?.legend_species.map(s => <option key={s} value={s} />)}</datalist>
        {err("species")}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="tree-status">Status</Label>
          <Select value={d.status} onValueChange={v => set("status", v as TreeStatus)}>
            <SelectTrigger id="tree-status"><SelectValue /></SelectTrigger>
            <SelectContent>{TREE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="tree-zone">Park area</Label>
          <Select value={String(d.zone_id)} onValueChange={v => set("zone_id", Number(v))}>
            <SelectTrigger id="tree-zone"><SelectValue /></SelectTrigger>
            <SelectContent>{zones.map(z => <SelectItem key={z.id} value={String(z.id)}><span className="flex items-center gap-2"><ShapeIcon shape={z.marker_shape} color={z.marker_color} /> {z.name}</span></SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="tree-notes">Notes (optional)</Label>
        <Textarea id="tree-notes" rows={2} value={d.notes} onChange={e => set("notes", e.target.value)} placeholder="e.g. Pruned in November; check the trunk for termites" />
      </div>
      <PositionPicker idPrefix="tree" lat={d.lat} lng={d.lng} color={zone?.marker_color}
        onChange={(lat, lng) => { setD(p => ({ ...p, lat, lng })); setErrors(e => ({ ...e, position: "" })); }} />
      {err("position")}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {d.id ? "Save changes" : "Add tree"}</Button>
      </DialogFooter>
    </div>
  );
}

// ─── Trees in one zone ───────────────────────────────────────────────────────

function ZoneTrees({ zone, zones, canWrite }: { zone: ParkZone; zones: ParkZone[]; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<TreeDraft | null>(null);
  const [deleting, setDeleting] = useState<ZoneTree | null>(null);
  const trees = zone.trees.filter(t => (status === "all" || t.status === status)
    && (!search.trim() || `${t.species ?? ""} ${t.notes ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())));
  const remove = async () => {
    if (!deleting) return;
    const t = deleting;
    setDeleting(null);
    try {
      await api(`/api/admin/trees/${t.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: PARK_AREAS_KEY });
      toast({ title: "Tree removed", description: "It's removed from the 3D map." });
    } catch (err) {
      toast({ title: "Couldn't remove the tree", description: errorMessage(err), variant: "destructive" });
    }
  };

  if (editing) {
    return (
      <>
        <DialogHeader><DialogTitle>{editing.id ? "Edit tree" : `Add a tree to ${zone.name}`}</DialogTitle></DialogHeader>
        <TreeForm initial={editing} zones={zones} onClose={() => setEditing(null)} />
      </>
    );
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><ShapeIcon shape={zone.marker_shape} color={zone.marker_color} size={18} /> Trees in {zone.name} ({zone.trees.length})</DialogTitle>
        <DialogDescription>Trees loaded from the site plan start as "Cannot be Identified" until their species is recorded.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search species or notes…" className="pl-8" aria-label="Search trees" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TREE_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {canWrite && <Button onClick={() => setEditing({ zone_id: zone.id, species: "", status: "healthy", notes: "", lat: null, lng: null })}><Plus className="mr-2 h-4 w-4" /> Add tree</Button>}
      </div>
      <div className="max-h-[50vh] overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Species</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Notes</TableHead>
              {canWrite && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {trees.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No trees match.</TableCell></TableRow>
            ) : trees.map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{t.id}</TableCell>
                <TableCell className="font-medium">{t.species || <span className="font-normal text-muted-foreground">Not recorded</span>}</TableCell>
                <TableCell><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${treeStatus(t.status).badge}`}>{treeStatus(t.status).label}</span></TableCell>
                <TableCell className="hidden max-w-[14rem] truncate text-muted-foreground sm:table-cell" title={t.notes ?? ""}>{t.notes || (t.source === "site_plan" ? "From the site plan" : "—")}</TableCell>
                {canWrite && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing({ id: t.id, zone_id: t.zone_id, species: t.species ?? "", status: t.status, notes: t.notes ?? "", lat: t.lat, lng: t.lng })}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(t)} aria-label={`Remove tree ${t.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={!!deleting} onOpenChange={o => !o && setDeleting(null)}
        title="Remove this tree?"
        description={<p>{deleting?.species || "This tree"} (#{deleting?.id}) is removed from {zone.name} and the 3D map. If it has died, you can set its status to Dead instead.</p>}
        confirmLabel="Remove" destructive onConfirm={remove}
      />
    </>
  );
}

// ─── Deleting a zone ─────────────────────────────────────────────────────────

function DeleteZoneDialog({ zone, zones, onClose }: { zone: ParkZone; zones: ParkZone[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const others = zones.filter(z => z.id !== zone.id);
  const [moveTo, setMoveTo] = useState(others[0] ? String(others[0].id) : "");
  const [busy, setBusy] = useState<"" | "move" | "delete">("");
  const n = zone.trees.length;

  const run = async (mode: "move" | "delete" | "empty") => {
    setBusy(mode === "move" ? "move" : "delete");
    try {
      const qs = mode === "move" ? `?move_to=${moveTo}` : mode === "delete" ? "?delete_trees=true" : "";
      await api(`/api/admin/park-areas/${zone.id}${qs}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: PARK_AREAS_KEY });
      const target = others.find(z => String(z.id) === moveTo)?.name;
      toast({ title: "Park area deleted", description: mode === "move" ? `${n} tree${n === 1 ? "" : "s"} moved to ${target}.` : mode === "delete" ? `${n} tree${n === 1 ? "" : "s"} removed with it.` : `${zone.name} is removed from the map legend.` });
      onClose();
    } catch (err) {
      toast({ title: "Couldn't delete the park area", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {zone.name}?</DialogTitle>
          <DialogDescription>{n === 0 ? "It has no trees. It's removed from the list and the map legend." : "This park area still has trees."}</DialogDescription>
        </DialogHeader>
        {n > 0 && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{zone.name} has <strong>{n} tree{n === 1 ? "" : "s"}</strong>. Move them to another park area first, so they stay on the map.</span>
            </div>
            {others.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="move-to">Move the trees to</Label>
                <Select value={moveTo} onValueChange={setMoveTo}>
                  <SelectTrigger id="move-to"><SelectValue /></SelectTrigger>
                  <SelectContent>{others.map(z => <SelectItem key={z.id} value={String(z.id)}><span className="flex items-center gap-2"><ShapeIcon shape={z.marker_shape} color={z.marker_color} /> {z.name}</span></SelectItem>)}</SelectContent>
                </Select>
                <Button className="w-full" onClick={() => run("move")} disabled={!moveTo || !!busy}>
                  {busy === "move" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Move {n} tree{n === 1 ? "" : "s"} and delete
                </Button>
              </div>
            )}
            <Button variant="outline" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => run("delete")} disabled={!!busy}>
              {busy === "delete" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Delete the park area and its {n} tree{n === 1 ? "" : "s"}
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {n === 0 && <Button variant="destructive" onClick={() => run("empty")} disabled={!!busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Delete</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

/** Park Areas: the planting zones (shape and colour of their tree markers) and the trees in each. */
export default function AdminParkAreas() {
  const { data, isLoading, isError } = useParkAreas();
  const zones = useMemo(() => data ?? [], [data]);
  const staff = useStaff();
  const canWrite = staff.can("map.write");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ZoneDraft | null>(null);
  const [treesOf, setTreesOf] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<ParkZone | null>(null);
  const shown = zones.filter(z => !search.trim() || `${z.name} ${z.description ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const totalTrees = zones.reduce((n, z) => n + z.trees.length, 0);
  const openZone = zones.find(z => z.id === treesOf);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Park Areas</h1>
          <p className="text-muted-foreground">Planting zones and their trees. Each zone's trees show on the 3D map in its marker shape and colour.</p>
        </div>
        {canWrite && <Button onClick={() => setEditing(EMPTY_ZONE)}><Plus className="mr-2 h-4 w-4" /> Add Park Area</Button>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All park areas ({zones.length})</CardTitle>
          <CardDescription>{totalTrees} trees in total. Open a park area's trees to add, edit or remove them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search park areas…" className="pl-8" aria-label="Search park areas" />
          </div>
          {isLoading ? <Skeleton className="h-64 w-full" /> : isError ? (
            <p className="text-destructive">Couldn't load park areas. Is the API server running?</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Park area</TableHead>
                    <TableHead>Marker</TableHead>
                    <TableHead>Trees</TableHead>
                    <TableHead className="hidden md:table-cell">Condition</TableHead>
                    <TableHead className="hidden lg:table-cell">Description</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No park areas match.</TableCell></TableRow>
                  ) : shown.map(z => {
                    const byStatus = TREE_STATUSES.map(s => ({ ...s, n: z.trees.filter(t => t.status === s.value).length })).filter(s => s.n > 0);
                    return (
                      <TableRow key={z.id}>
                        <TableCell className="font-medium">{z.name}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2 text-sm text-muted-foreground">
                            <ShapeIcon shape={z.marker_shape} color={z.marker_color} size={18} />
                            {MARKER_SHAPE_OPTIONS.find(s => s.value === z.marker_shape)?.label} · <span className="font-mono text-xs">{z.marker_color}</span>
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums">{z.trees.length}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {byStatus.length === 0 ? <span className="text-muted-foreground">—</span> : byStatus.map(s => (
                              <span key={s.value} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${s.badge}`}>{s.n} {s.label}</span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="hidden max-w-xs truncate text-muted-foreground lg:table-cell" title={z.description ?? ""}>{z.description || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => setTreesOf(z.id)}><TreePine className="mr-1.5 h-4 w-4" /> Trees</Button>
                            {canWrite && <Button size="sm" variant="outline" onClick={() => setEditing(toZoneDraft(z))}><Pencil className="mr-1.5 h-4 w-4" /> Edit</Button>}
                            {canWrite && <Button size="sm" variant="ghost" onClick={() => setDeleting(z)} aria-label={`Delete ${z.name}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                          </div>
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

      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit park area" : "Add park area"}</DialogTitle>
            <DialogDescription>Its trees use this marker shape and colour on the 3D map.</DialogDescription>
          </DialogHeader>
          {editing && <ZoneForm initial={editing} zones={zones} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!openZone} onOpenChange={open => !open && setTreesOf(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          {openZone && <ZoneTrees key={openZone.id} zone={openZone} zones={zones} canWrite={canWrite} />}
        </DialogContent>
      </Dialog>

      {deleting && <DeleteZoneDialog zone={deleting} zones={zones} onClose={() => setDeleting(null)} />}
    </div>
  );
}
