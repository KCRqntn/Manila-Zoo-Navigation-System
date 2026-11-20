import { useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { inAppBrowser, isIOS, openInChromeUrl } from "@/lib/device";
import { useAppCtx } from "../../contexts/AppContext";

const DISMISS_KEY = "zoo:inAppBannerDismissed";

/**
 * Shown when the site is open inside an app's built-in browser (Messenger, Facebook…). Those often
 * block the camera and GPS, so the map and QR scanner wouldn't work; this says how to open the
 * page in Safari (iPhone) or Chrome (Android) instead. Can be dismissed for the rest of the visit.
 */
export function InAppBrowserBanner() {
  const { language } = useAppCtx();
  const fil = language === "fil";
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const [copied, setCopied] = useState(false);
  if (!inAppBrowser || dismissed) return null;

  const chrome = openInChromeUrl();
  const browser = isIOS ? "Safari" : "Chrome";
  const how = isIOS
    ? (fil ? `I-tap ang ••• o ang share icon, tapos "Open in Safari" / "Open in external browser".` : `Tap ••• or the share icon, then "Open in Safari" / "Open in external browser".`)
    : (fil ? `I-tap ang ⋮ sa itaas, tapos "Open in Chrome" / "Open in browser".` : `Tap ⋮ at the top, then "Open in Chrome" / "Open in browser".`);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked too; the instructions above still work
    }
  };
  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* not remembered; shows again on reload */ }
  };

  return (
    <div role="alert" className="relative border-b border-sky-300 bg-sky-50 px-4 py-3 pr-10 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-50">
      <p className="font-semibold">
        {fil ? `Buksan sa ${browser} para gumana ang mapa at QR scanner` : `Open in ${browser} for the map and QR scanner to work`}
      </p>
      <p className="mt-0.5">
        {fil
          ? `Hinaharangan ng browser ng ${inAppBrowser} ang lokasyon at camera. ${how}`
          : `${inAppBrowser}'s built-in browser blocks location and the camera. ${how}`}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {chrome && (
          <a href={chrome} className="inline-flex items-center gap-1.5 rounded-full bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white">
            <ExternalLink className="h-3.5 w-3.5" /> {fil ? "Buksan sa Chrome" : "Open in Chrome"}
          </a>
        )}
        <button type="button" onClick={copy} className="rounded-full border border-sky-400 px-3 py-1.5 text-xs font-semibold">
          {copied ? (fil ? "Nakopya!" : "Link copied!") : (fil ? `Kopyahin ang link (i-paste sa ${browser})` : `Copy link (paste it in ${browser})`)}
        </button>
      </div>
      <button type="button" onClick={dismiss} className="absolute right-2 top-2 rounded-full p-1.5" aria-label={fil ? "Isara" : "Dismiss"}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
