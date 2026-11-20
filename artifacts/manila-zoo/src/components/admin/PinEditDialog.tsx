import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCreateMapPin,
  useUpdateMapPin,
  useSearchAnimals,
  useGetMapLayout,
  getListMapPinsQueryKey,
  getGetMapVersionQueryKey,
  getGetMapLayoutQueryKey,
  type MapPin,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, jsonBody, errorMessage } from "@/lib/adminApi";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, MapPin as MapPinIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PIN_CATEGORIES, categoryOf } from "@/lib/pinCategories";

type Form = {
  name: string;
  category: string;
  pin_type: string;
  description: string;
  color: string;
  animal_id: string; // "none" or an animal id
  feature_id: string; // "none" or a building/enclosure outline id
  lat: string;
  lng: string;
  is_active: boolean;
  show_label: boolean;
  image_url: string;
};

const DEFAULT_COLOR = "#2D6A4F";

const toForm = (p: MapPin): Form => ({
  name: p.name,
  category: categoryOf(p.pin_type).id,
  pin_type: p.pin_type,
  description: p.description ?? "",
  color: p.color || DEFAULT_COLOR,
  animal_id: p.animal_id == null ? "none" : String(p.animal_id),
  feature_id: "none",
  lat: String(p.lat),
  lng: String(p.lng),
  is_active: p.is_active ?? true,
  // Newer fields (not in the generated type yet)
  show_label: (p as { show_label?: boolean }).show_label ?? true,
  image_url: (p as { image_url?: string | null }).image_url ?? "",
});

const newForm = (lat: number, lng: number): Form => ({
  name: "", category: "animals", pin_type: "animal", description: "", color: DEFAULT_COLOR, animal_id: "none", feature_id: "none",
  lat: lat.toFixed(7), lng: lng.toFixed(7), is_active: false, show_label: true, image_url: "",
});

type Usage = { animals: { id: number; name: string }[]; qr_codes: string[]; events: string[]; features: { id: number; name: string }[] };

/**
 * Add or edit a map pin. `pin` edits an existing one; `draft` adds a new one at a spot picked on the
 * map. Saving bumps the map version, so visitor maps pick it up on their own, and the server records
 * who changed what in the audit log.
 */
export default function PinEditDialog({ pin, draft, onClose, onSaved }: {
  pin: MapPin | null;
  draft?: { lat: number; lng: number } | null;
  onClose: () => void;
  onSaved?: (pin: MapPin) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createPin = useCreateMapPin();
  const updatePin = useUpdateMapPin();
  const { data: animalsData } = useSearchAnimals({ limit: 500 });
  const animals = Array.isArray(animalsData) ? animalsData : [];
  const { data: layout } = useGetMapLayout();
  const outlines = (layout?.features ?? []).filter(f => ["enclosure", "building", "facility"].includes(f.feature_type));
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const open = pin != null || draft != null;
  const usage = useQuery({
    queryKey: ["/api/admin/map/pins", pin?.id, "usage"],
    queryFn: () => api<Usage>(`/api/admin/map/pins/${pin!.id}/usage`),
    enabled: pin != null,
  });
  const linkedOutline = usage.data?.features[0]?.id;

  useEffect(() => {
    setForm(pin ? toForm(pin) : draft ? newForm(draft.lat, draft.lng) : null);
  }, [pin, draft]);
  useEffect(() => {
    if (pin && linkedOutline != null) setForm(f => (f ? { ...f, feature_id: String(linkedOutline) } : f));
  }, [pin, linkedOutline]);

  const category = form ? PIN_CATEGORIES.find(c => c.id === form.category) ?? PIN_CATEGORIES[0]! : PIN_CATEGORIES[0]!;
  const setCategory = (id: string) => {
    const c = PIN_CATEGORIES.find(x => x.id === id)!;
    setForm(f => f && ({ ...f, category: id, pin_type: c.types[0]!.value, animal_id: c.animal ? f.animal_id : "none" }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const lat = parseFloat(form.lat), lng = parseFloat(form.lng);
    if (!form.name.trim()) { toast({ title: "Enter the place's name", variant: "destructive" }); return; }
    if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      toast({ title: "Enter a valid latitude (−90 to 90) and longitude (−180 to 180)", variant: "destructive" });
      return;
    }
    const data = {
      name: form.name.trim(),
      pin_type: form.pin_type,
      description: form.description.trim() || null,
      color: form.color,
      animal_id: form.animal_id === "none" ? null : Number(form.animal_id),
      lat,
      lng,
      is_active: form.is_active,
      // Read by the server alongside the generated fields
      ...({ show_label: form.show_label, image_url: form.image_url.trim() || null } as object),
    };
    setSaving(true);
    try {
      const saved = pin
        ? await updatePin.mutateAsync({ id: pin.id, data })
        : await createPin.mutateAsync({ data: data as Parameters<typeof createPin.mutateAsync>[0]["data"] });
      // The building or enclosure outline this place labels
      const wanted = form.feature_id === "none" ? null : Number(form.feature_id);
      const current = pin ? (linkedOutline ?? null) : null;
      if (wanted !== current) await api(`/api/admin/map/pins/${saved.id}/feature`, jsonBody("PUT", { feature_id: wanted }));
      toast({ title: pin ? `Saved ${data.name}` : `Added ${data.name}${data.is_active ? "" : " (hidden from visitors until you publish it)"}` });
      queryClient.invalidateQueries({ queryKey: getListMapPinsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMapLayoutQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMapVersionQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/map/pins"] });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast({ title: pin ? "Failed to save pin" : "Failed to add pin", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{pin ? `Edit ${pin.name}` : "Add a pin"}</DialogTitle>
          <DialogDescription>
            {pin ? "To move it, drag the pin on the map or change the coordinates here." : "Placed where you clicked on the map. You can drag it afterwards to fine-tune the spot."}
          </DialogDescription>
        </DialogHeader>
        {form && (
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin-name">Name</Label>
              <Input id="pin-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Info Desk" required autoFocus={!pin} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={setCategory}>
                  <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PIN_CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.emoji} {c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {category.types.length > 1 ? (
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.pin_type} onValueChange={v => setForm({ ...form, pin_type: v })}>
                    <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
                    <SelectContent>{category.types.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="pin-color">Marker color</Label>
                  <Input id="pin-color" type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="h-10 p-1" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin-description">Description</Label>
              <Textarea id="pin-description" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What visitors find here" />
            </div>
            {category.animal && (
              <div className="space-y-2">
                <Label>Featured animal</Label>
                <Select value={form.animal_id} onValueChange={v => setForm({ ...form, animal_id: v })}>
                  <SelectTrigger aria-label="Featured animal"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {animals.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {pin && usage.data && (
                  <p className="text-xs text-muted-foreground">
                    {usage.data.animals.length
                      ? <>Animals living here: {usage.data.animals.map(a => a.name).join(", ")}. Change an animal's exhibit on the Animals page.</>
                      : "No animals have this exhibit as their location yet. Set it on the Animals page."}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Building or enclosure outline</Label>
              <Select value={form.feature_id} onValueChange={v => setForm({ ...form, feature_id: v })}>
                <SelectTrigger aria-label="Building or enclosure outline"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {outlines.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name} ({f.feature_type})</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The 3D shape this place belongs to; tapping it on the visitor map opens this place.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pin-lat">Latitude</Label>
                <Input id="pin-lat" type="number" step="any" value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin-lng">Longitude</Label>
                <Input id="pin-lng" type="number" step="any" value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} required />
              </div>
            </div>
            <p className="-mt-2 flex items-center text-xs text-muted-foreground"><MapPinIcon className="mr-1 h-3.5 w-3.5" /> Must be inside Manila Zoo. Saved with 7 decimal places (about 1 cm).</p>
            {category.types.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="pin-color">Marker color</Label>
                <Input id="pin-color" type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="h-10 w-24 p-1" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="pin-image">Photo of the place (optional)</Label>
              <Input id="pin-image" type="url" placeholder="https://…" value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="pin-active">Published (shown on the visitor map)</Label>
                <p className="text-xs text-muted-foreground">{pin ? "Turn off to hide it from visitors; staff still see it here." : "New pins start hidden so you can check them first."}</p>
              </div>
              <Switch id="pin-active" checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="pin-label">Show the name label on the map</Label>
              <Switch id="pin-label" checked={form.show_label} onCheckedChange={v => setForm({ ...form, show_label: v })} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{pin ? "Save changes" : "Add pin"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
