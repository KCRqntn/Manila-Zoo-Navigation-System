import React, { useRef, useState } from "react";
import { customFetch, useGetAnimalGallery, getGetAnimalGalleryQueryKey, type Animal, type Category } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ImagePlus, X, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { resizeImage } from "@/lib/imageResize";

const NONE = "none";
const STATUSES = ["Least Concern", "Near Threatened", "Vulnerable", "Endangered", "Critically Endangered", "Extinct in the Wild", "Data Deficient"];
export type PinOption = { id: number; name: string; pin_type: string };

/** Everything the form edits, as text (inputs work in strings; numbers are parsed on save). */
type Draft = {
  image_url: string; name: string; common_name: string; scientific_name: string;
  category_id: string; conservation_status: string; location_id: string;
  description: string; interesting_facts: string; habitat: string; diet: string; feeding_schedule: string;
  weight_kg: string; height_cm: string; lifespan_years: string; is_featured: boolean;
  kingdom: string; phylum: string; class: string; order: string; family: string; genus: string; species: string;
};
const TAXONOMY = ["kingdom", "phylum", "class", "order", "family", "genus", "species"] as const;

function toDraft(a?: Animal | null): Draft {
  const s = (v: unknown) => (v == null ? "" : String(v));
  // Facts are stored as a list; the form shows one per line
  const facts = (a as { interesting_facts?: unknown } | null | undefined)?.interesting_facts;
  return {
    image_url: s(a?.image_url), name: s(a?.name), common_name: s(a?.common_name), scientific_name: s(a?.scientific_name),
    category_id: a?.category_id != null ? String(a.category_id) : NONE,
    conservation_status: a?.conservation_status || NONE,
    location_id: a?.location_id != null ? String(a.location_id) : NONE,
    description: s(a?.description), interesting_facts: Array.isArray(facts) ? facts.join("\n") : s(facts),
    habitat: s(a?.habitat), diet: s(a?.diet), feeding_schedule: s(a?.feeding_schedule),
    weight_kg: s(a?.weight_kg), height_cm: s(a?.height_cm), lifespan_years: s(a?.lifespan_years),
    is_featured: !!a?.is_featured,
    kingdom: s(a?.kingdom) || "Animalia", phylum: s(a?.phylum) || "Chordata", class: s(a?.class), order: s(a?.order),
    family: s(a?.family), genus: s(a?.genus), species: s(a?.species),
  };
}

/** The draft as an API body; empty fields become null so editing can also clear them. */
function toBody(d: Draft) {
  const text = (v: string) => v.trim() || null;
  const num = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
  const pick = (v: string) => (v === NONE ? null : v);
  return {
    name: d.name.trim(), image_url: text(d.image_url), common_name: text(d.common_name), scientific_name: text(d.scientific_name),
    category_id: pick(d.category_id) == null ? null : Number(d.category_id),
    conservation_status: pick(d.conservation_status),
    location_id: pick(d.location_id) == null ? null : Number(d.location_id),
    description: text(d.description), interesting_facts: text(d.interesting_facts),
    habitat: text(d.habitat), diet: text(d.diet), feeding_schedule: text(d.feeding_schedule),
    weight_kg: num(d.weight_kg), height_cm: num(d.height_cm), lifespan_years: num(d.lifespan_years),
    is_featured: d.is_featured,
    ...Object.fromEntries(TAXONOMY.map(k => [k, text(d[k])])),
  };
}

function PhotoField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const photo = await resizeImage(file);
      const { url } = await customFetch<{ url: string }>("/api/uploads/animal-photo", {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: photo,
      });
      onChange(url);
    } catch (err) {
      toast({ title: "Photo upload failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label>Photo</Label>
      <div className="flex items-start gap-3">
        <div className="relative flex h-28 w-36 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {uploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" />
            : value ? <img src={value} alt="Animal photo preview" className="h-full w-full object-cover" />
            : <span className="text-3xl" aria-hidden="true">🐾</span>}
          {value && !uploading && (
            <button type="button" onClick={() => onChange("")} aria-label="Remove photo"
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex-1 space-y-2">
          {/* accept="image/*" lets phones offer the camera as well as the gallery */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="mr-2 h-4 w-4" /> {value ? "Change photo" : "Upload photo"}
          </Button>
          <button type="button" className="flex items-center text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowUrl(!showUrl)}>
            <LinkIcon className="mr-1 h-3 w-3" /> or paste an image link
          </button>
          {showUrl && <Input value={value} onChange={e => onChange(e.target.value)} placeholder="https://…" aria-label="Image link" />}
          <p className="text-xs text-muted-foreground">Use photos you took at the zoo or have permission to use. Large photos are shrunk automatically.</p>
        </div>
      </div>
    </div>
  );
}

/** Extra photos on the animal's Gallery tab. Changes save immediately, separate from the form. */
function GalleryField({ animalId }: { animalId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const { data: photos = [] } = useGetAnimalGallery(animalId, { query: { queryKey: getGetAnimalGalleryQueryKey(animalId) } });
  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetAnimalGalleryQueryKey(animalId) });

  const upload = async (files: File[]) => {
    setUploading(true);
    try {
      let order = photos.reduce((m, p) => Math.max(m, p.sort_order ?? 0), 0);
      for (const file of files) {
        const photo = await resizeImage(file);
        const { url } = await customFetch<{ url: string }>("/api/uploads/animal-photo", {
          method: "POST", headers: { "Content-Type": "image/jpeg" }, body: photo,
        });
        await customFetch(`/api/animals/${animalId}/gallery`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: url, caption: caption.trim() || null, sort_order: ++order }),
        });
      }
      setCaption("");
    } catch (err) {
      toast({ title: "Gallery upload failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    }
  };

  const remove = async (itemId: number) => {
    try {
      await customFetch(`/api/animals/${animalId}/gallery/${itemId}`, { method: "DELETE" });
      refresh();
    } catch {
      toast({ title: "Couldn't remove the photo", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Label>Gallery ({photos.length} {photos.length === 1 ? "photo" : "photos"})</Label>
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {photos.map(p => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-md border bg-muted">
              <img src={p.image_url} alt={p.caption ?? "Gallery photo"} title={p.caption ?? undefined} className="h-full w-full object-cover" />
              <button type="button" onClick={() => remove(p.id)} aria-label="Remove gallery photo"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption (optional)" aria-label="Caption for new photos" className="h-9 flex-1 min-w-40" />
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) upload(f); }} />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />} Add photos
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Added and removed photos save right away. You can pick several at once.</p>
    </div>
  );
}

/** Add or edit an animal: photo, names, exhibit, description, care details, size and taxonomy. */
export function AnimalFormDialog({ open, onOpenChange, animal, categories, pins, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The animal being edited; null to add a new one */
  animal: Animal | null;
  categories: Category[];
  pins: PinOption[];
  onSave: (body: ReturnType<typeof toBody>) => Promise<void>;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(animal));
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [lastAnimal, setLastAnimal] = useState(animal);
  // Reload the form when a different animal is opened
  if (animal !== lastAnimal) { setLastAnimal(animal); setD(toDraft(animal)); }
  const set = <K extends keyof Draft>(k: K) => (v: Draft[K]) => setD(prev => ({ ...prev, [k]: v }));
  const field = (k: keyof Draft, label: string, placeholder = "", type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={`af-${k}`}>{label}</Label>
      <Input id={`af-${k}`} type={type} step={type === "number" ? "any" : undefined} min={type === "number" ? 0 : undefined}
        value={d[k] as string} onChange={e => set(k)(e.target.value as never)} placeholder={placeholder} />
    </div>
  );
  const exhibits = pins.filter(p => p.pin_type === "animal");
  const others = pins.filter(p => p.pin_type !== "animal");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!d.name.trim()) { toast({ title: "Animal name is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await onSave(toBody(d));
      onOpenChange(false);
      if (!animal) setD(toDraft(null));
    } catch {
      toast({ title: animal ? "Failed to update animal" : "Failed to create animal", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{animal ? `Edit ${animal.name}` : "Add New Animal"}</DialogTitle>
          <DialogDescription>Only the name is required; the more you fill in, the richer the animal's page and the chatbot's answers.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <PhotoField value={d.image_url} onChange={set("image_url")} />
          {animal
            ? <GalleryField animalId={animal.id} />
            : <p className="text-xs text-muted-foreground">After creating the animal, open it again to add gallery photos.</p>}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="af-name">Animal name *</Label>
              <Input id="af-name" value={d.name} onChange={e => set("name")(e.target.value)} placeholder="Philippine Eagle" required />
            </div>
            {field("common_name", "Local / common name", "Agila")}
            {field("scientific_name", "Scientific name", "Pithecophaga jefferyi")}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="af-category">Category</Label>
              <Select value={d.category_id} onValueChange={set("category_id")}>
                <SelectTrigger id="af-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="af-status">Conservation status</Label>
              <Select value={d.conservation_status} onValueChange={set("conservation_status")}>
                <SelectTrigger id="af-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unknown</SelectItem>
                  {STATUSES.map(st => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="af-exhibit">Exhibit on the map</Label>
              <Select value={d.location_id} onValueChange={set("location_id")}>
                <SelectTrigger id="af-exhibit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not on the map</SelectItem>
                  <SelectGroup>
                    <SelectLabel>Exhibits</SelectLabel>
                    {exhibits.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectGroup>
                  {others.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Other places</SelectLabel>
                      {others.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="af-description">Description</Label>
            <Textarea id="af-description" rows={3} value={d.description} onChange={e => set("description")(e.target.value)}
              placeholder="Two or three sentences visitors see first, and the chatbot uses to answer questions." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="af-facts">Interesting facts (one per line)</Label>
            <Textarea id="af-facts" rows={3} value={d.interesting_facts} onChange={e => set("interesting_facts")(e.target.value)}
              placeholder={"National bird of the Philippines\nCan live up to 60 years"} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {field("habitat", "Habitat", "Tropical forests")}
            {field("diet", "Diet", "Carnivore")}
            {field("feeding_schedule", "Feeding time", "Daily at 11:00 AM")}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("weight_kg", "Weight (kg)", "", "number")}
            {field("height_cm", "Height / length (cm)", "", "number")}
            {field("lifespan_years", "Lifespan (years)", "", "number")}
          </div>

          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Taxonomy (optional)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {TAXONOMY.map(k => <React.Fragment key={k}>{field(k, k[0]!.toUpperCase() + k.slice(1))}</React.Fragment>)}
            </div>
          </details>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="af-featured" className="cursor-pointer">Feature on the home page</Label>
            <Switch id="af-featured" checked={d.is_featured} onCheckedChange={set("is_featured")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : animal ? "Save changes" : "Create animal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
