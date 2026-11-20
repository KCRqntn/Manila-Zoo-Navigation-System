import { pool } from "@workspace/db";
import { ensureMapLayoutSchema } from "./lib/mapSchema";
import { importZooLayout } from "./lib/zooLayout";

// Replaces the map (pins, footprints, walkways, center) with the real Manila Zoo layout.
// Anything drawn in the Map Editor is overwritten, so run it once, before customising.
async function run() {
  await ensureMapLayoutSchema();
  const result = await importZooLayout();
  console.log(`Imported the Manila Zoo layout: ${result.pins} pins, ${result.features} footprints, ${result.paths} walkways`);
  await pool.end();
}

run().catch(err => {
  console.error("Import failed:", err);
  process.exit(1);
});
