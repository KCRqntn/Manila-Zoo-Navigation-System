import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMapLayout,
  useGetMapConfig,
  useListMapPins,
  useCreateMapFeature,
  useUpdateMapFeature,
  useDeleteMapFeature,
  useCreateMapPath,
  useUpdateMapPath,
  useDeleteMapPath,
  useUpdateMapConfig,
  useUpdateMapPin,
  getListMapPinsQueryKey,
  getGetMapLayoutQueryKey,
  getGetMapVersionQueryKey,
  getGetMapConfigQueryKey,
  type MapFeature,
  type MapPath,
  type MapPin,
  type MapFeatureInput,
  type MapFeatureInputFeatureType,
  type PolygonGeometry,
  type LineStringGeometry,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ZOO_VIEW_BOX, ZOO_VIEW_CENTER } from "@/lib/zooBoundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Trash2, Pencil, Move, RotateCcw, RotateCw, Plus, Box, PenLine, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ExtrudedFeatures, FlatFeatures, Walkways, FloorPlanOverlay, ParkFacilities2D, ParkTrees2D, isBridgePath, isPublished } from "@/components/map/ZooMapLayers";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FacilityDialog, newFacilityDraft, toFacilityDraft, type FacilityDraft } from "@/pages/admin/Facilities";
import { api, jsonBody, errorMessage } from "@/lib/adminApi";
import { useFacilities, useParkAreas, facilityType, facilityStatus, FACILITIES_KEY, type Facility } from "@/lib/parkAreas";
import { centerOf, rotatePoints, translatePoints } from "@/lib/shapeGeometry";
import { can3D } from "@/lib/browserSupport";

// The same WebGL 3D view visitors see, loaded only when the 3D editor is open
const Zoo3DView = lazy(() => import("@/components/map/Zoo3DView"));

const FEATURE_TYPES: { value: MapFeatureInputFeatureType; label: string; height: number }[] = [
  { value: "enclosure", label: "Enclosure", height: 3 },
  { value: "building", label: "Building", height: 6 },
  { value: "facility", label: "Facility", height: 4 },
  { value: "water", label: "Water feature", height: 0 },
  { value: "landscape", label: "Landscape / garden", height: 0 },
];
const PATH_KINDS = [{ value: "walkway", label: "Walkway" }, { value: "bridge", label: "Bridge" }] as const;
type PathKind = (typeof PATH_KINDS)[number]["value"];
const pathKind = (p: MapPath): PathKind => (isBridgePath(p) ? "bridge" : "walkway");

/** The editable properties of a footprint (new or existing) */
type FeatureForm = {
  name: string; feature_type: MapFeatureInputFeatureType; height_m: string; min_height_m: string;
  wall_color: string; roof_color: string; map_pin_id: string; is_active: boolean;
};
/** The editable properties of a walkway or bridge (new or existing) */
type PathForm = { name: string; kind: PathKind; is_open: boolean; is_accessible: boolean; is_active: boolean };

type Draft = ({ shape: "feature"; geometry: PolygonGeometry } & FeatureForm) | ({ shape: "path"; geometry: LineStringGeometry } & PathForm);
/** What's open for editing: its properties (dialog) or its shape (on the 2D map) */
type Selection = { kind: "feature" | "path"; id: number };
type ShapeEdit = { kind: "feature" | "path"; id: number; name: string; coords: number[][]; holes: number[][][] };
type Deleting = { kind: "feature" | "path" | "facility"; id: number; name: string };

const featureForm = (f?: MapFeature): FeatureForm => ({
  name: f?.name ?? "", feature_type: (f?.feature_type as MapFeatureInputFeatureType) ?? "enclosure",
  height_m: String(f?.height_m ?? 3), min_height_m: String(f?.min_height_m ?? 0),
  wall_color: f?.wall_color || "#bfa98a", roof_color: f?.roof_color || "#7a9a6e",
  map_pin_id: f?.map_pin_id != null ? String(f.map_pin_id) : "none", is_active: f ? f.is_active : true,
});
const pathForm = (p?: MapPath): PathForm => ({
  name: p?.name ?? "", kind: p ? pathKind(p) : "walkway",
  is_open: p?.is_open ?? true, is_accessible: p?.is_accessible ?? true, is_active: p ? isPublished(p) : true,
});

/** Adds leaflet-draw's toolbar (polygon, rectangle, polyline) and reports finished shapes. */
function DrawControl({ onCreated, onDrawing }: { onCreated: (layer: L.Layer, layerType: string) => void; onDrawing: (on: boolean) => void }) {
  const map = useMap();
  const callback = useRef({ onCreated, onDrawing });
  callback.current = { onCreated, onDrawing };

  useEffect(() => {
    const control = new L.Control.Draw({
      position: "topright",
      draw: {
        // showArea is off: leaflet-draw 1.0.4 throws in strict mode when computing area labels
        polygon: { allowIntersection: false, showArea: false },
        rectangle: { showArea: false } as L.DrawOptions.RectangleOptions,
        polyline: { shapeOptions: { color: "#a47148", weight: 6 } },
        circle: false,
        circlemarker: false,
        marker: false,
      },
    });
    map.addControl(control);
    const created = (e: L.LeafletEvent) => {
      const c = e as L.DrawEvents.Created;
      callback.current.onCreated(c.layer, c.layerType);
    };
    // While a shape is being drawn, clicks on existing shapes must not open their editor
    const start = () => callback.current.onDrawing(true);
    const stop = () => setTimeout(() => callback.current.onDrawing(false), 50);
    map.on(L.Draw.Event.CREATED, created);
    map.on(L.Draw.Event.DRAWSTART, start);
    map.on(L.Draw.Event.DRAWSTOP, stop);
    return () => {
      map.off(L.Draw.Event.CREATED, created);
      map.off(L.Draw.Event.DRAWSTART, start);
      map.off(L.Draw.Event.DRAWSTOP, stop);
      map.removeControl(control);
    };
  }, [map]);

  return null;
}

/** While adding a pin or facility, a click on the 2D map picks its spot (and the cursor shows a crosshair). */
function PickOnClick({ active, onPick }: { active: boolean; onPick: (lat: number, lng: number) => void }) {
  const map = useMap();
  const callback = useRef(onPick);
  callback.current = onPick;
  useEffect(() => {
    if (!active) return;
    const container = map.getContainer();
    container.style.cursor = "crosshair";
    const handler = (e: L.LeafletMouseEvent) => callback.current(e.latlng.lat, e.latlng.lng);
    map.on("click", handler);
    return () => { map.off("click", handler); container.style.cursor = ""; };
  }, [map, active]);
  return null;
}

const MOVE_ICON = L.divIcon({
  className: "",
  html: '<div title="Drag to move the whole shape" style="width:30px;height:30px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font:700 16px/1 system-ui;cursor:move">✥</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

type ShapeControls = { rotate: (deg: number) => void };

/**
 * Editing one shape on the 2D map: drag its corner handles to reshape it (leaflet-draw's editor),
 * drag the blue ✥ handle to move all of it, or rotate it (ShapeControls). Reports the shape after
 * every change as GeoJSON points ([lng, lat]); nothing is saved until the admin clicks Save.
 */
function ShapeEditLayer({ shape, onChange, controls }: {
  shape: ShapeEdit; onChange: (coords: number[][], holes: number[][][]) => void; controls: React.MutableRefObject<ShapeControls | null>;
}) {
  const map = useMap();
  const report = useRef(onChange);
  report.current = onChange;
  useEffect(() => {
    const isPolygon = shape.kind === "feature";
    const toLL = (pts: number[][]) => pts.map(([lng, lat]) => L.latLng(lat!, lng!));
    // A polygon's ring is drawn without its closing point (Leaflet closes it itself)
    const outer = isPolygon ? shape.coords.slice(0, -1) : shape.coords;
    let holes = shape.holes;
    const layer: L.Polyline = isPolygon
      ? (L.polygon(toLL(outer), { color: "#2563eb", weight: 3, fillColor: "#60a5fa", fillOpacity: 0.3 }) as unknown as L.Polyline)
      : L.polyline(toLL(outer), { color: "#2563eb", weight: 7, opacity: 0.9 });
    layer.addTo(map);
    const editing = (layer as unknown as { editing: { enable(): void; disable(): void } }).editing;
    editing.enable();

    const read = (): number[][] => {
      const ll = (isPolygon ? (layer.getLatLngs() as L.LatLng[][])[0]! : (layer.getLatLngs() as L.LatLng[]));
      return ll.map(p => [Math.round(p.lng * 1e7) / 1e7, Math.round(p.lat * 1e7) / 1e7]);
    };
    const write = (pts: number[][]) => layer.setLatLngs(toLL(pts));
    const handle = L.marker(layer.getBounds().getCenter(), { draggable: true, icon: MOVE_ICON, zIndexOffset: 2000 }).addTo(map);
    const emit = () => {
      const pts = read();
      report.current(isPolygon ? [...pts, pts[0]!] : pts, holes);
      handle.setLatLng(layer.getBounds().getCenter());
    };

    let last = handle.getLatLng();
    handle.on("dragstart", () => { editing.disable(); last = handle.getLatLng(); });
    handle.on("drag", () => {
      const p = handle.getLatLng();
      const dLng = p.lng - last.lng, dLat = p.lat - last.lat;
      last = p;
      write(translatePoints(read(), dLng, dLat));
      holes = holes.map(h => translatePoints(h, dLng, dLat));
    });
    handle.on("dragend", () => { editing.enable(); emit(); });
    layer.on("edit", emit); // a corner handle was dragged

    controls.current = {
      rotate: deg => {
        const pts = read();
        const center = centerOf(pts);
        editing.disable();
        write(rotatePoints(pts, deg, center));
        holes = holes.map(h => rotatePoints(h, deg, center));
        editing.enable();
        emit();
      },
    };
    map.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 20 });
    return () => { controls.current = null; editing.disable(); layer.remove(); handle.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, shape.kind, shape.id]);
  return null;
}

/** Form fields of a footprint, shared by "New footprint" and "Edit footprint". */
function FeatureFields({ value, onChange, pins, idPrefix }: { value: FeatureForm; onChange: (v: FeatureForm) => void; pins: MapPin[]; idPrefix: string }) {
  const set = <K extends keyof FeatureForm>(k: K, v: FeatureForm[K]) => onChange({ ...value, [k]: v });
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input id={`${idPrefix}-name`} value={value.name} onChange={e => set("name", e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={value.feature_type} onValueChange={v => {
            const t = FEATURE_TYPES.find(ft => ft.value === v)!;
            onChange({ ...value, feature_type: t.value, height_m: String(t.height) });
          }}>
            <SelectTrigger aria-label="Footprint type"><SelectValue /></SelectTrigger>
            <SelectContent>{FEATURE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-height`}>Height (m)</Label>
          <Input id={`${idPrefix}-height`} type="number" min={0} max={100} step={0.5} value={value.height_m} onChange={e => set("height_m", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-base`}>Raised from (m)</Label>
          <Input id={`${idPrefix}-base`} type="number" min={0} max={100} step={0.5} value={value.min_height_m} onChange={e => set("min_height_m", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-wall`}>Wall colour</Label>
          <Input id={`${idPrefix}-wall`} type="color" value={value.wall_color} onChange={e => set("wall_color", e.target.value)} className="h-10 p-1" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-roof`}>Roof colour</Label>
          <Input id={`${idPrefix}-roof`} type="color" value={value.roof_color} onChange={e => set("roof_color", e.target.value)} className="h-10 p-1" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Linked map pin (its exhibit or place)</Label>
        <Select value={value.map_pin_id} onValueChange={v => set("map_pin_id", v)}>
          <SelectTrigger aria-label="Linked map pin"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {pins.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <PublishedSwitch id={`${idPrefix}-published`} checked={value.is_active} onChange={v => set("is_active", v)} />
    </>
  );
}

/** Form fields of a walkway or bridge, shared by "New" and "Edit". */
function PathFields({ value, onChange, idPrefix }: { value: PathForm; onChange: (v: PathForm) => void; idPrefix: string }) {
  const set = <K extends keyof PathForm>(k: K, v: PathForm[K]) => onChange({ ...value, [k]: v });
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-name`}>Name</Label>
          <Input id={`${idPrefix}-name`} value={value.name} onChange={e => set("name", e.target.value)} placeholder={value.kind === "bridge" ? "e.g. Lagoon footbridge" : "e.g. Primates lakeside walk"} />
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={value.kind} onValueChange={v => set("kind", v as PathKind)}>
            <SelectTrigger aria-label="Walkway type"><SelectValue /></SelectTrigger>
            <SelectContent>{PATH_KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-open`}>Open (closed walkways show red and are never routed along)</Label>
        <Switch id={`${idPrefix}-open`} checked={value.is_open} onCheckedChange={v => set("is_open", v)} />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-accessible`}>Wheelchair accessible</Label>
        <Switch id={`${idPrefix}-accessible`} checked={value.is_accessible} onCheckedChange={v => set("is_accessible", v)} />
      </div>
      <PublishedSwitch id={`${idPrefix}-published`} checked={value.is_active} onChange={v => set("is_active", v)} />
    </>
  );
}

function PublishedSwitch({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div>
        <Label htmlFor={id}>Published</Label>
        <p className="text-xs text-muted-foreground">Off saves it as a draft: shown faded here, never on visitors' maps.</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const PublishedBadge = ({ on }: { on: boolean }) => <Badge variant={on ? "secondary" : "outline"}>{on ? "Published" : "Draft"}</Badge>;

/** A closed GeoJSON ring and its holes from an edited shape */
const polygonOf = (coords: number[][], holes: number[][][]): PolygonGeometry => ({ type: "Polygon", coordinates: [coords, ...holes] } as PolygonGeometry);

export default function MapLayoutEditor({ onEditPin, addMode = false, onPickLocation, visiblePinIds }: {
  onEditPin?: (pin: MapPin) => void;
  /** While true, a click on the map picks where a new pin goes */
  addMode?: boolean;
  onPickLocation?: (lat: number, lng: number) => void;
  /** The pins the list's search and category filter leave shown (all when undefined) */
  visiblePinIds?: Set<number>;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: layout, isLoading } = useGetMapLayout();
  const { data: config } = useGetMapConfig();
  const { data: pinsData } = useListMapPins();
  // Facilities and Park Area trees, so the editor shows everything the 3D view and visitors see
  const { data: facilitiesData } = useFacilities();
  const { data: zones } = useParkAreas();
  const facilities = useMemo(() => facilitiesData ?? [], [facilitiesData]);
  const allPins = Array.isArray(pinsData) ? pinsData : [];
  const pins = visiblePinIds ? allPins.filter(p => visiblePinIds.has(p.id)) : allPins;

  const createFeature = useCreateMapFeature();
  const updateFeature = useUpdateMapFeature();
  const deleteFeature = useDeleteMapFeature();
  const createPath = useCreateMapPath();
  const updatePath = useUpdateMapPath();
  const deletePath = useDeleteMapPath();
  const updateConfig = useUpdateMapConfig();
  const updatePin = useUpdateMapPin();

  const [map, setMap] = useState<L.Map | null>(null);
  // 3D to view and move places; 2D to draw, reshape and move outlines and walkways
  const [view, setView] = useState<"3d" | "2d">(can3D ? "3d" : "2d");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [form, setForm] = useState<FeatureForm | PathForm | null>(null);
  const [shapeEdit, setShapeEdit] = useState<ShapeEdit | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [facilityDraft, setFacilityDraft] = useState<FacilityDraft | null>(null);
  const [pickingFacility, setPickingFacility] = useState(false);
  const [saving, setSaving] = useState(false);
  const drawing = useRef(false);
  const shapeControls = useRef<ShapeControls | null>(null);
  const [overlay, setOverlay] = useState({ url: "", sw_lat: "", sw_lng: "", ne_lat: "", ne_lng: "" });

  useEffect(() => {
    if (!config) return;
    const s = (v: number | null | undefined) => (v == null ? "" : String(v));
    setOverlay({ url: config.map_image_url ?? "", sw_lat: s(config.sw_lat), sw_lng: s(config.sw_lng), ne_lat: s(config.ne_lat), ne_lng: s(config.ne_lng) });
  }, [config]);

  const features = layout?.features ?? [];
  const paths = layout?.paths ?? [];
  const selectedFeature = selected?.kind === "feature" ? features.find(f => f.id === selected.id) : undefined;
  const selectedPath = selected?.kind === "path" ? paths.find(p => p.id === selected.id) : undefined;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListMapPinsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMapLayoutQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMapVersionQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMapConfigQueryKey() });
    queryClient.invalidateQueries({ queryKey: FACILITIES_KEY });
  };

  // Wrap a mutation with the toast + refresh pattern used across the admin pages
  const run = async (action: () => Promise<unknown>, success: string, failure: string, description?: string) => {
    try {
      await action();
      toast({ title: success, description });
      refresh();
      return true;
    } catch (err) {
      toast({ title: failure, description: errorMessage(err, ""), variant: "destructive" });
      return false;
    }
  };

  // ─── Selecting things on the map ───
  const busy = () => drawing.current || addMode || pickingFacility || shapeEdit != null;
  const selectFeature = (f: MapFeature) => { if (busy()) return; setSelected({ kind: "feature", id: f.id }); setForm(featureForm(f)); };
  const selectPath = (p: MapPath) => { if (busy()) return; setSelected({ kind: "path", id: p.id }); setForm(pathForm(p)); };
  const selectFacility = (f: Facility) => { if (busy()) return; setFacilityDraft(toFacilityDraft(f)); };
  const closeEditor = () => { setSelected(null); setForm(null); };

  // ─── Adding ───
  const handleDrawn = (layer: L.Layer, layerType: string) => {
    if (layerType === "polyline") {
      const geometry = (layer as L.Polyline).toGeoJSON().geometry as LineStringGeometry;
      setDraft({ shape: "path", geometry, ...pathForm() });
    } else {
      const geometry = (layer as L.Polygon).toGeoJSON().geometry as PolygonGeometry;
      setDraft({ shape: "feature", geometry, ...featureForm() });
    }
  };

  const featureData = (f: FeatureForm) => ({
    name: f.name.trim(),
    feature_type: f.feature_type,
    height_m: Math.min(100, Math.max(0, parseFloat(f.height_m) || 0)),
    min_height_m: Math.min(100, Math.max(0, parseFloat(f.min_height_m) || 0)),
    wall_color: f.wall_color,
    roof_color: f.roof_color,
    map_pin_id: f.map_pin_id === "none" ? null : Number(f.map_pin_id),
    is_active: f.is_active,
  });
  const pathData = (p: PathForm) => ({
    name: p.name.trim() || null, kind: p.kind, is_open: p.is_open, is_accessible: p.is_accessible, is_active: p.is_active,
  });
  const publishNote = (on: boolean) => (on ? "Visitors' maps show it within about 30 seconds." : "Saved as a draft: only staff see it.");

  const saveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    let ok: boolean;
    if (draft.shape === "feature") {
      const data: MapFeatureInput & { is_active: boolean } = { ...featureData(draft), geometry: draft.geometry };
      ok = await run(() => createFeature.mutateAsync({ data }), `${draft.name.trim()} added`, "Failed to add footprint", publishNote(draft.is_active));
    } else {
      const { is_open: _open, ...rest } = pathData(draft);
      ok = await run(() => createPath.mutateAsync({ data: { ...rest, geometry: draft.geometry } }),
        `${draft.kind === "bridge" ? "Bridge" : "Walkway"} added`, "Failed to add walkway", publishNote(draft.is_active));
    }
    setSaving(false);
    if (ok) setDraft(null);
  };

  // ─── Editing properties ───
  const saveSelected = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !form) return;
    setSaving(true);
    const ok = selected.kind === "feature"
      ? await run(() => updateFeature.mutateAsync({ id: selected.id, data: featureData(form as FeatureForm) }),
          `${(form as FeatureForm).name.trim()} saved`, "Failed to save footprint", publishNote(form.is_active))
      : await run(() => updatePath.mutateAsync({ id: selected.id, data: pathData(form as PathForm) }),
          "Walkway saved", "Failed to save walkway", publishNote(form.is_active));
    setSaving(false);
    if (ok) closeEditor();
  };

  // ─── Reshaping, moving and rotating on the 2D map ───
  const startShapeEdit = (kind: "feature" | "path", id: number) => {
    const f = kind === "feature" ? features.find(x => x.id === id) : undefined;
    const p = kind === "path" ? paths.find(x => x.id === id) : undefined;
    if (!f && !p) return;
    const [outer = [], ...holes] = f ? f.geometry.coordinates : [p!.geometry.coordinates];
    closeEditor();
    setView("2d");
    setShapeEdit({ kind, id, name: f?.name ?? p?.name ?? "Walkway", coords: outer, holes: f ? holes : [] });
  };
  const saveShape = async () => {
    if (!shapeEdit) return;
    setSaving(true);
    const ok = shapeEdit.kind === "feature"
      ? await run(() => updateFeature.mutateAsync({ id: shapeEdit.id, data: { geometry: polygonOf(shapeEdit.coords, shapeEdit.holes) } }),
          `${shapeEdit.name} reshaped`, "Failed to save the shape", "Visitors' maps show the new shape within about 30 seconds.")
      : await run(() => updatePath.mutateAsync({ id: shapeEdit.id, data: { geometry: { type: "LineString", coordinates: shapeEdit.coords } as LineStringGeometry } }),
          `${shapeEdit.name} reshaped`, "Failed to save the shape", "Visitors' maps and directions use the new route within about 30 seconds.");
    setSaving(false);
    if (ok) setShapeEdit(null);
  };

  // ─── Deleting (always after a confirmation) ───
  const confirmDelete = async () => {
    const d = deleting;
    setDeleting(null);
    if (!d) return;
    const done = `${d.name} deleted`;
    const note = "It's gone from visitors' maps within about 30 seconds. A saved map version can bring back footprints and walkways.";
    let ok = false;
    if (d.kind === "feature") ok = await run(() => deleteFeature.mutateAsync({ id: d.id }), done, "Failed to delete footprint", note);
    else if (d.kind === "path") ok = await run(() => deletePath.mutateAsync({ id: d.id }), done, "Failed to delete walkway", note);
    else ok = await run(() => api(`/api/admin/facilities/${d.id}`, { method: "DELETE" }), done, "Failed to delete facility", "It's gone from visitors' maps within about 30 seconds.");
    if (ok) { closeEditor(); setFacilityDraft(null); }
  };

  // ─── Moving places and facilities ───
  const movePin = async (pin: MapPin, marker: L.Marker) => {
    const { lat, lng } = marker.getLatLng();
    const ok = await run(
      () => updatePin.mutateAsync({ id: pin.id, data: { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) } }),
      `Moved ${pin.name}`,
      `Failed to move ${pin.name}`,
    );
    // The position prop didn't change, so snap the marker back ourselves if saving failed
    if (!ok) marker.setLatLng([Number(pin.lat), Number(pin.lng)]);
  };
  const movePin3D = (pinId: number, lat: number, lng: number) => {
    const pin = allPins.find(p => p.id === pinId);
    return run(() => updatePin.mutateAsync({ id: pinId, data: { lat, lng } }), `Moved ${pin?.name ?? "place"}`, `Failed to move ${pin?.name ?? "place"}`);
  };
  const moveFacility = (f: Facility, lat: number, lng: number) =>
    run(() => api(`/api/admin/facilities/${f.id}`, jsonBody("PUT", { ...toFacilityDraft(f), lat, lng })), `Moved ${f.name}`, `Failed to move ${f.name}`);

  const pick = (lat: number, lng: number) => {
    if (pickingFacility) { setPickingFacility(false); setFacilityDraft(newFacilityDraft(Number(lat.toFixed(7)), Number(lng.toFixed(7)))); return; }
    onPickLocation?.(lat, lng);
  };

  const useCurrentView = () => {
    if (!map) return;
    const b = map.getBounds();
    const f = (n: number) => n.toFixed(6);
    setOverlay(o => ({ ...o, sw_lat: f(b.getSouth()), sw_lng: f(b.getWest()), ne_lat: f(b.getNorth()), ne_lng: f(b.getEast()) }));
  };

  const saveOverlay = (e: React.FormEvent) => {
    e.preventDefault();
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    run(() => updateConfig.mutateAsync({
      data: {
        map_image_url: overlay.url,
        sw_lat: num(overlay.sw_lat), sw_lng: num(overlay.sw_lng),
        ne_lat: num(overlay.ne_lat), ne_lng: num(overlay.ne_lng),
      },
    }), "Floor plan overlay saved", "Failed to save overlay");
  };

  // Same opening frame as the visitor map's 2D and 3D views
  const center: [number, number] = ZOO_VIEW_CENTER;
  const picking = addMode || pickingFacility;
  // The shape being edited is drawn by its editor only
  const shownFeatures = shapeEdit?.kind === "feature" ? features.filter(f => f.id !== shapeEdit.id) : features;
  const shownPaths = shapeEdit?.kind === "path" ? paths.filter(p => p.id !== shapeEdit.id) : paths;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Map Layout ({view === "3d" ? "3D" : "2D drawing"})</CardTitle>
            <CardDescription>
              {view === "3d"
                ? "The zoo in 3D, as visitors see it, plus drafts and hidden places (faded). Drag a place to move it, click it to edit. Switch to 2D to draw, reshape, move or rotate outlines and walkways."
                : "Draw outlines (polygon or rectangle tool) and walkways or bridges (line tool). Click any outline, walkway or facility to edit it; drag places and facilities to move them."}
              {" "}Visitor maps pick up changes within about 30 seconds.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant={pickingFacility ? "default" : "outline"} onClick={() => { setPickingFacility(p => !p); setShapeEdit(null); }}>
              {pickingFacility ? <><X className="mr-1.5 h-4 w-4" /> Cancel</> : <><Plus className="mr-1.5 h-4 w-4" /> Add facility</>}
            </Button>
            <div role="group" aria-label="Editor view" className="flex rounded-full border bg-muted p-1">
              <Button type="button" size="sm" variant={view === "3d" ? "default" : "ghost"} className="rounded-full" onClick={() => { setShapeEdit(null); setView("3d"); }} aria-pressed={view === "3d"}
                disabled={!can3D} title={can3D ? undefined : "This browser is too old for the 3D view"}>
                <Box className="mr-1.5 h-4 w-4" /> 3D view
              </Button>
              <Button type="button" size="sm" variant={view === "2d" ? "default" : "ghost"} className="rounded-full" onClick={() => setView("2d")} aria-pressed={view === "2d"}>
                <PenLine className="mr-1.5 h-4 w-4" /> 2D drawing
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {picking && (
          <p role="status" className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
            📍 Click the spot on the map where the new {pickingFacility ? "facility" : "pin"} goes.
          </p>
        )}
        {shapeEdit && (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
            <span className="mr-auto font-medium text-primary">
              <Move className="mr-1 inline h-4 w-4" /> Editing the shape of <strong>{shapeEdit.name}</strong>: drag the corner handles to reshape it, the blue ✥ handle to move it.
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => shapeControls.current?.rotate(-15)} aria-label="Rotate 15° anticlockwise"><RotateCcw className="mr-1 h-4 w-4" /> 15°</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => shapeControls.current?.rotate(-1)} aria-label="Rotate 1° anticlockwise">−1°</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => shapeControls.current?.rotate(1)} aria-label="Rotate 1° clockwise">+1°</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => shapeControls.current?.rotate(15)} aria-label="Rotate 15° clockwise"><RotateCw className="mr-1 h-4 w-4" /> 15°</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShapeEdit(null)}><X className="mr-1 h-4 w-4" /> Cancel</Button>
            <Button type="button" size="sm" onClick={saveShape} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Save shape
            </Button>
          </div>
        )}
        {view === "3d" ? (
          <div className="relative h-[560px] overflow-hidden rounded-md border">
            <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
              <Zoo3DView
                center={center}
                fitZoo
                treeLegend
                zoom={config?.default_zoom || 18}
                features={features}
                paths={paths}
                pins={pins.map(p => ({ ...p, lat: Number(p.lat), lng: Number(p.lng), hidden: !p.is_active }))}
                route={null}
                showBuildings
                showWalkways
                selectedPinId={null}
                flyTo={null}
                keepFeatureIds={null}
                onSelectPin={id => { const pin = pins.find(p => p.id === id); if (pin) onEditPin?.(pin); }}
                visitor={null}
                picking={picking}
                onPick={pick}
                onUnsupported={() => { setView("2d"); toast({ title: "3D isn't supported in this browser", description: "Showing the 2D editor instead." }); }}
                onMovePin={movePin3D}
              />
            </Suspense>
          </div>
        ) : (
        <div className="h-[480px] rounded-md overflow-hidden border relative z-0">
          <MapContainer bounds={ZOO_VIEW_BOX} boundsOptions={{ padding: [16, 16] }} zoomSnap={0.25} maxZoom={21} ref={setMap} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxNativeZoom={19}
              maxZoom={21}
            />
            <FloorPlanOverlay config={config} opacity={0.6} />
            {/* Shapes are only clickable when not picking a spot or reshaping (their click would swallow the map's) */}
            <FlatFeatures features={shownFeatures} includeDrafts onSelect={picking || shapeEdit ? undefined : selectFeature} selectedId={selected?.kind === "feature" ? selected.id : null} />
            <Walkways paths={shownPaths} onSelect={picking || shapeEdit ? undefined : selectPath} selectedId={selected?.kind === "path" ? selected.id : null} />
            <ExtrudedFeatures features={shownFeatures} includeDrafts onSelect={selectFeature}
              highlightId={selected?.kind === "feature" ? selected.id : null} />
            {zones && <ParkTrees2D zones={zones} />}
            <ParkFacilities2D facilities={facilities} onSelect={selectFacility} onMove={moveFacility} />
            {pins.map(p => (
              <Marker
                key={`${p.id}:${p.name}`}
                position={[Number(p.lat), Number(p.lng)]}
                icon={pinIcon(p.color || "#2D6A4F")}
                opacity={p.is_active ? 1 : 0.45}
                draggable
                autoPan
                eventHandlers={{
                  dragend: e => movePin(p, e.target as L.Marker),
                  click: () => { if (!busy()) onEditPin?.(p); },
                }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  {p.name}{p.is_active ? "" : " (hidden)"} · drag to move, click to edit
                </Tooltip>
              </Marker>
            ))}
            {shapeEdit && <ShapeEditLayer shape={shapeEdit} controls={shapeControls}
              onChange={(coords, holes) => setShapeEdit(s => (s ? { ...s, coords, holes } : s))} />}
            {!shapeEdit && <DrawControl onCreated={handleDrawn} onDrawing={on => { drawing.current = on; }} />}
            <PickOnClick active={picking} onPick={pick} />
          </MapContainer>
        </div>
        )}

        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <Tabs defaultValue="features">
            <TabsList className="flex-wrap">
              <TabsTrigger value="features">Footprints ({features.length})</TabsTrigger>
              <TabsTrigger value="paths">Walkways & bridges ({paths.length})</TabsTrigger>
              <TabsTrigger value="facilities">Facilities ({facilities.length})</TabsTrigger>
              <TabsTrigger value="overlay">Floor plan overlay</TabsTrigger>
            </TabsList>

            <TabsContent value="features">
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Height</TableHead>
                      <TableHead>Linked pin</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {features.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No footprints yet. Draw one on the 2D map.</TableCell></TableRow>
                    ) : features.map(f => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">
                          <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: f.roof_color || "#7a9a6e" }} aria-hidden />
                          {f.name}
                        </TableCell>
                        <TableCell className="capitalize">{f.feature_type}</TableCell>
                        <TableCell>{f.height_m} m</TableCell>
                        <TableCell>{allPins.find(p => p.id === f.map_pin_id)?.name ?? "-"}</TableCell>
                        <TableCell>
                          <Switch
                            checked={f.is_active}
                            onCheckedChange={v => run(() => updateFeature.mutateAsync({ id: f.id, data: { is_active: v } }), v ? `${f.name} published` : `${f.name} unpublished`, "Failed to update footprint", publishNote(v))}
                            aria-label={`Publish ${f.name}`}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelected({ kind: "feature", id: f.id }); setForm(featureForm(f)); }} aria-label={`Edit ${f.name}`}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startShapeEdit("feature", f.id)} aria-label={`Reshape, move or rotate ${f.name}`} title="Reshape, move or rotate on the map"><Move className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleting({ kind: "feature", id: f.id, name: f.name })} aria-label={`Delete ${f.name}`}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="paths">
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead>Open</TableHead>
                      <TableHead>Wheelchair</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paths.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No walkways yet. Draw one with the line tool on the 2D map.</TableCell></TableRow>
                    ) : paths.map(p => {
                      const label = p.name || `${isBridgePath(p) ? "Bridge" : "Walkway"} #${p.id}`;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{label}</TableCell>
                          <TableCell>{isBridgePath(p) ? "🌉 Bridge" : "Walkway"}</TableCell>
                          <TableCell>
                            <Switch checked={isPublished(p)}
                              onCheckedChange={v => run(() => updatePath.mutateAsync({ id: p.id, data: { is_active: v } }), v ? `${label} published` : `${label} unpublished`, "Failed to update walkway", publishNote(v))}
                              aria-label={`Publish ${label}`} />
                          </TableCell>
                          <TableCell>
                            <Switch checked={p.is_open}
                              onCheckedChange={v => run(() => updatePath.mutateAsync({ id: p.id, data: { is_open: v } }), v ? "Walkway reopened" : "Walkway closed", "Failed to update walkway")}
                              aria-label={`${label} open`} />
                          </TableCell>
                          <TableCell>
                            <Switch checked={p.is_accessible}
                              onCheckedChange={v => run(() => updatePath.mutateAsync({ id: p.id, data: { is_accessible: v } }), "Accessibility updated", "Failed to update walkway")}
                              aria-label={`${label} wheelchair accessible`} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelected({ kind: "path", id: p.id }); setForm(pathForm(p)); }} aria-label={`Edit ${label}`}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startShapeEdit("path", p.id)} aria-label={`Reshape or move ${label}`} title="Reshape, move or rotate on the map"><Move className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleting({ kind: "path", id: p.id, name: label })} aria-label={`Delete ${label}`}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="facilities">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>Drag a facility on the 2D map to move it, or click it to edit. Trees are managed in <a className="underline" href={`${import.meta.env.BASE_URL}admin/park-areas`}>Park Areas</a>.</span>
                <Button size="sm" variant="outline" onClick={() => setFacilityDraft(newFacilityDraft())}><Plus className="mr-1.5 h-4 w-4" /> Add by coordinates</Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {facilities.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No facilities yet. Click "Add facility", then the spot on the map.</TableCell></TableRow>
                    ) : facilities.map(f => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{facilityType(f.type).emoji} {f.name}</TableCell>
                        <TableCell>{facilityType(f.type).label}</TableCell>
                        <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${facilityStatus(f.status).badge}`}>{facilityStatus(f.status).label}</span></TableCell>
                        <TableCell><PublishedBadge on={isPublished(f)} /></TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFacilityDraft(toFacilityDraft(f))} aria-label={`Edit ${f.name}`}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleting({ kind: "facility", id: f.id, name: f.name })} aria-label={`Delete ${f.name}`}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="overlay">
              <form onSubmit={saveOverlay} className="space-y-4 max-w-xl">
                <p className="text-sm text-muted-foreground">
                  Place a custom zoo floor plan or illustrated map over the base map. Zoom the map above so it covers
                  exactly the area the image shows, then click “Use current map view”.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="overlay-url">Image URL</Label>
                  <Input id="overlay-url" value={overlay.url} onChange={e => setOverlay({ ...overlay, url: e.target.value })} placeholder="https://…/zoo-floor-plan.png" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {(["sw_lat", "sw_lng", "ne_lat", "ne_lng"] as const).map(k => (
                    <div key={k} className="space-y-2">
                      <Label htmlFor={`overlay-${k}`}>{{ sw_lat: "South-west latitude", sw_lng: "South-west longitude", ne_lat: "North-east latitude", ne_lng: "North-east longitude" }[k]}</Label>
                      <Input id={`overlay-${k}`} type="number" step="any" value={overlay[k]} onChange={e => setOverlay({ ...overlay, [k]: e.target.value })} />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={useCurrentView} disabled={view !== "2d"}>Use current map view</Button>
                  <Button type="submit" disabled={updateConfig.isPending}>
                    {updateConfig.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save overlay"}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        )}

        {/* New footprint / walkway, after drawing it */}
        <Dialog open={draft != null} onOpenChange={open => { if (!open) setDraft(null); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{draft?.shape === "path" ? "New walkway or bridge" : "New footprint"}</DialogTitle>
              <DialogDescription>
                {draft?.shape === "path" ? "Walkways show visitors where they can walk, and directions follow them. A bridge is drawn as a timber footbridge." : "Height controls how tall the shape looks in 3D; water and gardens lie flat."}
              </DialogDescription>
            </DialogHeader>
            {draft && (
              <form onSubmit={saveDraft} className="space-y-4">
                {draft.shape === "feature"
                  ? <FeatureFields idPrefix="draft" value={draft} pins={allPins} onChange={v => setDraft({ ...draft, ...v })} />
                  : <PathFields idPrefix="draft" value={draft} onChange={v => setDraft({ ...draft, ...v })} />}
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => setDraft(null)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit a footprint / walkway */}
        <Dialog open={selected != null && form != null} onOpenChange={open => { if (!open) closeEditor(); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selected?.kind === "path" ? `Edit ${selectedPath?.name || "walkway"}` : `Edit ${selectedFeature?.name ?? "footprint"}`}</DialogTitle>
              <DialogDescription>Changes are saved to the map database and reach visitors' maps within about 30 seconds.</DialogDescription>
            </DialogHeader>
            {selected && form && (
              <form onSubmit={saveSelected} className="space-y-4">
                {selected.kind === "feature"
                  ? <FeatureFields idPrefix="edit" value={form as FeatureForm} pins={allPins} onChange={setForm} />
                  : <PathFields idPrefix="edit" value={form as PathForm} onChange={setForm} />}
                <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="text-destructive" onClick={() => {
                      const name = selected.kind === "feature" ? selectedFeature?.name ?? "Footprint" : selectedPath?.name || "Walkway";
                      setDeleting({ kind: selected.kind, id: selected.id, name });
                    }}><Trash2 className="mr-1.5 h-4 w-4" /> Delete</Button>
                    <Button type="button" variant="outline" onClick={() => startShapeEdit(selected.kind, selected.id)}><Move className="mr-1.5 h-4 w-4" /> Reshape / move / rotate</Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" type="button" onClick={closeEditor}>Cancel</Button>
                    <Button type="submit" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save changes"}</Button>
                  </div>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

        <FacilityDialog draft={facilityDraft} existing={facilities} onClose={() => { setFacilityDraft(null); refresh(); }} />

        <ConfirmDialog
          open={deleting != null}
          onOpenChange={o => { if (!o) setDeleting(null); }}
          destructive
          confirmLabel="Delete permanently"
          title={`Delete ${deleting?.name ?? ""}?`}
          description={
            <>
              <p>This removes it from the map database. It disappears from visitors' maps (2D and 3D) within about 30 seconds and stays gone after a refresh.</p>
              <p>To take it off visitors' maps without losing it, turn off "Published" instead.</p>
              {deleting?.kind === "path" && <p>Directions stop using this walkway straight away.</p>}
            </>
          }
          onConfirm={() => void confirmDelete()}
        />
      </CardContent>
    </Card>
  );
}

function pinIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);cursor:grab"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}
