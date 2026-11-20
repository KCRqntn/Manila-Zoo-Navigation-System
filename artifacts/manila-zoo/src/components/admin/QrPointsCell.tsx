import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { customFetch, getListQrCodesQueryKey } from "@workspace/api-client-react";
import { Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/adminApi";

/**
 * The points a QR code gives visitors who scan it with the app's camera (0 = no points), and whether
 * they're given once ever or once per visit day. Saved by the server, which checks the values again.
 */
export function QrPointsCell({ qr }: { qr: { id: number; points?: number | null; points_once?: boolean | null } }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [points, setPoints] = useState(String(qr.points ?? 0));
  const [once, setOnce] = useState(qr.points_once !== false);
  const [saving, setSaving] = useState(false);
  const dirty = Number(points) !== (qr.points ?? 0) || once !== (qr.points_once !== false);
  const valid = /^\d{1,4}$/.test(points) && Number(points) <= 1000;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await customFetch(`/api/admin/qr/${qr.id}/points`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: Number(points), points_once: once }) });
      await qc.invalidateQueries({ queryKey: getListQrCodesQueryKey() });
      toast({ title: "Points saved", description: Number(points) > 0 ? `${points} points ${once ? "once per visitor" : "once per visit day"}.` : "This code no longer gives points." });
    } catch (err) {
      toast({ title: "Not saved", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Input value={points} onChange={e => setPoints(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="h-8 w-16 text-center"
        aria-label="Points for scanning this code" aria-invalid={!valid} onKeyDown={e => { if (e.key === "Enter") void save(); }} />
      <Select value={once ? "once" : "daily"} onValueChange={v => setOnce(v === "once")}>
        <SelectTrigger className="h-8 w-[104px] text-xs" aria-label="How often points are given"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="once">Once</SelectItem>
          <SelectItem value="daily">Each visit</SelectItem>
        </SelectContent>
      </Select>
      {dirty && (
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={save} disabled={saving || !valid} aria-label="Save points">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );
}
