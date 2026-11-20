import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { logger } from "../lib/logger";

/**
 * GET /api/img?src=<photo link>&w=<width>: a small copy of an uploaded photo.
 *
 * Uploaded photos are kept at full size (often 400–650 KB), but cards show them a few hundred pixels
 * wide, so the Animals page alone downloaded over 2.5 MB. This shrinks a photo to the width asked
 * for (WebP for browsers that take it, JPEG otherwise), saves the result on disk and serves it from
 * there afterwards. The original in Supabase Storage is never changed.
 *
 * Only photos in this project's public storage are accepted, so the route can't be used to fetch
 * other sites. Every upload gets a new random file name, so a link's photo never changes and the
 * small copy can be cached for a year. If anything fails, the visitor is sent to the original photo.
 */

const router: IRouter = Router();

const SUPABASE_URL = (process.env["VITE_SUPABASE_URL"] ?? "").replace(/\/+$/, "");
const ALLOWED_PREFIX = SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/` : null;
/** Widths offered; a request is rounded up to the next one so the cache stays small */
export const THUMB_WIDTHS = [320, 640, 960, 1600] as const;
const CACHE_DIR = process.env["THUMB_CACHE_DIR"] || path.join(os.tmpdir(), "manila-zoo-thumbs");
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const YEAR = 60 * 60 * 24 * 365;

// Two visitors asking for the same new thumbnail at once share one resize
const inFlight = new Map<string, Promise<Buffer>>();

async function makeThumb(src: string, width: number, format: "webp" | "jpeg", file: string): Promise<Buffer> {
  const res = await fetch(src, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`source answered ${res.status}`);
  const size = Number(res.headers.get("content-length") ?? 0);
  if (size > MAX_SOURCE_BYTES) throw new Error("source too large");
  const input = Buffer.from(await res.arrayBuffer());
  if (input.length > MAX_SOURCE_BYTES) throw new Error("source too large");
  // rotate() applies the camera's orientation before the EXIF data is dropped
  const pipeline = sharp(input, { failOn: "none" }).rotate().resize({ width, withoutEnlargement: true });
  const out = format === "webp" ? await pipeline.webp({ quality: 72 }).toBuffer() : await pipeline.jpeg({ quality: 76, mozjpeg: true }).toBuffer();
  // Write to a temporary name, then rename, so a half-written file is never served
  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, out);
  await rename(tmp, file).catch(() => {});
  return out;
}

const allowed = (src: string) => !!ALLOWED_PREFIX && src.startsWith(ALLOWED_PREFIX) && !src.includes("..");

/** The small copy from disk, or made now (shared with anyone else asking for it at the same time) */
async function getThumb(src: string, width: number, format: "webp" | "jpeg"): Promise<Buffer> {
  const key = createHash("sha256").update(`${src}|${width}|${format}`).digest("hex").slice(0, 32);
  const file = path.join(CACHE_DIR, `${key}.${format === "webp" ? "webp" : "jpg"}`);
  const saved: Buffer | null = await readFile(file).catch(() => null);
  if (saved) return saved;
  let job = inFlight.get(key);
  if (!job) {
    job = makeThumb(src, width, format, file).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  return job;
}

/**
 * Makes the usual card-size copies of every uploaded photo in the background after the server
 * starts, one at a time, so the first visitor to open a page doesn't wait for them. Copies already on
 * disk are skipped, so after the first run this takes a moment.
 */
export async function warmThumbnails(): Promise<void> {
  if (!ALLOWED_PREFIX) return;
  const { pool } = await import("@workspace/db");
  const links = new Set<string>();
  for (const sql of [
    "SELECT image_url AS u FROM animals",
    "SELECT image_url AS u FROM animal_gallery",
    "SELECT image_url AS u FROM events",
    "SELECT image_url AS u FROM map_pins",
    "SELECT photo_url AS u FROM facilities",
  ]) {
    // A table or column that doesn't exist in this database is simply skipped
    const rows = await pool.query<{ u: string | null }>(sql).then(r => r.rows).catch(() => []);
    for (const { u } of rows) if (u && allowed(u)) links.add(u);
  }
  let made = 0, failed = 0;
  const started = Date.now();
  for (const src of links) {
    for (const width of [320, 640, 960]) {
      try { await getThumb(src, width, "webp"); made++; } catch { failed++; }
    }
  }
  logger.info({ photos: links.size, copies: made, failed, seconds: Math.round((Date.now() - started) / 1000) }, "Photo thumbnails ready");
}

router.get("/img", async (req, res) => {
  const src = typeof req.query["src"] === "string" ? req.query["src"] : "";
  if (!allowed(src)) {
    res.status(400).json({ error: "Only photos uploaded to the zoo's storage can be resized" });
    return;
  }
  const asked = Number(req.query["w"]) || 640;
  const width = THUMB_WIDTHS.find(w => w >= asked) ?? THUMB_WIDTHS[THUMB_WIDTHS.length - 1];
  const format = /image\/webp/.test(req.headers.accept ?? "") ? "webp" : "jpeg";

  res.setHeader("Vary", "Accept");
  try {
    const body = await getThumb(src, width, format);
    res.setHeader("Content-Type", format === "webp" ? "image/webp" : "image/jpeg");
    res.setHeader("Cache-Control", `public, max-age=${YEAR}, immutable`);
    res.send(body);
  } catch (err) {
    logger.warn({ err: (err as Error).message, src }, "Thumbnail failed; sending the original photo");
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, src);
  }
});

export default router;
