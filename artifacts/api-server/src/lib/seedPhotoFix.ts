import { and, eq, inArray } from "drizzle-orm";
import { db, animalsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * The original seed data linked animal photos on Unsplash; several links were deleted or pointed
 * at unrelated photos (e.g. a rubber duck for the tortoise). The correct photos now ship with the
 * app in artifacts/manila-zoo/public/animals (credits in CREDITS.md there).
 *
 * This swaps a photo only while it is still the original seed link, so photos an admin has
 * changed are never touched. Safe to run on every start.
 */
const SEED_PHOTOS: Record<string, { local: string; seedUrls: string[] }> = {
  "African Lion": { local: "/animals/african-lion.jpg", seedUrls: ["https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=600"] },
  "Reticulated Python": { local: "/animals/reticulated-python.jpg", seedUrls: ["https://images.unsplash.com/photo-1531386151447-fd76ad50012f?w=600"] },
  "Philippine Eagle": { local: "/animals/philippine-eagle.jpg", seedUrls: ["https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=600"] },
  "Saltwater Crocodile": { local: "/animals/saltwater-crocodile.jpg", seedUrls: ["https://images.unsplash.com/photo-1611154172018-f89d4c0c6c4e?w=600"] },
  "Sun Bear": { local: "/animals/sun-bear.jpg", seedUrls: ["https://images.unsplash.com/photo-1564349683136-77e08dba1ef3?w=600"] },
  "Philippine Eagle Owl": { local: "/animals/philippine-eagle-owl.jpg", seedUrls: ["https://images.unsplash.com/photo-1543549049-9fbf7a866d53?w=600"] },
  "Asian Elephant": { local: "/animals/asian-elephant.jpg", seedUrls: ["https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?w=600"] },
  "Common Tree Monitor": { local: "/animals/common-tree-monitor.jpg", seedUrls: ["https://images.unsplash.com/photo-1557201501-2e2e98bcec8f?w=600"] },
  "Red-footed Tortoise": { local: "/animals/red-footed-tortoise.jpg", seedUrls: ["https://images.unsplash.com/photo-1559715541-5daf8a0296d0?w=600"] },
  "Philippine Cockatoo": { local: "/animals/philippine-cockatoo.jpg", seedUrls: ["https://images.unsplash.com/photo-1548767797-d8c844163c4a?w=600"] },
  "Brahminy Kite": { local: "/animals/brahminy-kite.jpg", seedUrls: ["https://images.unsplash.com/photo-1544984243-ec57ea16fe25?w=600"] },
};

export async function fixSeedAnimalPhotos(): Promise<void> {
  let fixed = 0;
  for (const [name, { local, seedUrls }] of Object.entries(SEED_PHOTOS)) {
    const rows = await db.update(animalsTable)
      .set({ imageUrl: local })
      .where(and(eq(animalsTable.name, name), inArray(animalsTable.imageUrl, seedUrls)))
      .returning({ id: animalsTable.id });
    fixed += rows.length;
  }
  if (fixed > 0) logger.info({ fixed }, "Replaced original seed animal photos with the bundled ones");
}
