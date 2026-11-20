import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, useSearchAnimals } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, AlertTriangle, Users, Eye, EyeOff, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GAMES_KEY, type Game } from "@/lib/games";
import { useStaff } from "@/lib/adminApi";
import { RewardsAdmin } from "@/components/admin/RewardsAdmin";

const ADMIN_GAMES_KEY = ["/api/admin/games"] as const;

type StopDraft = { animal_id: number; hint: string; hint_fil: string };
type GameDraft = {
  id?: number; title: string; title_fil: string; description: string; description_fil: string; emoji: string;
  points_per_stop: number; completion_bonus: number; start_date: string; end_date: string; status: "draft" | "published";
  stops: StopDraft[];
};

const EMPTY: GameDraft = {
  title: "", title_fil: "", description: "", description_fil: "", emoji: "🧭",
  points_per_stop: 10, completion_bonus: 50, start_date: "", end_date: "", status: "draft", stops: [],
};
// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time
const toLocalInput = (iso: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "");

function GameForm({ initial, onClose }: { initial: GameDraft; onClose: () => void }) {
  const [g, setG] = useState<GameDraft>(initial);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: animalsData } = useSearchAnimals({ limit: 500 });
  const animals = Array.isArray(animalsData) ? animalsData : [];
  const set = <K extends keyof GameDraft>(key: K, value: GameDraft[K]) => setG(prev => ({ ...prev, [key]: value }));
  const setStop = (i: number, patch: Partial<StopDraft>) => set("stops", g.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const unused = animals.filter(a => !g.stops.some(s => s.animal_id === a.id));

  const save = async () => {
    if (!g.title.trim()) { toast({ title: "Add a title", variant: "destructive" }); return; }
    setSaving(true);
    const body = JSON.stringify({
      ...g,
      start_date: g.start_date ? new Date(g.start_date).toISOString() : null,
      end_date: g.end_date ? new Date(g.end_date).toISOString() : null,
    });
    try {
      if (g.id) await customFetch(`/api/admin/games/${g.id}`, { method: "PUT", body });
      else await customFetch("/api/admin/games", { method: "POST", body });
      queryClient.invalidateQueries({ queryKey: ADMIN_GAMES_KEY });
      queryClient.invalidateQueries({ queryKey: GAMES_KEY });
      toast({ title: g.id ? "Game updated" : "Game created" });
      onClose();
    } catch {
      toast({ title: "Couldn't save the game", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[4rem_1fr] gap-3">
        <div><Label htmlFor="g-emoji">Icon</Label><Input id="g-emoji" value={g.emoji} maxLength={4} onChange={e => set("emoji", e.target.value)} className="text-center text-xl" /></div>
        <div><Label htmlFor="g-title">Title</Label><Input id="g-title" value={g.title} onChange={e => set("title", e.target.value)} placeholder="Philippine Wildlife Hunt" /></div>
      </div>
      <div><Label htmlFor="g-title-fil">Title (Filipino, optional)</Label><Input id="g-title-fil" value={g.title_fil} onChange={e => set("title_fil", e.target.value)} /></div>
      <div><Label htmlFor="g-desc">Description</Label><Textarea id="g-desc" rows={2} value={g.description} onChange={e => set("description", e.target.value)} /></div>
      <div><Label htmlFor="g-desc-fil">Description (Filipino, optional)</Label><Textarea id="g-desc-fil" rows={2} value={g.description_fil} onChange={e => set("description_fil", e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="g-pts">Points per animal</Label><Input id="g-pts" type="number" min={0} value={g.points_per_stop} onChange={e => set("points_per_stop", Number(e.target.value))} /></div>
        <div><Label htmlFor="g-bonus">Bonus for finding all</Label><Input id="g-bonus" type="number" min={0} value={g.completion_bonus} onChange={e => set("completion_bonus", Number(e.target.value))} /></div>
        <div><Label htmlFor="g-start">Starts (optional)</Label><Input id="g-start" type="datetime-local" value={g.start_date} onChange={e => set("start_date", e.target.value)} /></div>
        <div><Label htmlFor="g-end">Ends (optional)</Label><Input id="g-end" type="datetime-local" value={g.end_date} onChange={e => set("end_date", e.target.value)} /></div>
      </div>
      <div>
        <Label htmlFor="g-status">Status</Label>
        <Select value={g.status} onValueChange={v => set("status", v as GameDraft["status"])}>
          <SelectTrigger id="g-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft (hidden from visitors)</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Animals to find ({g.stops.length})</Label>
        {g.stops.map((s, i) => (
          <div key={s.animal_id} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{i + 1}. {animals.find(a => a.id === s.animal_id)?.name ?? `Animal #${s.animal_id}`}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => set("stops", g.stops.filter((_, j) => j !== i))} aria-label="Remove stop">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Input value={s.hint} onChange={e => setStop(i, { hint: e.target.value })} placeholder="Clue shown before it's found" aria-label="Clue" />
            <Input value={s.hint_fil} onChange={e => setStop(i, { hint_fil: e.target.value })} placeholder="Clue in Filipino (optional)" aria-label="Clue in Filipino" />
          </div>
        ))}
        {unused.length > 0 && (
          <Select value="" onValueChange={v => set("stops", [...g.stops, { animal_id: Number(v), hint: "", hint_fil: "" }])}>
            <SelectTrigger><SelectValue placeholder="+ Add an animal" /></SelectTrigger>
            <SelectContent>{unused.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save game</Button>
      </DialogFooter>
    </div>
  );
}

/** Scavenger-hunt games: animals to find by scanning their QR codes, with points and a bonus. */
export default function AdminGames() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<GameDraft | null>(null);
  const staff = useStaff();
  const { data: games, isLoading, isError } = useQuery({
    queryKey: ADMIN_GAMES_KEY,
    queryFn: () => customFetch<Game[]>("/api/admin/games"),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ADMIN_GAMES_KEY });
    queryClient.invalidateQueries({ queryKey: GAMES_KEY });
  };
  const toDraft = (g: Game): GameDraft => ({
    id: g.id, title: g.title, title_fil: g.title_fil ?? "", description: g.description ?? "", description_fil: g.description_fil ?? "",
    emoji: g.emoji, points_per_stop: g.points_per_stop, completion_bonus: g.completion_bonus,
    start_date: toLocalInput(g.start_date), end_date: toLocalInput(g.end_date), status: g.status,
    stops: g.stops.map(s => ({ animal_id: s.animal_id, hint: s.hint ?? "", hint_fil: s.hint_fil ?? "" })),
  });
  const togglePublish = async (g: Game) => {
    const d = toDraft(g);
    try {
      await customFetch(`/api/admin/games/${g.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...d, status: g.status === "published" ? "draft" : "published", start_date: g.start_date, end_date: g.end_date }),
      });
      refresh();
    } catch { toast({ title: "Couldn't update the game", variant: "destructive" }); }
  };
  const remove = async (g: Game) => {
    if (!confirm(`Delete "${g.title}"? Its progress is removed; points players already earned stay in their totals (they may have spent them on rewards).`)) return;
    try { await customFetch(`/api/admin/games/${g.id}`, { method: "DELETE" }); refresh(); }
    catch { toast({ title: "Couldn't delete the game", variant: "destructive" }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Game Events</h1>
          <p className="text-muted-foreground">QR scavenger hunts. Visitors earn points for each animal they find and a bonus for finding all.</p>
        </div>
        <Button onClick={() => setEditing(EMPTY)}><Plus className="mr-2 h-4 w-4" /> New game</Button>
      </div>

      {isLoading ? <Skeleton className="h-48 w-full" /> : isError ? (
        <p className="text-destructive">Couldn't load games. Is the API server running?</p>
      ) : !games?.length ? (
        <div className="rounded-xl border-2 border-dashed py-16 text-center text-muted-foreground">No games yet. Create one to get started.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {games.map(g => {
            const missingQr = g.stops.filter(s => !s.has_qr);
            return (
              <Card key={g.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">{g.emoji}</span>
                    <div className="flex-1">
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        {g.title}
                        <Badge variant={g.status === "published" ? "default" : "secondary"}>{g.status === "published" ? "Published" : "Draft"}</Badge>
                      </CardTitle>
                      <CardDescription>{g.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span>{g.stops.length} animals</span>
                    <span>{g.points_per_stop} pts each</span>
                    <span>+{g.completion_bonus} bonus</span>
                    <span className="flex items-center"><Users className="mr-1 h-3.5 w-3.5" /> {g.players ?? 0} players</span>
                    {(g.start_date || g.end_date) && (
                      <span>{g.start_date ? format(new Date(g.start_date), "MMM d") : "Now"} – {g.end_date ? format(new Date(g.end_date), "MMM d") : "no end"}</span>
                    )}
                  </div>
                  <p className="text-sm">{g.stops.map(s => s.animal_name).join(" · ") || "No animals yet"}</p>
                  {missingQr.length > 0 && (
                    <div className="flex items-start gap-2 rounded-md bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        No QR code yet for {missingQr.map(s => s.animal_name).join(", ")}, so visitors can't find {missingQr.length === 1 ? "it" : "them"}.{" "}
                        <Link href="/admin/qr" className="font-medium underline">Generate QR codes</Link>
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(toDraft(g))}><Pencil className="mr-1.5 h-4 w-4" /> Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => togglePublish(g)}>
                      {g.status === "published" ? <><EyeOff className="mr-1.5 h-4 w-4" /> Unpublish</> : <><Eye className="mr-1.5 h-4 w-4" /> Publish</>}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(g)} aria-label={`Delete ${g.title}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        Visitors can also earn points for any exhibit QR code: set the points per code on the <Link href="/admin/qr" className="font-medium text-foreground underline">Exhibit QR Codes</Link> page.
        Points come only from codes scanned with the app's camera by a signed-in visitor with a visit registered today.
      </div>
      <RewardsAdmin canWrite={staff.can("content.write")} />

      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit game" : "New game"}</DialogTitle></DialogHeader>
          {editing && <GameForm initial={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
