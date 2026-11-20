import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Gift, History, Loader2, Ticket } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { usePointsHistory, useRewards, useMyRedemptions, useMyProgress, redeemReward, newRequestId, type Reward, type Redemption, type PointsEntry } from "@/lib/games";

/**
 * The visitor's points history, the rewards they can trade points for, and their vouchers. Points
 * and vouchers are saved on the server, so they're the same after logging out or on another phone.
 */

const KIND_ICON: Record<PointsEntry["kind"], string> = { scan: "🐾", game: "🧭", game_bonus: "🏆", redeem: "🎁", refund: "↩️" };

export function PointsHistory({ fil }: { fil: boolean }) {
  const { user } = useAuth();
  const { data: rows, isLoading } = usePointsHistory();
  if (!user) return null;
  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5 text-primary" /> {fil ? "Aking mga puntos" : "My points history"}</CardTitle>
        <CardDescription>{fil ? "Bawat hayop na na-scan at gantimpalang nakuha mo." : "Every animal you scanned and every reward you got."}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40 w-full" /> : !rows?.length ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <div className="mb-2 text-4xl" aria-hidden="true">📷</div>
            {fil ? "Wala pa. I-scan ang QR sign sa isang kulungan para sa una mong puntos!" : "Nothing yet. Scan the QR sign at an exhibit to earn your first points!"}
          </div>
        ) : (
          <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {rows.map(r => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-lg" aria-hidden="true">{KIND_ICON[r.kind]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy · h:mm a")}</p>
                </div>
                <span className={`shrink-0 font-bold tabular-nums ${r.points > 0 ? "text-primary" : "text-muted-foreground"}`}>
                  {r.points > 0 ? `+${r.points}` : r.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RewardsShop({ fil }: { fil: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rewards, isLoading } = useRewards();
  const { data: me } = useMyProgress();
  const { data: mine } = useMyRedemptions();
  const [confirm, setConfirm] = useState<{ reward: Reward; requestId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [voucher, setVoucher] = useState<Redemption | null>(null);
  const balance = me?.balance ?? 0;
  const pending = (mine ?? []).filter(r => r.status === "pending");

  const redeem = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const v = await redeemReward(confirm.reward.id, confirm.requestId, qc);
      setConfirm(null);
      setVoucher({ ...v, emoji: confirm.reward.emoji });
    } catch (err) {
      const msg = (err as { data?: { error?: string } }).data?.error ?? (fil ? "Hindi natuloy. Subukan ulit." : "That didn't work. Please try again.");
      toast({ title: fil ? "Hindi na-redeem" : "Not redeemed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="flex items-center"><Gift className="mr-2 h-5 w-5 text-primary" /> {fil ? "Mga Gantimpala" : "Rewards"}</CardTitle>
        <CardDescription>
          {user
            ? (fil ? `Mayroon kang ${balance} puntos na magagamit.` : `You have ${balance} points to spend.`)
            : (fil ? "Mag-login para ipagpalit ang puntos sa gantimpala." : "Log in to trade your points for rewards.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pending.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fil ? "Mga voucher mo" : "Your vouchers"}</p>
            {pending.map(v => (
              <button key={v.id} type="button" onClick={() => setVoucher(v)}
                className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-secondary/40 p-3 text-left transition-colors hover:bg-secondary">
                <span className="text-2xl" aria-hidden="true">{v.emoji ?? "🎁"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{v.reward_name}</span>
                  <span className="font-mono text-xs tracking-wider text-muted-foreground">{v.code}</span>
                </span>
                <Ticket className="h-4 w-4 text-primary" />
              </button>
            ))}
          </div>
        )}

        {isLoading ? <Skeleton className="h-32 w-full" /> : !rewards?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{fil ? "Wala pang gantimpala sa ngayon. Patuloy na mangolekta ng puntos!" : "No rewards yet. Keep collecting points!"}</p>
        ) : (
          <ul className="grid gap-2">
            {rewards.map(r => {
              const soldOut = r.stock != null && r.stock <= 0;
              const short = Math.max(0, r.cost - balance);
              return (
                <li key={r.id} className="flex items-center gap-3 rounded-2xl border p-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-2xl" aria-hidden="true">{r.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{fil && r.name_fil ? r.name_fil : r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      ⭐ {r.cost} {fil ? "puntos" : "points"}
                      {r.stock != null && !soldOut && ` · ${r.stock} ${fil ? "natitira" : "left"}`}
                    </p>
                    {user && !soldOut && short > 0 && (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={fil ? `${short} puntos pa` : `${short} more points needed`}>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (balance / r.cost) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <Button size="sm" className="shrink-0 rounded-full" disabled={!user || soldOut || short > 0}
                    onClick={() => setConfirm({ reward: r, requestId: newRequestId() })}>
                    {soldOut ? (fil ? "Ubos na" : "Sold out") : short > 0 && user ? `${short} ${fil ? "pa" : "more"}` : (fil ? "Kunin" : "Redeem")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!confirm} onOpenChange={o => { if (!o && !busy) setConfirm(null); }}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>{confirm?.reward.emoji} {fil ? "Kunin ang gantimpala?" : "Redeem this reward?"}</DialogTitle>
            <DialogDescription>
              {confirm && (fil
                ? `Gagamitin ang ${confirm.reward.cost} puntos para sa ${confirm.reward.name_fil ?? confirm.reward.name}. Matitira sa iyo ang ${balance - confirm.reward.cost}.`
                : `This uses ${confirm.reward.cost} points for ${confirm.reward.name}. You'll have ${balance - confirm.reward.cost} left.`)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => setConfirm(null)}>{fil ? "Huwag muna" : "Not now"}</Button>
            <Button className="rounded-full" disabled={busy} onClick={redeem}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {fil ? "Oo, kunin!" : "Yes, redeem!"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!voucher} onOpenChange={o => { if (!o) setVoucher(null); }}>
        <DialogContent className="max-w-sm rounded-3xl text-center">
          <DialogHeader>
            <div className="mx-auto text-6xl motion-safe:animate-bounce" aria-hidden="true">{voucher?.emoji ?? "🎁"}</div>
            <DialogTitle className="text-center">{voucher?.reward_name}</DialogTitle>
            <DialogDescription className="text-center">
              {fil ? "Ipakita ang code na ito sa Info Desk para makuha ang iyong gantimpala." : "Show this code at the Info Desk to collect your reward."}
            </DialogDescription>
          </DialogHeader>
          <p className="select-all rounded-2xl border-2 border-dashed border-primary bg-secondary/50 py-4 font-mono text-2xl font-bold tracking-[0.2em] text-primary">{voucher?.code}</p>
          <p className="text-xs text-muted-foreground">{fil ? "Naka-save ito sa iyong account, kaya makikita mo ulit dito anumang oras." : "It's saved to your account, so you can find it here again anytime."}</p>
          <DialogFooter><Button className="w-full rounded-full" onClick={() => setVoucher(null)}>{fil ? "Sige!" : "Got it!"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
