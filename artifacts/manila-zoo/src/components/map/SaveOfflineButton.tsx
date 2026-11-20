import { useState } from "react";
import { Download, Loader2, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { saveZooForOffline, useOnlineStatus, type SaveProgress } from "@/lib/offline";
import { useAppCtx } from "../../contexts/AppContext";

/** Downloads the zoo map, animal pages and photos so the visitor can use them without signal. */
export function SaveOfflineButton() {
  const { toast } = useToast();
  const { language } = useAppCtx();
  const online = useOnlineStatus();
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  const [saving, setSaving] = useState(false);
  const fil = language === "fil";

  const save = async () => {
    setSaving(true);
    try {
      const result = await saveZooForOffline(setProgress);
      const saved = result.total - result.failed;
      toast({
        title: fil ? "Na-save para sa offline" : "Saved for offline use",
        description: result.failed
          ? (fil ? `${saved} sa ${result.total} ang na-save. Subukang muli para sa natitira.` : `${saved} of ${result.total} items saved. Try again to get the rest.`)
          : (fil ? "Gagana ang mapa at impormasyon ng hayop kahit walang signal." : "The map and animal info will work without signal."),
      });
    } catch (error) {
      toast({
        title: fil ? "Hindi na-save" : "Couldn't save for offline",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const done = !saving && progress != null && progress.done === progress.total && progress.failed === 0;

  return (
    <div className="space-y-1">
      <Button variant="secondary" className="w-full" onClick={save} disabled={saving || !online}>
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : done ? <CircleCheck className="w-4 h-4 mr-2" /> : <Download className="w-4 h-4 mr-2" />}
        {saving
          ? (fil ? "Sine-save…" : "Saving…")
          : done ? (fil ? "Naka-save para sa offline" : "Saved for offline")
          : (fil ? "I-save para sa offline" : "Save zoo for offline")}
      </Button>
      {saving && progress && (
        <p className="text-xs text-muted-foreground text-center tabular-nums">
          {progress.done} / {progress.total}
        </p>
      )}
    </div>
  );
}
