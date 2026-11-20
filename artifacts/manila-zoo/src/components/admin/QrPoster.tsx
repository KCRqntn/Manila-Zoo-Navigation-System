import React from "react";
import { createPortal } from "react-dom";

/**
 * The printable visitor-registration poster. It only lays out the QR code image it is given (the one
 * already generated on the QR Code Access page), so the code's link and data never change here.
 *
 * Sizes are in cqw (percent of the poster's width), so the same poster is drawn in the on-screen A4
 * preview and on the printed A4 page.
 */
const GREEN = "#1F4D3A";
const GOLD = "#E8A03C";

export const LOGO_SRC = `${import.meta.env.BASE_URL}favicon.svg`;

export function QrPoster({ qr, target }: { qr: string; target: string }) {
  return (
    <div className="qr-poster" style={{ color: GREEN, fontFamily: "Arial, Helvetica, sans-serif", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      {/* Branding */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3cqw" }}>
        <img src={LOGO_SRC} alt="Manila Zoo logo" style={{ width: "13cqw", height: "13cqw" }} />
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "6.4cqw", fontWeight: 800, letterSpacing: "0.06em", lineHeight: 1.05 }}>MANILA ZOO</div>
          <div style={{ fontSize: "2.5cqw", color: "#4a5d54", letterSpacing: "0.04em", marginTop: "0.6cqw" }}>Navigation and Information System</div>
        </div>
      </div>

      <div style={{ width: "18cqw", height: "0.7cqw", background: GOLD, borderRadius: "1cqw", margin: "5cqw 0 4.5cqw" }} />

      <h1 style={{ fontSize: "6cqw", fontWeight: 800, lineHeight: 1.15, margin: 0 }}>Manila Zoo Visitor Registration</h1>
      <p style={{ fontSize: "3.6cqw", fontWeight: 600, margin: "2.4cqw 0 0", color: "#2b2b2b" }}>Scan this QR Code to Register Your Visit</p>

      {/* The existing QR code, unchanged */}
      <div style={{ marginTop: "4.5cqw", padding: "2cqw", border: `0.6cqw solid ${GREEN}`, borderRadius: "3cqw", background: "#ffffff", lineHeight: 0 }}>
        <img src={qr} alt={`QR code that opens ${target}`} style={{ width: "66cqw", height: "66cqw", imageRendering: "pixelated" }} />
      </div>

      <p style={{ fontSize: "3cqw", margin: "4.5cqw 0 0", color: "#2b2b2b", maxWidth: "96cqw", lineHeight: 1.35 }}>
        Register your visit and explore the Manila Zoo Navigation System.
      </p>
      <p style={{ fontSize: "2.1cqw", margin: "2cqw 0 0", color: "#6b6b6b", wordBreak: "break-all" }}>{target}</p>
    </div>
  );
}

/** A4 sheet used for the on-screen preview: same proportions and inner margin as the printed page */
export function QrPosterPreview({ qr, target }: { qr: string; target: string }) {
  return (
    <div className="w-full max-w-[420px] rounded-md border bg-white shadow-md" style={{ aspectRatio: "210 / 297", padding: "6.67%", display: "flex", alignItems: "center" }}>
      <div style={{ containerType: "inline-size", width: "100%" }}>
        <QrPoster qr={qr} target={target} />
      </div>
    </div>
  );
}

/*
 * Print styles, active only while QrPosterPrint is mounted (the QR Code Access page): every other
 * element of the app (navbar, sidebar, dashboard, buttons, toasts, dialogs) is hidden and only the
 * poster prints, centred on one A4 portrait page. @page margin 0 also stops the browser printing its
 * own header/footer; the poster keeps a 14 mm inner margin so printers that can't reach the edge
 * don't cut it off. Its content is about 130% of its width tall, so it also fits on US Letter.
 */
export const PRINT_CSS = `
.qr-print-root { display: none; }
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { background: #ffffff !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
  body > *:not(.qr-print-root) { display: none !important; }
  .qr-print-root {
    display: flex !important; align-items: center; justify-content: center;
    width: 100%; height: 100vh; padding: 14mm; box-sizing: border-box; overflow: hidden;
    break-inside: avoid; page-break-inside: avoid;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .qr-print-root .qr-print-inner { container-type: inline-size; width: 100%; max-width: 182mm; }
}
`;

/** Mounts the hidden print copy of the poster directly in <body>, outside the admin layout */
export function QrPosterPrint({ qr, target }: { qr: string; target: string }) {
  return createPortal(
    <div className="qr-print-root" aria-hidden="true">
      <style>{PRINT_CSS}</style>
      <div className="qr-print-inner">
        <QrPoster qr={qr} target={target} />
      </div>
    </div>,
    document.body,
  );
}
