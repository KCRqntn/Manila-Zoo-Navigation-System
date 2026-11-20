import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";

export const mapConfigTable = pgTable("map_config", {
  id: serial("id").primaryKey(),
  mapImageUrl: text("map_image_url").default(""),
  centerLat: numeric("center_lat").notNull().default("14.5632"),
  centerLng: numeric("center_lng").notNull().default("121.0167"),
  defaultZoom: integer("default_zoom").notNull().default(17),
  // Georeferenced corners of the floor-plan image overlay (map_image_url)
  swLat: numeric("sw_lat"),
  swLng: numeric("sw_lng"),
  neLat: numeric("ne_lat"),
  neLng: numeric("ne_lng"),
  updatedAt: timestamp("updated_at"),
});

export type MapConfig = typeof mapConfigTable.$inferSelect;
