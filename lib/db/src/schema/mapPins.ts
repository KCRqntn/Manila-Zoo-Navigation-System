import { pgTable, serial, text, numeric, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const mapPinsTable = pgTable("map_pins", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  pinType: text("pin_type").notNull().default("animal"),
  lat: numeric("lat").notNull(),
  lng: numeric("lng").notNull(),
  animalId: integer("animal_id"),
  description: text("description"),
  color: text("color").default("#2D6A4F"),
  icon: text("icon"),
  isActive: boolean("is_active").notNull().default(true),
  // Added by migration 2026-10-21-01: whether the name shows on the map, and a photo of the place
  showLabel: boolean("show_label").notNull().default(true),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export type MapPin = typeof mapPinsTable.$inferSelect;
export type InsertMapPin = typeof mapPinsTable.$inferInsert;
