import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gift, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { api, jsonBody, errorMessage, formatDateTime } from "@/lib/adminApi";

/**
 * Rewards visitors can trade points for, and the vouchers they've redeemed. At the Info Desk, staff
 * look up the code the visitor shows, hand over the reward and mark it given. Cancelling an unclaimed
 * voucher gives the points back. The server checks balances, stock and voucher status.
 */
type AdminReward = { id: number; name: string; name_fil: string | null; description: string | null; emoji: string; cost: number; stock: number | null; is_active: boolean; redeemed: number };
type AdminRedemption = { id: number; display_name: string; reward_name: string; cost: number; code: string; status: "pending" | "claimed" | "cancelled"; created_at: string; claimed_at: string | null; claimed_by: string | null };
type Draft = { id?: number; name: string; name_fil: string; description: string; emoji: string; cost: string; stock: string; is_active: boolean };

const REWARDS_KEY = ["/api/admin/rewards"];
const REDEMPTIONS_KEY = ["/api/admin/redemptions"];
const EMPTY: Draft = { name: "", name_fil: "", description: "", emoji: "🎁", cost: "50", stock: "", is_active: true };
const STATUS_STYLE: Record<AdminRedemption["status"], string> = {
  pending: "border-amber-500/50 text-amber-700 dark:text-amber-300", claimed: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300", cancelled: "border-muted-foreground/40 text-muted-foreground",
};

export function RewardsAdmin({ canWrite }: { canWrite: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const rewards = useQuery({ queryKey: REWARDS_KEY, queryFn: () => api<AdminReward[]>("/api/admin/rewards") });
  const [lookup, setLookup] = useState("");
  const [search, setSearch] = useState("");
  const redemptions = useQuery({
    queryKey: [...REDEMPTIONS_KEY, search],
    queryFn: () => api<AdminRedemption[]>(`/api/admin/redemptions${search ? `?code=${encodeURIComponent(search)}` : ""}`),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ kind: "claim" | "cancel"; r: AdminRedemption } | null>(null);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const body = { ...draft, cost: Number(draft.cost), stock: draft.stock === "" ? null : Number(draft.stock) };
      await api(draft.id ? `/api/admin/rewards/${draft.id}` : "/api/admin/rewards", jsonBody(draft.id ? "PUT" : "POST", body));
      await qc.invalidateQueries({ queryKey: REWARDS_KEY });
      qc.invalidateQueries({ queryKey: ["/api/rewards"] });
      toast({ title: draft.id ? "Reward updated" : "Reward added" });
      setDraft(null);
    } catch (err) {
      toast({ title: "Not saved", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const act = async () => {
    if (!pending) return;
    const { kind, r } = pending;
    setPending(null);
    try {
      await api(`/api/admin/redemptions/${r.id}/${kind}`, jsonBody("POST", {}));
      await qc.invalidateQueries({ queryKey: REDEMPTIONS_KEY });
      qc.invalidateQueries({ queryKey: REWARDS_KEY });
      toast({ title: kind === "claim" ? `${r.code} marked as given` : `${r.code} cancelled; ${r.cost} points returned` });
    } catch (err) {
      toast({ title: "Not changed", description: errorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /> Rewards</CardTitle>
            <CardDescription>What visitors can trade their points for. Leave stock empty for unlimited; hidden rewards can't be redeemed.</CardDescription>
          </div>
          {canWrite && <Button onClick={() => setDraft(EMPTY)}><Plus className="mr-2 h-4 w-4" /> Add reward</Button>}
        </CardHeader>
        <CardContent>
          {rewards.isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /> : !rewards.data?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No rewards yet. Add one so visitors have something to spend their points on.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Reward</TableHead><TableHead>Cost</TableHead><TableHead>Stock</TableHead><TableHead>Redeemed</TableHead><TableHead>Shown</TableHead><TableHead className="text-right">Edit</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rewards.data.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.emoji} {r.name}</TableCell>
                      <TableCell className="tabular-nums">{r.cost} pts</TableCell>
                      <TableCell className="tabular-nums">{r.stock ?? "Unlimited"}</TableCell>
                      <TableCell className="tabular-nums">{r.redeemed}</TableCell>
                      <TableCell>{r.is_active ? "Yes" : "Hidden"}</TableCell>
                      <TableCell className="text-right">
                        {canWrite && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${r.name}`}
                          onClick={() => setDraft({ id: r.id, name: r.name, name_fil: r.name_fil ?? "", description: r.description ?? "", emoji: r.emoji, cost: String(r.cost), stock: r.stock == null ? "" : String(r.stock), is_active: r.is_active })}>
                          <Pencil className="h-4 w-4" /></Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vouchers</CardTitle>
          <CardDescription>Type the code a visitor shows (for example MZR-7KQ2PD), hand over the reward, then mark it given. Waiting vouchers are listed first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form className="flex max-w-md gap-2" onSubmit={e => { e.preventDefault(); setSearch(lookup.trim().toUpperCase()); }}>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={lookup} onChange={e => setLookup(e.target.value)} placeholder="MZR-…" className="pl-8 font-mono uppercase" aria-label="Voucher code" />
            </div>
            <Button type="submit" variant="outline">Find</Button>
            {search && <Button type="button" variant="ghost" onClick={() => { setLookup(""); setSearch(""); }}>Show all</Button>}
          </form>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Code</TableHead><TableHead>Visitor</TableHead><TableHead>Reward</TableHead><TableHead>Redeemed</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {redemptions.isLoading ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /></TableCell></TableRow>
                ) : !redemptions.data?.length ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">{search ? `No voucher with the code ${search}.` : "No vouchers redeemed yet."}</TableCell></TableRow>
                ) : redemptions.data.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.code}</TableCell>
                    <TableCell>{r.display_name}</TableCell>
                    <TableCell>{r.reward_name} <span className="text-xs text-muted-foreground">({r.cost} pts)</span></TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(r.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_STYLE[r.status]}>{r.status === "pending" ? "Waiting" : r.status === "claimed" ? "Given" : "Cancelled"}</Badge>
                      {r.status === "claimed" && r.claimed_by && <p className="mt-0.5 text-xs text-muted-foreground">by {r.claimed_by}</p>}
                    </TableCell>
                    <TableCell className="text-right">
                      {canWrite && r.status === "pending" && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => setPending({ kind: "claim", r })}><Check className="mr-1.5 h-3.5 w-3.5" /> Mark given</Button>
                          <Button size="sm" variant="outline" onClick={() => setPending({ kind: "cancel", r })}><X className="mr-1.5 h-3.5 w-3.5" /> Cancel</Button>
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

      <Dialog open={!!draft} onOpenChange={o => { if (!o && !saving) setDraft(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{draft?.id ? "Edit reward" : "Add reward"}</DialogTitle></DialogHeader>
          {draft && (
            <div className="grid gap-3">
              <div className="grid grid-cols-[72px_1fr] gap-3">
                <div className="space-y-1.5"><Label htmlFor="rw-emoji">Emoji</Label><Input id="rw-emoji" value={draft.emoji} onChange={e => setDraft({ ...draft, emoji: e.target.value })} className="text-center text-lg" /></div>
                <div className="space-y-1.5"><Label htmlFor="rw-name">Name</Label><Input id="rw-name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Zoo sticker set" /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="rw-name-fil">Name in Filipino (optional)</Label><Input id="rw-name-fil" value={draft.name_fil} onChange={e => setDraft({ ...draft, name_fil: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="rw-desc">Description (optional)</Label><Input id="rw-desc" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="rw-cost">Cost (points)</Label><Input id="rw-cost" inputMode="numeric" value={draft.cost} onChange={e => setDraft({ ...draft, cost: e.target.value.replace(/\D/g, "") })} /></div>
                <div className="space-y-1.5"><Label htmlFor="rw-stock">Stock</Label><Input id="rw-stock" inputMode="numeric" value={draft.stock} placeholder="Unlimited" onChange={e => setDraft({ ...draft, stock: e.target.value.replace(/\D/g, "") })} /></div>
              </div>
              <label className="flex items-center justify-between rounded-md border p-3 text-sm">
                Show to visitors <Switch checked={draft.is_active} onCheckedChange={v => setDraft({ ...draft, is_active: v })} />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !draft?.name.trim() || !draft?.cost}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pending && (
        <ConfirmDialog open onOpenChange={o => { if (!o) setPending(null); }}
          title={pending.kind === "claim" ? `Mark ${pending.r.code} as given?` : `Cancel ${pending.r.code}?`}
          description={<p>{pending.kind === "claim"
            ? `Confirm you've handed ${pending.r.display_name} the ${pending.r.reward_name}. The voucher can't be used again.`
            : `The voucher stops working and ${pending.r.display_name} gets their ${pending.r.cost} points back.`}</p>}
          confirmLabel={pending.kind === "claim" ? "Mark given" : "Cancel voucher"} destructive={pending.kind === "cancel"} onConfirm={act} />
      )}
    </div>
  );
}
