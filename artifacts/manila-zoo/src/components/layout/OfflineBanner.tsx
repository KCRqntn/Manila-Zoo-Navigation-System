import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/offline";
import { useAppCtx } from "../../contexts/AppContext";

/** Tells visitors when they're offline and what still works. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const { language } = useAppCtx();
  if (online) return null;
  return (
    <div role="status" className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100 border-b border-amber-300 dark:border-amber-800 px-4 py-2 text-sm flex items-center justify-center gap-2 text-center">
      <WifiOff className="w-4 h-4 shrink-0" />
      {language === "fil"
        ? "Offline kayo. Makikita pa rin ang mga na-save na mapa at impormasyon ng hayop, pero kailangan ng koneksyon ang AI Guide."
        : "You're offline. Saved maps and animal info still work, but the AI Guide needs a connection."}
    </div>
  );
}
