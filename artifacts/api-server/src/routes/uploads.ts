import express, { Router } from "express";
import { randomUUID } from "crypto";
import { supabase } from "../lib/supabase";
import { requireAdmin } from "../middleware/requireAdmin";
import { logger } from "../lib/logger";

/**
 * Animal photo uploads for admins. Photos go to a public Supabase Storage bucket, so they stay
 * available wherever the website and API are hosted. The browser shrinks photos before sending.
 */
const router = Router();
const BUCKET = "animal-photos";
const MAX_BYTES = 6 * 1024 * 1024;

// The first bytes of each allowed format, so a renamed non-image file is refused
const FORMATS: { type: string; ext: string; magic: (b: Buffer) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", magic: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", magic: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/webp", ext: "webp", magic: b => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
];

let bucketReady = false;
async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true, // visitors' browsers load the photos directly
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: FORMATS.map(f => f.type),
    });
    if (error && !/already exists/i.test(error.message)) throw error;
    logger.info({ bucket: BUCKET }, "Created the animal photo bucket");
  }
  bucketReady = true;
}

// POST /api/uploads/animal-photo with the image itself as the body (Content-Type: image/jpeg|png|webp)
router.post(
  "/uploads/animal-photo",
  requireAdmin,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_BYTES }),
  async (req, res): Promise<void> => {
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "Send a JPEG, PNG or WebP image" });
      return;
    }
    const format = FORMATS.find(f => f.magic(body));
    if (!format) { res.status(400).json({ error: "That file isn't a JPEG, PNG or WebP image" }); return; }

    try {
      await ensureBucket();
      const path = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${format.ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: format.type, cacheControl: "31536000" });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      res.status(201).json({ url: data.publicUrl });
    } catch (err) {
      req.log.error({ err }, "Animal photo upload failed");
      res.status(502).json({ error: "Couldn't save the photo to storage" });
    }
  },
);

export default router;
