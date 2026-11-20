import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { registrationQrDataUrl, registrationLink, REGISTRATION_PATH, SHORT_REGISTRATION_PATH } from "@/lib/qrLinks";
import { Globe, QrCode, ChevronLeft, X } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppCtx } from "@/contexts/AppContext";

/**
 * Splash screen, then a small welcome window, on a visitor's first page load of a visit (home page
 * only; links straight to an animal or a QR scan skip it). Visitors just open the website; the QR
 * code lets them share it. Staff sign in at /login, which is not linked from visitor pages. The QR code is public and
 * never grants admin access. It also opens again whenever anyone logs out, and when a page is
 * refreshed it opens straight on the website QR code.
 */
const SEEN_KEY = "mz-entry-seen";
const AFTER_LOGOUT_KEY = "mz-entry-after-logout";
const OPEN_EVENT = "mz-open-entry-window";
const seen = () => { try { return sessionStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } };
const markSeen = () => { try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* not saved: shows again next load */ } };
// Set on logout; read once by the window (which may only mount after leaving the admin pages)
const takeLogoutFlag = () => {
  try { const v = sessionStorage.getItem(AFTER_LOGOUT_KEY) === "1"; sessionStorage.removeItem(AFTER_LOGOUT_KEY); return v; } catch { return false; }
};

// A refresh (not a first visit or a link): shown on any visitor page, opened on the QR code
const wasRefreshed = () => {
  try { return (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "reload"; } catch { return false; }
};

/** Call when someone logs out: shows the welcome window again */
export function openEntryWindowAfterLogout() {
  try { sessionStorage.setItem(AFTER_LOGOUT_KEY, "1"); } catch { /* the event below still opens it */ }
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const onRegistration = (path: string) => path === REGISTRATION_PATH || path === SHORT_REGISTRATION_PATH;

export function EntryWindow() {
  const [location] = useLocation();
  const { language } = useAppCtx();
  const fil = language === "fil";
  const settings = useQuery({
    queryKey: ["/api/settings/public"],
    queryFn: () => customFetch<{ public_site_url: string; show_entry_window: boolean }>("/api/settings/public"),
    staleTime: 5 * 60_000,
  });
  const [refreshed] = useState(wasRefreshed);
  const [phase, setPhase] = useState<"splash" | "window" | "closed">(() =>
    // Not over the registration form itself (refreshing it shouldn't cover the form)
    takeLogoutFlag() || (refreshed && !onRegistration(location)) ? "window" : location === "/" && !seen() ? "splash" : "closed");
  const [showQr, setShowQr] = useState(refreshed && !onRegistration(location));
  const [qr, setQr] = useState<string | null>(null);

  // Logged out while this window was already on the page
  useEffect(() => {
    const open = () => { takeLogoutFlag(); setShowQr(false); setPhase("window"); };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  // Splash while the settings load (at most ~1.2 s), then the window, if it's switched on
  useEffect(() => {
    if (phase !== "splash") return;
    const done = () => setPhase(settings.data?.show_entry_window === false ? "closed" : "window");
    if (settings.isSuccess || settings.isError) { const t = setTimeout(done, 600); return () => clearTimeout(t); }
    const t = setTimeout(done, 1200);
    return () => clearTimeout(t);
  }, [phase, settings.isSuccess, settings.isError, settings.data]);

  // The public address (set by admins); otherwise this page's address when it's already public
  const siteBase = settings.data?.public_site_url || (window.location.protocol === "https:" && !/^(localhost|127\.|192\.168\.|10\.)/.test(window.location.hostname) ? window.location.origin : "");
  // The QR code opens the visitor registration form on that address
  const siteUrl = siteBase ? registrationLink(siteBase) : "";
  useEffect(() => {
    if (!showQr || !siteUrl) return;
    registrationQrDataUrl(siteUrl, 720).then(setQr, () => setQr(null));
  }, [showQr, siteUrl]);

  const close = () => { markSeen(); setPhase("closed"); };

  if (phase === "splash") {
    return (
      <div role="status" aria-label={fil ? "Naglo-load" : "Loading"} className="fixed inset-0 z-[3000] flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-primary/90 to-primary text-primary-foreground animate-in fade-in">
        <span className="text-7xl motion-safe:animate-bounce" aria-hidden="true">🦒</span>
        <p className="text-2xl font-bold">Manila Zoo</p>
        <p className="text-sm opacity-80">{fil ? "Inihahanda ang iyong gabay…" : "Getting your guide ready…"}</p>
      </div>
    );
  }
  if (phase !== "window") return null;

  return (
    <Dialog open onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader className="items-center text-center">
          <span className="text-5xl" aria-hidden="true">🦒</span>
          <DialogTitle className="text-2xl">{fil ? "Maligayang pagdating sa Manila Zoo" : "Welcome to Manila Zoo"}</DialogTitle>
          <DialogDescription>{fil ? "Mapa, gabay sa mga hayop, at AI Guide sa iyong telepono." : "Map, animal guide and AI Guide on your phone."}</DialogDescription>
        </DialogHeader>

        {!showQr ? (
          <div className="space-y-2">
            <Button className="h-auto w-full justify-start gap-3 rounded-2xl py-3 text-left" onClick={close}>
              <Globe className="h-5 w-5 shrink-0" />
              <span><span className="block font-semibold">{fil ? "Buksan ang website" : "Open the website"}</span>
                <span className="block text-xs font-normal opacity-90">{fil ? "Para sa mga bisita, walang kailangang account" : "For visitors, no account needed"}</span></span>
            </Button>
            <Button variant="outline" className="h-auto w-full justify-start gap-3 rounded-2xl py-3 text-left" onClick={() => setShowQr(true)}>
              <QrCode className="h-5 w-5 shrink-0" />
              <span><span className="block font-semibold">{fil ? "QR code ng website" : "Website QR code"}</span>
                <span className="block text-xs font-normal text-muted-foreground">{fil ? "Ipa-scan sa mga kasama mo" : "Let your companions scan it"}</span></span>
            </Button>
            <p className="pt-1 text-center text-xs text-muted-foreground">
              {fil ? "Tip: i-scan ang QR code sa bawat kulungan para makilala ang hayop." : "Tip: scan the QR code at each exhibit to meet the animal."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {siteUrl ? (
              <>
                {qr ? <img src={qr} alt={fil ? "QR code ng website ng Manila Zoo" : "QR code for the Manila Zoo website"} className="aspect-square w-full max-w-[18rem] rounded-2xl border bg-white p-1" />
                  : <div className="aspect-square w-full max-w-[18rem] animate-pulse rounded-2xl bg-muted" />}
                <p className="break-all text-center text-xs text-muted-foreground">{siteUrl}</p>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">{fil ? "Wala pang nakatakdang address ng website." : "The website's public address hasn't been set yet."}</p>
            )}
            <div className="flex w-full gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowQr(false)}><ChevronLeft className="mr-1 h-4 w-4" /> {fil ? "Bumalik" : "Back"}</Button>
              <Button className="flex-1" onClick={close}><X className="mr-1 h-4 w-4" /> {fil ? "Isara" : "Close"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
