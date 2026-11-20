import React, { useState, useEffect } from "react";
import { scanQrCode } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Camera, ArrowRight, Loader2, X, Keyboard } from "lucide-react";
import { useLocation } from "wouter";
import { saveScannedAnimal, setVisitorLocation } from "@/lib/visitorLocation";
import { cameraSettingsHelp, inAppBrowser } from "@/lib/device";
import { useQueryClient } from "@tanstack/react-query";
import { useAppCtx } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { claimScanPoints, type ScanClaim } from "@/lib/games";

type ScanSource = "camera" | "link" | "typed";

/**
 * Camera QR scanner with a manual-code fallback. Logged-in visitors earn points (the exhibit's own
 * points and running scavenger hunts) only for codes this camera reads; a code opened from its link
 * or typed in shows the animal without points. "animal" mode then opens the animal's profile
 * (Animals page, Scan QR page); "game" mode stays put and celebrates the points instead (Games tab).
 */
export function QrScannerPanel({ onDone, mode = "animal", initialCode }: {
  onDone?: () => void;
  mode?: "animal" | "game" | "location";
  /** A code from the page link (/qr-scan?code=…), e.g. a sign scanned with the phone's own camera app */
  initialCode?: string | null;
}) {
  const [manualCode, setManualCode] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { language } = useAppCtx();
  const { user } = useAuth();
  const fil = language === "fil";
  // Game mode: the result of the last scan
  const [result, setResult] = useState<{ animal: { id: number; name: string }; claim: ScanClaim | null; source: ScanSource } | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCode) handleScan(initialCode, "link");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  // Starts the back camera as soon as the visitor taps "Open camera" (one tap, no extra screen)
  useEffect(() => {
    if (!scannerActive) return;
    let stopped = false;
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    const stop = () => {
      if (scanner?.isScanning) scanner.stop().then(() => scanner?.clear()).catch(() => {});
    };
    setCameraError(null);

    import("html5-qrcode").then(({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
      if (stopped) return;
      scanner = new Html5Qrcode("qr-reader", {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: (w, h) => { const side = Math.floor(Math.min(w, h) * 0.7); return { width: side, height: side }; } },
        decodedText => {
          stop();
          setScannerActive(false);
          handleScan(decodedText, "camera");
        },
        () => { /* no code in this frame yet; keep scanning */ },
      ).then(() => { if (stopped) stop(); }).catch((err: unknown) => {
        const msg = String((err as { name?: string; message?: string })?.name ?? err);
        setCameraError(
          !window.isSecureContext
            ? (fil ? "Gumagana lang ang camera sa secure (https://) na link." : "The camera only works on a secure (https://) link.")
            : inAppBrowser
              ? (fil ? `Hinaharangan ng browser ng ${inAppBrowser} ang camera. Buksan ang page sa Safari o Chrome, o i-type ang code sa ilalim ng QR.` : `${inAppBrowser}'s built-in browser blocks the camera. Open this page in Safari or Chrome, or type the code printed under the QR.`)
              : /NotAllowed|Permission/i.test(msg)
                // Where to turn the camera back on differs on iPhone and Android
                ? `${fil ? "Naka-block ang camera." : "Camera access is blocked."} ${cameraSettingsHelp(fil ? "fil" : "en")} ${fil ? "O i-type ang code sa ilalim ng QR." : "Or type the code printed under the QR."}`
                : (fil ? "Hindi mabuksan ang camera. I-type na lang ang code sa ilalim ng QR." : "Couldn't open the camera. Type the code printed under the QR instead."));
        setScannerActive(false);
        setShowManual(true);
      });
    });

    return () => { stopped = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerActive]);

  const handleScan = async (code: string, source: ScanSource) => {
    if (!code || scanning) return;
    let extractedCode = code.trim();
    try {
      const url = new URL(extractedCode);
      extractedCode = url.searchParams.get("code") || url.pathname.split("/").pop() || extractedCode;
    } catch {
      // Not a URL; use the text as the code
    }

    setScanning(true);
    try {
      // Always ask the server: a scan also counts the visit, so it must not come from cache
      const data = await scanQrCode(extractedCode);
      const scan = data as {
        animal?: { id: number; name: string } | null;
        location?: { pin_id: number; name: string; lat: number; lng: number } | null;
      };
      // A scanned code is a verified position: the visitor is standing at that sign. It's a one-off
      // starting point (GPS isn't turned on by it), and only places inside the zoo are accepted.
      if (scan?.location && !setVisitorLocation({ lat: scan.location.lat, lng: scan.location.lng, source: "qr", label: scan.location.name, pinId: scan.location.pin_id })) {
        scan.location = null;
      }
      // Map page: the scan is only to say where the visitor is
      if (mode === "location") {
        if (!scan?.location) throw new Error("This code has no place on the map");
        toast({ title: fil ? `📍 Nasa ${scan.location.name} ka` : `📍 You're at ${scan.location.name}`, description: fil ? "Na-update ang lokasyon mo sa mapa." : "Your position on the map is updated." });
        onDone?.();
        return;
      }
      const scanned = scan?.animal;
      if (!scanned?.id) {
        // A location code (restroom, gate…): no animal to show, so open the map at that spot
        if (!scan?.location) throw new Error("Unknown code");
        // A place can give points too (set by the zoo on its QR code)
        let placeClaim: ScanClaim | null = null;
        if (user) { try { placeClaim = await claimScanPoints(extractedCode, source, queryClient); } catch { /* the scan itself still worked */ } }
        const placePoints = placeClaim?.earned ?? 0;
        toast({
          title: placePoints > 0 ? (fil ? `+${placePoints} puntos! 🎉` : `+${placePoints} points! 🎉`) : (fil ? `📍 Nasa ${scan.location.name} ka` : `📍 You're at ${scan.location.name}`),
          description: placePoints > 0 ? (fil ? `📍 Nasa ${scan.location.name} ka. Na-update ang lokasyon mo sa mapa.` : `📍 You're at ${scan.location.name}. Your position on the map is updated.`) : (fil ? "Na-update ang lokasyon mo sa mapa." : "Your position on the map is updated."),
        });
        onDone?.();
        setLocation("/map", { replace: source === "link" });
        return;
      }
      saveScannedAnimal(scanned.id);

      // Points (only with an account, so each visitor's score is their own; the server decides them)
      let claim: ScanClaim | null = null;
      if (user) {
        try { claim = await claimScanPoints(extractedCode, source, queryClient); } catch { /* the scan itself still worked */ }
      }
      const earned = claim?.earned ?? 0;

      if (mode === "game") {
        setResult({ animal: scanned, claim, source });
      } else {
        toast({
          title: earned > 0 ? (fil ? `+${earned} puntos! 🎉` : `+${earned} points! 🎉`) : (fil ? "Na-scan! 🎉" : "Scanned! 🎉"),
          description: claim?.needs_camera
            ? (fil ? `${scanned.name} · Para sa puntos, i-scan ang karatula gamit ang "I-scan para sa puntos" sa Mga Laro.` : `${scanned.name} · To collect points, scan the sign with "Scan for points" on the Games page.`)
            : claim?.needs_visit
              ? (fil ? `${scanned.name} · Irehistro ang pagbisita ngayon para makakuha ng puntos.` : `${scanned.name} · Register today's visit to earn points.`)
              : earned > 0 && claim?.balance != null
                ? (fil ? `${scanned.name} · Mayroon ka nang ${claim.balance} puntos na magagamit.` : `${scanned.name} · You now have ${claim.balance} points to spend.`)
                : scanned.name,
        });
        onDone?.();
        // Opened from a QR link (/q/…): that page only forwards here, so it's replaced; otherwise Back
        // would return to it, scan again and come straight back
        setLocation(`/animals/${scanned.id}`, { replace: source === "link" });
      }
    } catch {
      toast({ title: fil ? "Hindi ma-scan" : "Scan failed", description: fil ? "Mali o hindi aktibo ang QR code" : "Invalid or inactive QR code", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  if (result) {
    const claim = result.claim;
    const awards = claim?.awards ?? [];
    const exhibit = claim?.exhibit ?? null;
    const earned = claim?.earned ?? 0;
    const anythingToEarn = awards.length > 0 || !!exhibit;
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status" aria-live="polite">
        <div className={`text-6xl ${earned > 0 ? "motion-safe:animate-bounce" : ""}`} aria-hidden="true">{earned > 0 ? "🎉" : anythingToEarn ? "👀" : "🐾"}</div>
        <div>
          <p className="text-2xl font-bold text-primary" style={{ fontFamily: "Fredoka, sans-serif" }}>
            {earned > 0 ? `+${earned} ${fil ? "puntos" : "points"}!` : result.animal.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {!user
              ? (fil ? "Mag-login para makakuha ng puntos." : "Log in to earn points for your scans.")
              : claim?.needs_camera
                ? (fil ? "Para sa puntos, i-scan ang QR sign gamit ang camera ng app." : "To collect points, scan the QR sign with the app's camera.")
              : claim?.needs_visit
                ? (fil ? "Irehistro muna ang iyong pagbisita ngayon (QR code sa pasukan) para makakuha ng puntos." : "Register today's visit first (the QR code at the entrance) to earn points.")
              : !anythingToEarn
                ? (fil ? `Walang puntos para kay ${result.animal.name} sa ngayon.` : `The ${result.animal.name} doesn't give points right now.`)
                : earned === 0
                  ? (fil ? "Nahanap mo na ito dati! Subukan ang ibang hayop." : "You've already found this one! Try another animal.")
                  : (fil ? `Nahanap mo ang ${result.animal.name}! Galing!` : `You found the ${result.animal.name}! Great job!`)}
          </p>
          {earned > 0 && claim?.balance != null && (
            <p className="mt-1 text-sm font-semibold">⭐ {fil ? `${claim.balance} puntos na magagamit` : `${claim.balance} points to spend`}</p>
          )}
        </div>
        {exhibit && (
          <div className="w-full rounded-2xl border bg-secondary/50 p-3 text-left text-sm">
            <span className="font-semibold">🐾 {fil ? "Puntos ng exhibit" : "Exhibit points"}</span>
            <span className="float-right font-bold text-primary">{exhibit.points > 0 ? `+${exhibit.points}` : (fil ? "Nakuha na" : "Already collected")}</span>
            {exhibit.points === 0 && !exhibit.once && <p className="mt-1 text-xs text-muted-foreground">{fil ? "Puwede ulit bukas sa susunod mong pagbisita." : "You can collect these again on your next visit day."}</p>}
          </div>
        )}
        {awards.map(a => (
          <div key={a.game_id} className="w-full rounded-2xl border bg-secondary/50 p-3 text-left">
            <p className="text-sm font-semibold">{a.emoji} {fil && a.title_fil ? a.title_fil : a.title}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${a.total ? (a.found / a.total) * 100 : 0}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {a.found}/{a.total} {fil ? "nahanap" : "found"}
              {a.bonus > 0 && ` · 🏆 ${fil ? "Tapos na! Bonus" : "Complete! Bonus"} +${a.bonus}`}
            </p>
          </div>
        ))}
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => { setResult(null); setScannerActive(true); }}>
            <Camera className="mr-1.5 h-4 w-4" /> {fil ? "Mag-scan ulit" : "Scan another"}
          </Button>
          <Button className="rounded-full" onClick={() => { onDone?.(); setLocation(`/animals/${result.animal.id}`); }}>
            {fil ? "Tingnan ang hayop" : "Meet the animal"}
          </Button>
        </div>
      </div>
    );
  }

  if (scannerActive) {
    return (
      <div className="space-y-3">
        <div id="qr-reader" className="min-h-[240px] overflow-hidden rounded-2xl bg-black" />
        <p className="text-center text-sm text-muted-foreground">
          {fil ? "Itapat ang camera sa QR code ng karatula." : "Point the camera at the QR code on the sign."}
        </p>
        <Button variant="outline" className="w-full rounded-full" onClick={() => setScannerActive(false)}>
          <X className="mr-2 w-4 h-4" /> {fil ? "Itigil" : "Stop camera"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      {/* Viewfinder illustration */}
      <div className="relative flex h-40 w-40 items-center justify-center rounded-3xl bg-secondary">
        {["top-2 left-2 border-t-4 border-l-4 rounded-tl-xl", "top-2 right-2 border-t-4 border-r-4 rounded-tr-xl",
          "bottom-2 left-2 border-b-4 border-l-4 rounded-bl-xl", "bottom-2 right-2 border-b-4 border-r-4 rounded-br-xl"].map(c => (
          <span key={c} className={`absolute h-8 w-8 border-primary ${c}`} />
        ))}
        <span className="text-6xl" aria-hidden="true">🐾</span>
      </div>

      <ol className="grid w-full grid-cols-3 gap-2 text-xs text-muted-foreground">
        {(fil
          ? ["Hanapin ang QR sign sa kulungan", "Itapat ang camera", "Alamin ang tungkol sa hayop"]
          : ["Find the QR sign at an exhibit", "Point your camera", "Meet the animal"]
        ).map((step, i) => (
          <li key={i} className="rounded-xl bg-muted/60 p-2">
            <span className="mb-1 block text-base font-bold text-primary">{i + 1}</span>{step}
          </li>
        ))}
      </ol>

      {cameraError && <p role="alert" className="w-full rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{cameraError}</p>}
      <Button size="lg" className="h-12 w-full rounded-full text-base" onClick={() => setScannerActive(true)}>
        <Camera className="mr-2 w-5 h-5" /> {fil ? "Buksan ang camera" : "Open camera"}
      </Button>

      {showManual ? (
        <form onSubmit={(e) => { e.preventDefault(); handleScan(manualCode, "typed"); }} className="flex w-full gap-2">
          <Input
            autoFocus
            placeholder="MNL-ZOO-A1B2C3D4"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="flex-1 rounded-full"
            aria-label={fil ? "QR code" : "QR code"}
          />
          <Button type="submit" size="icon" className="rounded-full" disabled={!manualCode || scanning} aria-label={fil ? "Ipasa" : "Submit"}>
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          </Button>
        </form>
      ) : (
        <button type="button" onClick={() => setShowManual(true)} className="flex items-center text-sm text-muted-foreground hover:text-primary">
          <Keyboard className="mr-1.5 h-4 w-4" /> {fil ? "I-type na lang ang code" : "Type the code instead"}
        </button>
      )}
    </div>
  );
}
