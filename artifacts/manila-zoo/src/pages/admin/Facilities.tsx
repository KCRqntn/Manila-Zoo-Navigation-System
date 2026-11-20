import React, { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Plus, Pencil, Trash2, Search, Loader2, ImagePlus, X, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PositionPicker } from "@/components/admin/PositionPicker";
import { api, jsonBody, errorMessage, useStaff } from "@/lib/adminApi";
import { resizeImage } from "@/lib/imageResize";
import {
  FACILITIES_KEY, FACILITY_STATUSES, FACILITY_TYPES, facilityStatus, facilityType, useFacilities,
  type Facility, type FacilityStatus, type FacilityType,
} from "@/lib/parkAreas";

export type FacilityDraft = { id?: number; name: string; type: FacilityType | ""; description: string; status: FacilityStatus; photo_url: string; lat: number | null; lng: number | null; is_active: boolean };
type Draft = FacilityDraft;
const EMPTY: Draft = { name: "", type: "", description: "", status: "open", photo_url: "", lat: null, lng: null, is_active: true };
export const newFacilityDraft = (lat: number | null = null, lng: number | null = null): FacilityDraft => ({ ...EMPTY, lat, lng });
export const toFacilityDraft = (f: Facility): Draft => ({ id: f.id, name: f.name, type: f.type, description: f.description ?? "", status: f.status, photo_url: f.photo_url ?? "", lat: f.lat, lng: f.lng, is_active: f.is_active !== false });
const toDraft = toFacilityDraft;

/** Add or edit a facility in a dialog (Facilities page and Map Management). */
export function FacilityDialog({ draft, existing, onClose }: { draft: FacilityDraft | null; existing: Facility[]; onClose: () => void }) {
  return (
    <Dialog open={!!draft} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft?.id ? "Edit facility" : "Add facility"}</DialogTitle>
          <DialogDescription>Shown on the visitor map (2D and 3D) at its position once published.</DialogDescription>
        </DialogHeader>
        {draft && <FacilityForm initial={draft} existing={existing} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/** Photo: upload (resized, stored with the animal photos) or paste a link */
function PhotoField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const photo = await resizeImage(file);
      const { url } = await customFetch<{ url: string }>("/api/uploads/animal-photo", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: photo });
      onChange(url);
    } catch (err) {
      toast({ title: "Photo upload failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <div className="space-y-2">
      <Label htmlFor="fac-photo">Photo (optional)</Label>
      <div className="flex items-start gap-3">
        <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
            : value ? <img src={value} alt="Facility photo preview" className="h-full w-full object-cover" />
            : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>Upload photo</Button>
            {value && <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}><X className="mr-1 h-4 w-4" /> Remove</Button>}
          </div>
          <Input id="fac-photo" value={value} onChange={e => onChange(e.target.value)} placeholder="…or paste a photo link (https://)" />
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
    </div>
  );
}

function FacilityForm({ initial, existing, onClose }: { initial: Draft; existing: Facility[]; onClose: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD(p => ({ ...p, [k]: v })); setErrors(e => ({ ...e, [k]: "" })); };

  const validate = () => {
    const e: Record<string, string> = {};
    const name = d.name.trim();
    if (!name) e.name = "Enter the facility's name.";
    else if (existing.some(f => f.id !== d.id && f.name.trim().toLowerCase() === name.toLowerCase())) e.name = `A facility called "${name}" already exists.`;
    if (!d.type) e.type = "Choose a type.";
    if (d.lat == null || d.lng == null || !Number.isFinite(d.lat) || !Number.isFinite(d.lng)) e.position = "Set the map position.";
    if (d.photo_url.trim() && !/^https?:\/\//i.test(d.photo_url.trim())) e.photo_url = "The photo must be a web link (https://…).";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = { ...d, name: d.name.trim() };
      if (d.id) await api(`/api/admin/facilities/${d.id}`, jsonBody("PUT", body));
      else await api("/api/admin/facilities", jsonBody("POST", body));
      await queryClient.invalidateQueries({ queryKey: FACILITIES_KEY });
      toast({
        title: d.id ? "Facility updated" : "Facility added",
        description: d.is_active ? `${body.name} shows on visitors' maps within about 30 seconds.` : `${body.name} is saved as a draft: only staff see it.`,
      });
      onClose();
    } catch (err) {
      toast({ title: "Couldn't save the facility", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) => errors[k] ? <p className="text-xs text-destructive">{errors[k]}</p> : null;
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="fac-name">Name</Label>
        <Input id="fac-name" value={d.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Veterinary Hospital" aria-invalid={!!errors.name} />
        {err("name")}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="fac-type">Type</Label>
          <Select value={d.type} onValueChange={v => set("type", v as FacilityType)}>
            <SelectTrigger id="fac-type" aria-invalid={!!errors.type}><SelectValue placeholder="Choose a type" /></SelectTrigger>
            <SelectContent>{FACILITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}</SelectContent>
          </Select>
          {err("type")}
        </div>
        <div>
          <Label htmlFor="fac-status">Status</Label>
          <Select value={d.status} onValueChange={v => set("status", v as FacilityStatus)}>
            <SelectTrigger id="fac-status"><SelectValue /></SelectTrigger>
            <SelectContent>{FACILITY_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="fac-desc">Description (optional)</Label>
        <Textarea id="fac-desc" rows={2} value={d.description} onChange={e => set("description", e.target.value)} />
      </div>
      <PhotoField value={d.photo_url} onChange={v => set("photo_url", v)} />
      {err("photo_url")}
      <PositionPicker idPrefix="fac" lat={d.lat} lng={d.lng} color={facilityStatus(d.status).color}
        onChange={(lat, lng) => { setD(p => ({ ...p, lat, lng })); setErrors(e => ({ ...e, position: "" })); }} />
      {err("position")}
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label htmlFor="fac-published">Published</Label>
          <p className="text-xs text-muted-foreground">Off saves it as a draft that only staff see.</p>
        </div>
        <Switch id="fac-published" checked={d.is_active} onCheckedChange={v => set("is_active", v)} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {d.id ? "Save changes" : "Add facility"}</Button>
      </DialogFooter>
    </div>
  );
}

/** Facilities: the zoo's buildings, enclosures, water features and services, shown on the 3D map. */
export default function AdminFacilities() {
  const { data, isLoading, isError } = useFacilities();
  const facilities = useMemo(() => data ?? [], [data]);
  const staff = useStaff();
  const canWrite = staff.can("map.write");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Facility | null>(null);

  const shown = facilities.filter(f => {
    const q = search.trim().toLowerCase();
    // Search covers the name, description, type ("medical") and status ("maintenance")
    const haystack = [f.name, f.description ?? "", facilityType(f.type).label, facilityStatus(f.status).label].join(" ").toLowerCase();
    return (!q || haystack.includes(q))
      && (typeFilter === "all" || f.type === typeFilter) && (statusFilter === "all" || f.status === statusFilter);
  });

  const remove = async () => {
    if (!deleting) return;
    const f = deleting;
    setDeleting(null);
    try {
      await api(`/api/admin/facilities/${f.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: FACILITIES_KEY });
      toast({ title: "Facility deleted", description: `${f.name} is removed from the 3D map.` });
    } catch (err) {
      toast({ title: "Couldn't delete the facility", description: errorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Facilities</h1>
          <p className="text-muted-foreground">Buildings, enclosures, water features and services. Changes appear on the 3D map within 30 seconds.</p>
        </div>
        {canWrite && <Button onClick={() => setEditing(EMPTY)}><Plus className="mr-2 h-4 w-4" /> Add Facility</Button>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All facilities ({facilities.length})</CardTitle>
          <CardDescription>Search by name, description, type or status, or use the filters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search facilities…" className="pl-8" aria-label="Search facilities" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44" aria-label="Filter by type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {FACILITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48" aria-label="Filter by status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {FACILITY_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? <Skeleton className="h-64 w-full" /> : isError ? (
            <p className="text-destructive">Couldn't load facilities. Is the API server running?</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="hidden lg:table-cell">Position</TableHead>
                    {canWrite && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No facilities match.</TableCell></TableRow>
                  ) : shown.map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {f.photo_url ? <img src={f.photo_url} alt="" className="h-8 w-8 rounded object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded bg-muted text-base">{facilityType(f.type).emoji}</span>}
                          {f.name}
                        </div>
                      </TableCell>
                      <TableCell>{facilityType(f.type).label}</TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${facilityStatus(f.status).badge}`}>{facilityStatus(f.status).label}</span>
                        {f.is_active === false && <span className="ml-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Draft</span>}
                      </TableCell>
                      <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell" title={f.description ?? ""}>{f.description || "—"}</TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell"><MapPin className="mr-1 inline h-3 w-3" />{f.lat.toFixed(5)}, {f.lng.toFixed(5)}</TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => setEditing(toDraft(f))}><Pencil className="mr-1.5 h-4 w-4" /> Edit</Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleting(f)} aria-label={`Delete ${f.name}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <FacilityDialog draft={editing} existing={facilities} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={!!deleting} onOpenChange={o => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "facility"}?`}
        description={<p>It's removed permanently from the facility list and from visitors' maps (2D and 3D) within about 30 seconds. To take it off the map without losing it, edit it and turn off "Published" instead. The change is recorded in the audit log.</p>}
        confirmLabel="Delete" destructive onConfirm={remove}
      />
    </div>
  );
}
