import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { supabase } from "./lib/supabase";

/**
 * Main photos from the team's "Animals" Google Doc (one picture under each animal's name).
 * Replaces only an empty photo or a temporary picture cropped from a zoo sign (sign-pictures/),
 * never a photo taken at the zoo or uploaded by an admin.
 *
 *   npx tsx --env-file=../../.env ./src/importDocPhotos.ts <folder with 001.jpg … 013.jpg>
 */
const dir = process.argv[2];
if (!dir) { console.error("Usage: importDocPhotos.ts <photo folder>"); process.exit(1); }

// Image number in the document → the animal named above it
const PHOTOS: [number, string][] = [
  [7, "Double-wattled Cassowary"],
  [5, "Green Imperial Pigeon"],
  [6, "Indian Blue Peafowl"],
  [10, "Painted Stork"],
  [13, "Ring-tailed Lemur"],
  [2, "Lar Gibbon"],
  [12, "Japanese Macaque"],
  [1, "Nicobar Pigeon"],
  [4, "Ostrich"],
  [8, "Philippine Deer"],
  [9, "Samar Cobra"],
  [11, "Tarictic Hornbill"],
  [3, "White-eared Brown Fruit Dove"],
];

const replaceable = (url: string | null) => !url || url.includes("/sign-pictures/");

async function main() {
  for (const [n, name] of PHOTOS) {
    const { rows: [animal] } = await pool.query<{ id: number; image_url: string | null }>(
      "SELECT id, image_url FROM animals WHERE lower(name) = lower($1)", [name]);
    if (!animal) { console.log(`skip     ${name}: not found`); continue; }
    if (!replaceable(animal.image_url)) { console.log(`keep     ${name}: has its own photo`); continue; }

    const body = await readFile(path.join(dir!, `${String(n).padStart(3, "0")}.jpg`));
    const key = `doc-photos/${randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("animal-photos").upload(key, body, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (error) throw new Error(`Upload for ${name} failed: ${error.message}`);
    const url = supabase.storage.from("animal-photos").getPublicUrl(key).data.publicUrl;
    await pool.query("UPDATE animals SET image_url = $1, updated_at = NOW() WHERE id = $2", [url, animal.id]);
    console.log(`set      ${name} (#${animal.id})`);
  }
  await pool.end();
  console.log("done");
}

main().catch(err => { console.error(err); process.exit(1); });
