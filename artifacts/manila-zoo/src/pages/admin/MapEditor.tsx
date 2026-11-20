import React, { useMemo, useRef, useState } from "react";
import {
  useListMapPins,
  useDeleteMapPin,
  getListMapPinsQueryKey,
  getGetMapLayoutQueryKey,
  getGetMapVersionQueryKey,
  type MapPin,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Loader2, Pencil, Search, X, Keyboard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MapLayoutEditor from "@/components/admin/MapLayoutEditor";
import PinEditDialog from "@/components/admin/PinEditDialog";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { api, jsonBody, errorMessage, formatDateTime, useStaff } from "@/lib/adminApi";
import { PIN_CATEGORIES, categoryOf, typeLabel } from "@/lib/pinCategories";

// "Type coordinates instead" starts a new pin in the middle of the zoo
const ZOO_CENTER = { lat: 14.5648, lng: 120.9878 };

type Usage = { animals: { id: number; name: string }[]; qr_codes: string[]; events: string[]; features: { id: number; name: string }[] };

/**
 * Map Management: every pin on the visitor map. Add a pin by clicking its spot on the map, edit or
 * drag it, or delete it after a confirmation that lists what's linked to it. Every change is saved
 * through the API, recorded in the audit log, and reaches visitors' maps within about 30 seconds.
 */
export default function AdminMapEditor() {
  const { data: pinsData, isLoading } = useListMapPins();
  const pins = Array.isArray(pinsData) ? pinsData : [];
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const staff = useStaff();
  const canEdit = staff.can("map.write");
  const deletePin = useDeleteMapPin();
  const mapRef = useRef<HTMLDivElement>(null);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [editingPin, setEditingPin] = useState<MapPin | null>(null);
  const [deleting, setDeleting] = useState<MapPin | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const usage = useQuery({
    queryKey: ["/api/admin/map/pins", deleting?.id, "usage"],
    queryFn: () => api<Usage>(`/api/admin/map/pins/${deleting!.id}/usage`),
    enabled: deleting != null,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pins.filter(p => (category === "all" || categoryOf(p.pin_type).id === category)
      && (!q || p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q) || (p.animal_name ?? "").toLowerCase().includes(q)));
  }, [pins, search, category]);
  const filtering = category !== "all" || search.trim() !== "";
  const visibleIds = useMemo(() => (filtering ? new Set(filtered.map(p => p.id)) : undefined), [filtered, filtering]);
  const counts = useMemo(() => Object.fromEntries(PIN_CATEGORIES.map(c => [c.id, pins.filter(p => categoryOf(p.pin_type).id === c.id).length])), [pins]);

  const startAdding = () => {
    setAdding(true);
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDelete = async (pin: MapPin) => {
    try {
      await deletePin.mutateAsync({ id: pin.id });
      toast({ title: `Deleted ${pin.name}`, description: "It's gone from the visitor map too." });
      queryClient.invalidateQueries({ queryKey: getListMapPinsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMapLayoutQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMapVersionQueryKey() });
    } catch (error) {
      toast({ title: `Couldn't delete ${pin.name}`, description: errorMessage(error), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Map Management</h1>
          <p className="text-sm text-muted-foreground">Pins, buildings and walkways on the visitor map. Changes reach visitors' maps within about 30 seconds; hidden pins are only shown to staff.</p>
        </div>
        {canEdit && (
          adding ? (
            <Button variant="outline" onClick={() => setAdding(false)}><X className="mr-2 h-4 w-4" /> Cancel adding</Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={startAdding}><Plus className="mr-2 h-4 w-4" /> Add pin</Button>
              <Button variant="ghost" onClick={() => setDraft(ZOO_CENTER)} title="Add a pin by typing its coordinates"><Keyboard className="mr-2 h-4 w-4" /> Type coordinates</Button>
            </div>
          )
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={`${import.meta.env.BASE_URL}map`} target="_blank" rel="noreferrer">Preview as a visitor (published pins only)</a>
        </Button>
      </div>

      <div ref={mapRef} className="scroll-mt-4">
        <MapLayoutEditor
          onEditPin={pin => { if (!adding) setEditingPin(pin); }}
          addMode={adding}
          onPickLocation={(lat, lng) => { setAdding(false); setDraft({ lat, lng }); }}
          visiblePinIds={visibleIds}
        />
      </div>
      <PinEditDialog pin={editingPin} draft={draft} onClose={() => { setEditingPin(null); setDraft(null); }} />

      <Card>
        <CardHeader>
          <CardTitle>Pins ({pins.length})</CardTitle>
          <CardDescription>Search and filter apply to the map above too.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, description or animal…" className="pl-8" aria-label="Search pins" />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[230px]" aria-label="Filter by category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories ({pins.length})</SelectItem>
                {PIN_CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.emoji} {c.label} ({counts[c.id] ?? 0})</SelectItem>)}
              </SelectContent>
            </Select>
            {filtering && <Button variant="ghost" onClick={() => { setSearch(""); setCategory("all"); }}>Clear filters</Button>}
          </div>
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Linked animal</TableHead>
                    <TableHead>Coordinates</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last changed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        {pins.length === 0 ? "No pins yet. Click \"Add pin\", then click the spot on the map." : "No pins match your search or filter."}
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(pin => {
                    const cat = categoryOf(pin.pin_type);
                    return (
                      <TableRow key={pin.id}>
                        <TableCell className="font-medium">
                          {pin.name}
                          {pin.description && <p className="line-clamp-1 max-w-xs text-xs font-normal text-muted-foreground">{pin.description}</p>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {cat.emoji} {cat.label}
                          {cat.types.length > 1 && <span className="block text-xs text-muted-foreground">{typeLabel(pin.pin_type).replace(/ \(.*\)$/, "")}</span>}
                        </TableCell>
                        <TableCell className="text-sm">{pin.animal_name || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {Number(pin.lat).toFixed(6)}, {Number(pin.lng).toFixed(6)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={pin.is_active ? "secondary" : "outline"}>{pin.is_active ? "Published" : "Hidden"}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(pin.updated_at ?? pin.created_at)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {canEdit && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingPin(pin)} aria-label={`Edit ${pin.name}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleting(pin)} aria-label={`Delete ${pin.name}`} disabled={deletePin.isPending}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Who added, changed or removed each pin, and when, is in the <a href={`${import.meta.env.BASE_URL}admin/audit`} className="underline">Audit Logs</a> (resource "map_pins").</p>
        </CardContent>
      </Card>

      <MapVersions />

      {deleting && (
        <ConfirmDialog open onOpenChange={o => !o && setDeleting(null)} destructive confirmLabel="Delete pin"
          title={`Delete ${deleting.name}?`}
          description={
            <>
              <p>It's removed from the visitor map within about 30 seconds. To take it off the map without losing it, edit it and turn off "Published" instead.</p>
              {usage.isLoading ? <p>Checking what's linked to it…</p> : usage.data && (
                <ul className="list-disc space-y-1 pl-5">
                  {usage.data.animals.length > 0 && <li><strong>{usage.data.animals.length} animal{usage.data.animals.length === 1 ? "" : "s"}</strong> live here ({usage.data.animals.map(a => a.name).join(", ")}). They'll have no exhibit until you set one on the Animals page.</li>}
                  {usage.data.qr_codes.length > 0 && <li>Its location QR code{usage.data.qr_codes.length === 1 ? "" : "s"} ({usage.data.qr_codes.join(", ")}) will be deleted.</li>}
                  {usage.data.events.length > 0 && <li>Event{usage.data.events.length === 1 ? "" : "s"} held here ({usage.data.events.join(", ")}) will no longer show a place on the map.</li>}
                  {usage.data.features.length > 0 && <li>The outline {usage.data.features.map(f => f.name).join(", ")} stays, without a linked place.</li>}
                  {usage.data.animals.length + usage.data.qr_codes.length + usage.data.events.length + usage.data.features.length === 0 && <li>Nothing else is linked to it.</li>}
                </ul>
              )}
              <p>A saved map version can bring it back.</p>
            </>
          }
          onConfirm={() => { const pin = deleting; setDeleting(null); void handleDelete(pin); }} />
      )}
    </div>
  );
}

type MapVersion = { id: number; created_at: string; created_by: string | null; reason: string; note: string | null; pin_count: number; feature_count: number; path_count: number };

/** Saved map versions: save one before big changes, restore one to undo them. */
function MapVersions() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const staff = useStaff();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<MapVersion | null>(null);
  const versions = useQuery({ queryKey: ["/api/admin/map/versions"], queryFn: () => api<MapVersion[]>("/api/admin/map/versions") });
  const refreshMap = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/map/versions"] });
    qc.invalidateQueries({ queryKey: getListMapPinsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMapLayoutQueryKey() });
  };
  const save = async () => {
    setBusy(true);
    try {
      await api("/api/admin/map/versions", jsonBody("POST", { note }));
      setNote("");
      toast({ title: "Map version saved" });
      refreshMap();
    } catch (err) { toast({ title: "Not saved", description: errorMessage(err), variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const restore = async (v: MapVersion) => {
    setBusy(true);
    try {
      const r = await api<{ safety_version: number }>(`/api/admin/map/versions/${v.id}/restore`, jsonBody("POST", {}));
      toast({ title: `Map restored to version #${v.id}`, description: `The previous map was saved as version #${r.safety_version}.` });
      refreshMap();
    } catch (err) { toast({ title: "Not restored", description: errorMessage(err), variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const REASON: Record<string, string> = { manual: "Saved", auto: "Automatic", before_restore: "Before a restore" };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved map versions</CardTitle>
        <p className="text-sm text-muted-foreground">A version keeps every place, building, walkway and map setting. One is also saved automatically before map edits (at most hourly) and before every restore.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {staff.can("map.write") && (
          <div className="flex flex-wrap gap-2">
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Note, e.g. Before moving the reptile pins" className="max-w-md flex-1" aria-label="Version note" />
            <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save current map</Button>
          </div>
        )}
        <div className="max-h-72 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Saved</TableHead><TableHead>Kind</TableHead><TableHead>Contents</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {(versions.data ?? []).length === 0 ? <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No versions yet.</TableCell></TableRow> : versions.data!.map(v => (
                <TableRow key={v.id}>
                  <TableCell>{v.id}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(v.created_at)}<br /><span className="text-muted-foreground">{v.created_by ?? "system"}</span></TableCell>
                  <TableCell className="text-xs">{REASON[v.reason] ?? v.reason}{v.note ? <><br /><span className="text-muted-foreground">{v.note}</span></> : null}</TableCell>
                  <TableCell className="text-xs">{v.pin_count} places, {v.feature_count} buildings, {v.path_count} walkways</TableCell>
                  <TableCell className="text-right">{staff.can("map.write") && <Button size="sm" variant="outline" disabled={busy} onClick={() => setRestoring(v)}>Restore</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {restoring && (
        <ConfirmDialog open onOpenChange={o => !o && setRestoring(null)} confirmLabel="Restore version"
          title={`Restore map version #${restoring.id}?`}
          description={<><p>Places, buildings and walkways go back to how they were on {formatDateTime(restoring.created_at)}. The current map is saved as a version first, so this can be undone.</p><p>Places added since then are hidden (not deleted), so their QR codes keep working.</p></>}
          onConfirm={() => { const v = restoring; setRestoring(null); void restore(v); }} />
      )}
    </Card>
  );
}
