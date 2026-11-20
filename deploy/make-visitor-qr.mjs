// Makes the visitor-website QR code: a PNG and a printable A4 poster (HTML + PDF via headless Chrome).
//   node deploy/make-visitor-qr.mjs <website address> [output folder, default visitor-qr-code]
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [url, outDir = path.join(root, "visitor-qr-code")] = process.argv.slice(2);
if (!url) { console.error("Usage: node deploy/make-visitor-qr.mjs <website address> [output folder]"); process.exit(1); }
const require = createRequire(path.join(root, "artifacts/manila-zoo/package.json"));
const QRCode = require("qrcode");
mkdirSync(outDir, { recursive: true });

// Same style as every QR code in the website: black on white, 4-square border, error correction "M"
// "L": the poster is a clean print, so bigger squares scan more easily (exhibit signs use "M")
const opts = { errorCorrectionLevel: "L", margin: 4, color: { dark: "#000000", light: "#ffffff" } };
await QRCode.toFile(path.join(outDir, "visitor-website-qr.png"), url, { ...opts, width: 1200 });
const svg = await QRCode.toString(url, { ...opts, type: "svg" });

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Manila Zoo – Scan to register your visit</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1b4332; text-align: center; }
  .sheet { border: 3px solid #2d6a4f; border-radius: 18px; padding: 14mm 12mm; height: 262mm; overflow: hidden; display: flex; flex-direction: column; align-items: center; }
  .giraffe { font-size: 54px; line-height: 1; }
  h1 { font-size: 40px; margin: 3mm 0 1mm; letter-spacing: .5px; }
  .tag { font-size: 19px; margin: 0 0 8mm; color: #2d6a4f; }
  .qr { width: 112mm; height: 112mm; padding: 4mm; border: 2px solid #2d6a4f; border-radius: 12px; background: #fff; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .scan { font-size: 26px; font-weight: bold; margin: 6mm 0 1mm; }
  .scan-fil { font-size: 20px; margin: 0 0 7mm; }
  ul { list-style: none; padding: 0; margin: 0 auto 6mm; font-size: 16px; line-height: 1.7; display: inline-block; text-align: left; }
  .url { font-size: 13px; color: #555; word-break: break-all; margin-top: auto; }
  .note { font-size: 11px; color: #777; margin-top: 2mm; }
</style></head>
<body><div class="sheet">
  <div class="giraffe">🦒</div>
  <h1>Manila Zoo</h1>
  <p class="tag">Navigation &amp; Information System · Gabay sa Manila Zoo</p>
  <div class="qr">${svg}</div>
  <p class="scan">Scan with your phone camera to register your visit</p>
  <p class="scan-fil">I-scan gamit ang camera ng iyong telepono para magparehistro</p>
  <ul>
    <li>🗺️ Interactive zoo map &amp; directions · Mapa at direksyon</li>
    <li>🐾 Meet the animals · Kilalanin ang mga hayop</li>
    <li>💬 AI Guide in English &amp; Filipino · AI Guide sa Ingles at Filipino</li>
    <li>🎟️ Hours, ticket prices &amp; zoo rules · Oras, presyo at patakaran</li>
  </ul>
  <p class="url">${url}</p>
  <p class="note">No app or account needed · Hindi kailangan ng app o account</p>
</div></body></html>`;
const htmlPath = path.join(outDir, "visitor-website-qr-poster.html");
writeFileSync(htmlPath, html);

const pdfPath = path.join(outDir, "visitor-website-qr-poster.pdf");
const r = spawnSync("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdfPath}`, `file:///${htmlPath.replace(/\\/g, "/")}`,
], { stdio: "pipe", timeout: 60000 });
console.log("chrome exit", r.status);
console.log("done:", outDir);
