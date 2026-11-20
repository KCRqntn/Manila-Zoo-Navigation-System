import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  animalsTable,
  mapPinsTable,
  mapFeaturesTable,
  mapPathsTable,
  mapConfigTable,
  mapLayoutMetaTable,
} from "@workspace/db";
import { ZOO_PINS, ZOO_FEATURES, ZOO_PATHS, ZOO_MAP_CONFIG, ANIMAL_LOCATIONS } from "../data/manilaZooLayout";
import { logger } from "./logger";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The original demo layout sat ~3 km east of the real zoo (in Makati) with made-up exhibits.
const PLACEHOLDER_CENTER = { lat: 14.5632, lng: 121.0167 };
const PLACEHOLDER_PINS = [
  "Main Entrance", "Reptile House", "Bird Sanctuary", "African Savanna", "Restroom A",
  "Restroom B", "Food Stall", "First Aid Station", "South Exit", "Aquatic Center",
];
const PLACEHOLDER_FEATURES = new Set(["Main Entrance", "Reptile House", "Bird Sanctuary", "Aquatic Center", "African Savanna"]);
const PLACEHOLDER_PATHS = new Set(["Main promenade", "Aviary loop", "Savanna walk", "South connector"]);

const PIN_COLORS: Record<string, string> = {
  animal: "#2D6A4F", building: "#6b7280", food_stall: "#FF9F1C", restroom: "#3D9BE9", entrance: "#7c3aed", exit: "#7c3aed", emergency: "#E63946",
};

/** Adds or updates the real zoo's pins by name and returns name → id for all pins. */
async function upsertPins(tx: Tx): Promise<Map<string, number>> {
  for (const p of ZOO_PINS) {
    const values = {
      pinType: p.pinType, lat: String(p.lat), lng: String(p.lng), description: p.description,
      color: PIN_COLORS[p.pinType] ?? "#2D6A4F", isActive: true,
    };
    await tx.insert(mapPinsTable).values({ name: p.name, ...values })
      .onConflictDoUpdate({ target: mapPinsTable.name, set: { ...values, updatedAt: new Date() } });
  }
  const pins = await tx.select({ id: mapPinsTable.id, name: mapPinsTable.name }).from(mapPinsTable);
  return new Map(pins.map(p => [p.name, p.id]));
}

async function assignAnimals(tx: Tx, pinIds: Map<string, number>): Promise<void> {
  for (const [animal, pin] of Object.entries(ANIMAL_LOCATIONS)) {
    await tx.update(animalsTable).set({ locationId: pinIds.get(pin) ?? null }).where(eq(animalsTable.name, animal));
  }
}

async function insertFeaturesAndPaths(tx: Tx, pinIds: Map<string, number>): Promise<void> {
  await tx.insert(mapFeaturesTable).values(ZOO_FEATURES.map(f => ({
    name: f.name,
    featureType: f.featureType,
    geometry: { type: "Polygon" as const, coordinates: f.coordinates },
    heightM: f.heightM,
    minHeightM: f.minHeightM,
    wallColor: f.wallColor,
    roofColor: f.roofColor,
    mapPinId: f.pin ? pinIds.get(f.pin) ?? null : null,
  })));
  await tx.insert(mapPathsTable).values(ZOO_PATHS.map(p => ({
    name: p.name,
    geometry: { type: "LineString" as const, coordinates: p.coordinates },
  })));
}

/**
 * Replaces the whole map with the real Manila Zoo layout: pins (matched by name), animal
 * locations, footprints, walkways and the map center. Removes the old placeholder pins.
 */
export async function importZooLayout(): Promise<{ pins: number; features: number; paths: number }> {
  await db.transaction(async tx => {
    const pinIds = await upsertPins(tx);
    await assignAnimals(tx, pinIds);

    // Retire the placeholder pins, unless one of them is a real pin name (e.g. "Main Entrance")
    const realNames = new Set(ZOO_PINS.map(p => p.name));
    const oldIds = PLACEHOLDER_PINS.filter(n => !realNames.has(n)).map(n => pinIds.get(n)).filter((id): id is number => id != null);
    if (oldIds.length > 0) {
      await tx.update(animalsTable).set({ locationId: null }).where(inArray(animalsTable.locationId, oldIds));
      await tx.delete(mapPinsTable).where(inArray(mapPinsTable.id, oldIds));
    }

    await tx.delete(mapFeaturesTable);
    await tx.delete(mapPathsTable);
    await insertFeaturesAndPaths(tx, pinIds);

    const config = {
      centerLat: String(ZOO_MAP_CONFIG.centerLat), centerLng: String(ZOO_MAP_CONFIG.centerLng), defaultZoom: ZOO_MAP_CONFIG.defaultZoom,
    };
    const [existing] = await tx.select({ id: mapConfigTable.id }).from(mapConfigTable).limit(1);
    if (existing) await tx.update(mapConfigTable).set({ ...config, updatedAt: new Date() }).where(eq(mapConfigTable.id, existing.id));
    else await tx.insert(mapConfigTable).values({ mapImageUrl: "", ...config });

    // Tell open visitor maps to reload
    await tx.insert(mapLayoutMetaTable).values({ id: 1, version: 1 }).onConflictDoUpdate({
      target: mapLayoutMetaTable.id,
      set: { version: sql`${mapLayoutMetaTable.version} + 1`, updatedAt: new Date() },
    });
  });
  return { pins: ZOO_PINS.length, features: ZOO_FEATURES.length, paths: ZOO_PATHS.length };
}

/** Seeds footprints and walkways into an empty layout (fresh installs). Pins must already exist. */
export async function seedZooLayout(): Promise<void> {
  await db.transaction(async tx => {
    const pins = await tx.select({ id: mapPinsTable.id, name: mapPinsTable.name }).from(mapPinsTable);
    await insertFeaturesAndPaths(tx, new Map(pins.map(p => [p.name, p.id])));
  });
}

/**
 * Databases created before the real layout existed still show the placeholder map in Makati.
 * Upgrade them on startup, but only while nothing has been customised: the map center is the
 * original seed and every footprint and walkway is one of the placeholders.
 */
export async function upgradePlaceholderLayout(): Promise<void> {
  const [config] = await db.select().from(mapConfigTable).limit(1);
  if (!config || Number(config.centerLat) !== PLACEHOLDER_CENTER.lat || Number(config.centerLng) !== PLACEHOLDER_CENTER.lng) return;

  const features = await db.select({ name: mapFeaturesTable.name }).from(mapFeaturesTable);
  const paths = await db.select({ name: mapPathsTable.name }).from(mapPathsTable);
  const untouched = features.every(f => PLACEHOLDER_FEATURES.has(f.name)) && paths.every(p => p.name != null && PLACEHOLDER_PATHS.has(p.name));
  if (!untouched) {
    logger.warn("Map is still centred on the placeholder location but has custom shapes; run `pnpm --filter @workspace/api-server run import-layout` to load the real zoo layout");
    return;
  }
  const result = await importZooLayout();
  logger.info(result, "Replaced the placeholder map with the real Manila Zoo layout");
}

/**
 * Places animals that have no location yet at their exhibit from ANIMAL_LOCATIONS (matched by
 * name), so they appear on the map and get chatbot directions. Never changes a location an admin
 * has set. Safe to run on every start.
 */
export async function assignMissingAnimalLocations(): Promise<void> {
  const pins = await db.select({ id: mapPinsTable.id, name: mapPinsTable.name }).from(mapPinsTable);
  const pinIds = new Map(pins.map(p => [p.name, p.id]));
  let placed = 0;
  for (const [animal, pin] of Object.entries(ANIMAL_LOCATIONS)) {
    const pinId = pinIds.get(pin);
    if (pinId == null) continue;
    const rows = await db.update(animalsTable).set({ locationId: pinId })
      .where(and(eq(animalsTable.name, animal), isNull(animalsTable.locationId)))
      .returning({ id: animalsTable.id });
    placed += rows.length;
  }
  if (placed > 0) logger.info({ placed }, "Placed animals without a location at their exhibits");
}
