import { pgTable, serial, text, numeric, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { mapPinsTable } from "./mapPins";

// GeoJSON geometries are stored as-is; coordinates are [lng, lat] per the GeoJSON spec.
export type PolygonGeometry = { type: "Polygon"; coordinates: number[][][] };
export type LineStringGeometry = { type: "LineString"; coordinates: number[][] };

// Enclosures/buildings drawn by the admin; rendered as 2.5D extrusions on the visitor map.
export const mapFeaturesTable = pgTable("map_features", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  featureType: text("feature_type").notNull().default("enclosure"),
  geometry: jsonb("geometry").$type<PolygonGeometry>().notNull(),
  heightM: numeric("height_m").notNull().default("0"),
  minHeightM: numeric("min_height_m").notNull().default("0"),
  wallColor: text("wall_color").default("#bfa98a"),
  roofColor: text("roof_color").default("#7a9a6e"),
  mapPinId: integer("map_pin_id").references(() => mapPinsTable.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// Walkways; closures and accessibility are flags so they can change without redrawing.
export const mapPathsTable = pgTable("map_paths", {
  id: serial("id").primaryKey(),
  name: text("name"),
  geometry: jsonb("geometry").$type<LineStringGeometry>().notNull(),
  isOpen: boolean("is_open").notNull().default(true),
  isAccessible: boolean("is_accessible").notNull().default(true),
  // Added by migration 2026-11-16-01: unpublished walkways are staff-only (and never routed along);
  // a "bridge" is drawn as a timber footbridge on the maps
  isActive: boolean("is_active").notNull().default(true),
  kind: text("kind").notNull().default("walkway"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// Single-row counter bumped on every map write; clients poll it to know when to reload.
export const mapLayoutMetaTable = pgTable("map_layout_meta", {
  id: integer("id").primaryKey().default(1),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MapFeature = typeof mapFeaturesTable.$inferSelect;
export type MapPath = typeof mapPathsTable.$inferSelect;
