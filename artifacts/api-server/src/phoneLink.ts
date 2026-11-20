import { spawn, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { Resolver } from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";

/**
 * Saves the permanent address https://manilazoonavigationsystem.com as the website's public address
 * when it answers (see the end of this file). Only if it doesn't, falls back to the old behaviour:
 *
 * Keeps a public https:// link to the website running on this laptop, so the "access the website"
 * QR code always works. Starts a Cloudflare quick tunnel, waits until the new link is reachable on
 * the internet, then saves it as the public address (Admin → QR Code Access). Everything that shows
 * the website QR code reads that address, so it follows. When the tunnel stops, it starts a new one.
 *
 *   npx tsx --env-file=../../.env ./src/phoneLink.ts      (run by deploy/autostart/phone-link.cmd)
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SITE_PORT = 4173;
const CLOUDFLARED = ["C:/Program Files (x86)/cloudflared/cloudflared.exe", "C:/Program Files/cloudflared/cloudflared.exe"].find(existsSync) ?? "cloudflared";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const log = (msg: string) => console.log(`[${new Date().toLocaleString("en-PH")}] ${msg}`);

const portOpen = (port: number) => new Promise<boolean>(resolve => {
  const s = net.connect(port, "127.0.0.1", () => { s.end(); resolve(true); });
  s.on("error", () => resolve(false));
});

// Asks public DNS (not the laptop's or the Wi-Fi router's, which may still remember "not found")
const publicDns = new Resolver();
publicDns.setServers(["1.1.1.1", "8.8.8.8"]);

/** Whether the link answers from the internet: its address is published and the website responds */
async function reachable(url: string): Promise<boolean> {
  const host = new URL(url).hostname;
  let ip: string;
  try { [ip] = await publicDns.resolve4(host) as [string]; } catch { return false; }
  return new Promise(resolve => {
    const req = https.get({ host: ip, servername: host, headers: { host }, path: "/api/settings/public", timeout: 10_000 },
      res => { res.resume(); resolve(res.statusCode === 200); });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

/** Saves the link as the website's public address and points the stored exhibit-code images at it */
async function saveLink(url: string) {
  await pool.query("UPDATE system_settings SET value = $1::jsonb WHERE key = 'public_site_url'", [JSON.stringify(url)]);
  const { rows } = await pool.query<{ id: number; code: string }>("SELECT id, code FROM qr_codes");
  for (const r of rows) {
    const data = `${url}/q/${encodeURIComponent(r.code)}`;
    await pool.query("UPDATE qr_codes SET qr_image_url = $1 WHERE id = $2", [`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`, r.id]);
  }
  writeFileSync(path.join(ROOT, "current-phone-link.txt"),
    `Phone link (open on any phone, or scan the QR code on the website):\r\n${url}\r\n\r\nSaved ${new Date().toLocaleString("en-PH")}. ` +
    `It changes when the laptop restarts; printed exhibit QR signs then need reprinting (Admin > Exhibit QR Codes > Print all).\r\n`);
  // The printable visitor poster in visitor-qr-code/ (not essential if it fails)
  const poster = spawnSync(process.execPath, [path.join(ROOT, "deploy/make-visitor-qr.mjs"), `${url}/r`], { encoding: "utf8", timeout: 120_000 });
  log(poster.status === 0 ? "Visitor QR poster updated." : "Couldn't update the visitor QR poster (the website QR codes still work).");
}

async function runOnce() {
  while (!(await portOpen(SITE_PORT))) { log("Waiting for the website on port 4173..."); await sleep(15_000); }
  log("Starting the phone link...");
  const tunnel = spawn(CLOUDFLARED, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${SITE_PORT}`], { windowsHide: true });
  let url: string | null = null;
  const onOutput = (chunk: Buffer) => { url ??= chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] ?? null; };
  tunnel.stdout.on("data", onOutput);
  tunnel.stderr.on("data", onOutput);
  const ended = new Promise<number | null>(resolve => tunnel.on("exit", resolve));
  tunnel.on("error", err => log(`Couldn't start cloudflared: ${err.message}`));

  for (let i = 0; i < 60 && !url; i++) await sleep(1000);
  if (!url) { log("No link from Cloudflare; trying again."); tunnel.kill(); await ended; return; }

  // Save only once the link works from outside, so the QR code never points at a link that isn't up yet
  log(`New link ${url}; waiting until it's reachable...`);
  let up = false;
  for (let i = 0; i < 60 && !up && tunnel.exitCode === null; i++) { up = await reachable(url); if (!up) await sleep(5000); }
  if (!up) { log("The link never became reachable; starting a new one."); tunnel.kill(); await ended; return; }
  await saveLink(url);
  log(`Phone link ready and saved: ${url}`);

  // Watch it; a link that stops answering is replaced
  let misses = 0;
  while (tunnel.exitCode === null) {
    await sleep(60_000);
    misses = (await reachable(url)) ? 0 : misses + 1;
    if (misses >= 5) { log("The link stopped answering; replacing it."); tunnel.kill(); }
  }
  await ended;
  log("The phone link stopped.");
}

// The permanent address (Cloudflare tunnel "manila-zoo", started by start-domain.cmd). When it answers,
// it's saved as the public address and no temporary link is made, so QR codes never point at a
// trycloudflare.com link that later disappears. `--set <url>` saves any other address the same way.
const PERMANENT_URL = "https://manilazoonavigationsystem.com";
const setArg = process.argv.indexOf("--set");
const fixedUrl = setArg >= 0 ? process.argv[setArg + 1]?.replace(/\/+$/, "") : PERMANENT_URL;

if (fixedUrl && (setArg >= 0 || await reachable(fixedUrl))) {
  await saveLink(fixedUrl);
  log(`Public address saved: ${fixedUrl}`);
  await pool.end();
  process.exit(0);
}

log(`${PERMANENT_URL} isn't answering (is start-domain.cmd running?); using a temporary link instead.`);
for (;;) {
  try { await runOnce(); } catch (err) { log(`Error: ${(err as Error).message}`); }
  await sleep(10_000);
}
