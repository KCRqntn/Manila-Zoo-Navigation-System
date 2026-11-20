import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pool } from "@workspace/db";

/**
 * Creates the QR codes to print and post at the zoo, the same way Admin → QR Codes does:
 *   - one per animal that doesn't have an active code yet (MNL-ZOO-…), posted at its exhibit
 *   - one location code (MNL-LOC-…) per restroom, gate, food area and first aid station
 * Safe to run again: anything that already has an active code is skipped.
 * Writes a list of all active codes as JSON for the print sheet.
 *
 *   npx tsx --env-file=../../.env ./src/generateQrCodes.ts <output.json>
 */
const out = process.argv[2];
const LOCATION_TYPES = ["restroom", "entrance", "exit", "food_stall", "emergency"];
const imageUrl = (code: string) => `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(code)}`;
const newCode = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;

async function main() {
  const { rows: animals } = await pool.query<{ id: number; name: string }>(`
    SELECT a.id, a.name FROM animals a
    WHERE NOT EXISTS (SELECT 1 FROM qr_codes q WHERE q.animal_id = a.id AND q.is_active) ORDER BY a.name`);
  for (const a of animals) {
    const code = newCode("MNL-ZOO");
    await pool.query("INSERT INTO qr_codes (code, animal_id, qr_image_url, scan_count, is_active) VALUES ($1, $2, $3, 0, TRUE)", [code, a.id, imageUrl(code)]);
    console.log(`animal    ${code}  ${a.name}`);
  }

  const { rows: places } = await pool.query<{ id: number; name: string }>(`
    SELECT p.id, p.name FROM map_pins p
    WHERE p.is_active AND p.pin_type = ANY($1)
      AND NOT EXISTS (SELECT 1 FROM qr_codes q WHERE q.map_pin_id = p.id AND q.is_active) ORDER BY p.name`, [LOCATION_TYPES]);
  for (const p of places) {
    const code = newCode("MNL-LOC");
    await pool.query("INSERT INTO qr_codes (code, map_pin_id, qr_image_url, scan_count, is_active) VALUES ($1, $2, $3, 0, TRUE)", [code, p.id, imageUrl(code)]);
    console.log(`location  ${code}  ${p.name}`);
  }

  const { rows: all } = await pool.query(`
    SELECT q.code, a.name AS animal, p.name AS place, ap.name AS exhibit
    FROM qr_codes q
    LEFT JOIN animals a ON a.id = q.animal_id
    LEFT JOIN map_pins ap ON ap.id = a.location_id
    LEFT JOIN map_pins p ON p.id = q.map_pin_id
    WHERE q.is_active ORDER BY (q.map_pin_id IS NOT NULL), ap.name NULLS LAST, a.name, p.name`);
  if (out) await writeFile(out, JSON.stringify(all, null, 1));
  console.log(`${animals.length} animal and ${places.length} location codes created; ${all.length} active in total`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
