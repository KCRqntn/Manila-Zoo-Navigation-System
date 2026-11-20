import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { supabase } from "./lib/supabase";

/**
 * Temporary main photos: the animal picture cropped from each zoo information sign, for animals
 * that have no photo of their own yet. Never replaces an existing photo, so a real photo uploaded
 * in Admin → Animals always wins. The sign pictures belong to whoever made the signs.
 *
 *   npx tsx --env-file=../../.env ./src/importSignCrops.ts <folder with <slug>.jpg crops>
 */
const dir = process.argv[2];
if (!dir) { console.error("Usage: importSignCrops.ts <crop folder>"); process.exit(1); }

const ANIMALS: Record<string, string> = {
  "ring-tailed-lemur": "Ring-tailed Lemur",
  "lar-gibbon": "Lar Gibbon",
  "japanese-macaque": "Japanese Macaque",
  "philippine-deer": "Philippine Deer",
  "ostrich": "Ostrich",
  "double-wattled-cassowary": "Double-wattled Cassowary",
  "tarictic-hornbill": "Tarictic Hornbill",
  "indian-blue-peafowl": "Indian Blue Peafowl",
  "painted-stork": "Painted Stork",
  "nicobar-pigeon": "Nicobar Pigeon",
  "green-imperial-pigeon": "Green Imperial Pigeon",
  "white-eared-brown-fruit-dove": "White-eared Brown Fruit Dove",
  "samar-cobra": "Samar Cobra",
};

async function main() {
  for (const [slug, name] of Object.entries(ANIMALS)) {
    const { rows: [animal] } = await pool.query<{ id: number; image_url: string | null }>(
      "SELECT id, image_url FROM animals WHERE lower(name) = lower($1)", [name]);
    if (!animal) { console.log(`skip     ${name}: not found`); continue; }
    if (animal.image_url) { console.log(`keep     ${name}: already has a photo`); continue; }

    const body = await readFile(path.join(dir!, `${slug}.jpg`));
    const key = `sign-pictures/${slug}-${randomUUID().slice(0, 8)}.jpg`;
    const { error } = await supabase.storage.from("animal-photos").upload(key, body, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (error) throw new Error(`Upload for ${name} failed: ${error.message}`);
    const url = supabase.storage.from("animal-photos").getPublicUrl(key).data.publicUrl;
    // Only fills an empty photo, even if someone uploaded one meanwhile
    const { rowCount } = await pool.query("UPDATE animals SET image_url = $1, updated_at = NOW() WHERE id = $2 AND image_url IS NULL", [url, animal.id]);
    console.log(rowCount ? `set      ${name} (#${animal.id})` : `keep     ${name}: got a photo meanwhile`);
  }
  await pool.end();
  console.log("done");
}

main().catch(err => { console.error(err); process.exit(1); });
