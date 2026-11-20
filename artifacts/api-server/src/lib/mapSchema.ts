import { db, pool, mapFeaturesTable, mapLayoutMetaTable } from "@workspace/db";
import { logger } from "./logger";
import { seedZooLayout } from "./zooLayout";

/**
 * Creates the 2.5D map tables/columns if they are missing, so an existing database keeps
 * working after pulling this feature without a manual `db push`. Every statement is idempotent.
 */
export async function ensureMapLayoutSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS map_features (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      feature_type TEXT NOT NULL DEFAULT 'enclosure',
      geometry JSONB NOT NULL,
      height_m NUMERIC NOT NULL DEFAULT 0,
      min_height_m NUMERIC NOT NULL DEFAULT 0,
      wall_color TEXT DEFAULT '#bfa98a',
      roof_color TEXT DEFAULT '#7a9a6e',
      map_pin_id INTEGER REFERENCES map_pins(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS map_paths (
      id SERIAL PRIMARY KEY,
      name TEXT,
      geometry JSONB NOT NULL,
      is_open BOOLEAN NOT NULL DEFAULT TRUE,
      is_accessible BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS map_layout_meta (
      id INTEGER PRIMARY KEY DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    ALTER TABLE map_config
      ADD COLUMN IF NOT EXISTS sw_lat NUMERIC, ADD COLUMN IF NOT EXISTS sw_lng NUMERIC,
      ADD COLUMN IF NOT EXISTS ne_lat NUMERIC, ADD COLUMN IF NOT EXISTS ne_lng NUMERIC;
  `);

  // Seed the zoo layout only the first time (no version row yet), so an admin who deletes
  // every footprint later doesn't get them back on restart.
  const [meta] = await db.select({ id: mapLayoutMetaTable.id }).from(mapLayoutMetaTable).limit(1);
  if (meta) return;
  const [anyFeature] = await db.select({ id: mapFeaturesTable.id }).from(mapFeaturesTable).limit(1);
  if (!anyFeature) await seedZooLayout();
  await db.insert(mapLayoutMetaTable).values({ id: 1, version: 1 }).onConflictDoNothing();
  logger.info("Map layout tables created and seeded with the Manila Zoo layout");
}
