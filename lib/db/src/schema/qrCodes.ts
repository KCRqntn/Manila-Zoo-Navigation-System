import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { animalsTable } from "./animals";
import { mapPinsTable } from "./mapPins";

export const qrCodesTable = pgTable("qr_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  animalId: integer("animal_id").references(() => animalsTable.id, { onDelete: "cascade" }),
  // Location QR codes mark a place (restroom, gate, info desk…) instead of an animal; scanning one
  // tells the map exactly where the visitor is standing
  mapPinId: integer("map_pin_id").references(() => mapPinsTable.id, { onDelete: "cascade" }),
  qrImageUrl: text("qr_image_url"),
  scanCount: integer("scan_count").notNull().default(0),
  // Points a signed-in visitor earns for scanning this code with the in-app scanner (0 = none), and
  // whether they're given once ever (true) or once per visit day (false). Added by migration 2026-11-08-02.
  points: integer("points").notNull().default(0),
  pointsOnce: boolean("points_once").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export type QrCode = typeof qrCodesTable.$inferSelect;
export type InsertQrCode = typeof qrCodesTable.$inferInsert;
