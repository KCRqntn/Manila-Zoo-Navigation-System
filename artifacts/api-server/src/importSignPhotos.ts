import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { supabase } from "./lib/supabase";

/**
 * Adds photos of the zoo's information signs (from the team's "Animals" Google Doc) to each animal's
 * gallery. Main photos are left alone. Safe to run again: it replaces this import's sign photos.
 *
 *   npx tsx --env-file=../../.env ./src/importSignPhotos.ts <folder with 001.jpg … 012.jpg>
 */
const dir = process.argv[2];
if (!dir) { console.error("Usage: importSignPhotos.ts <photo folder>"); process.exit(1); }

const CAPTION = "Information sign at Manila Zoo";
// Image number in the document → animal(s) on that sign
const SIGNS: [number, string[]][] = [
  [1, ["Indian Blue Peafowl", "Painted Stork"]],
  [2, ["Samar Cobra"]],
  [3, ["Lar Gibbon"]],
  [4, ["Green Imperial Pigeon"]],
  [5, ["Ring-tailed Lemur"]],
  [6, ["Tarictic Hornbill"]],
  [7, ["Japanese Macaque"]],
  [8, ["Ostrich"]],
  [9, ["Double-wattled Cassowary"]],
  [10, ["Capybara"]],
  [11, ["Nicobar Pigeon"]],
  [12, ["White-eared Brown Fruit Dove"]],
];

async function main() {
  for (const [n, names] of SIGNS) {
    const body = await readFile(path.join(dir!, `${String(n).padStart(3, "0")}.jpg`));
    const key = `zoo-signs/${randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("animal-photos").upload(key, body, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (error) throw new Error(`Upload of image ${n} failed: ${error.message}`);
    const url = supabase.storage.from("animal-photos").getPublicUrl(key).data.publicUrl;

    for (const name of names) {
      const { rows: [animal] } = await pool.query<{ id: number }>("SELECT id FROM animals WHERE lower(name) = lower($1)", [name]);
      if (!animal) { console.log(`skip     ${name}: not found`); continue; }
      await pool.query("DELETE FROM animal_gallery WHERE animal_id = $1 AND caption = $2", [animal.id, CAPTION]);
      // After any photos of the animal itself
      await pool.query(
        "INSERT INTO animal_gallery (animal_id, image_url, caption, sort_order) VALUES ($1, $2, $3, 100)",
        [animal.id, url, CAPTION]);
      console.log(`added    ${name} (#${animal.id})`);
    }
  }
  await pool.end();
  console.log("done");
}

main().catch(err => { console.error(err); process.exit(1); });
