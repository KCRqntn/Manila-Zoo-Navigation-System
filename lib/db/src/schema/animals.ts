import { pgTable, serial, text, numeric, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { categoriesTable } from "./categories";
import { mapPinsTable } from "./mapPins";

export const animalsTable = pgTable("animals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  scientificName: text("scientific_name"),
  commonName: text("common_name"),
  categoryId: integer("category_id").references(() => categoriesTable.id),
  kingdom: text("kingdom"),
  phylum: text("phylum"),
  class: text("class"),
  order: text("order"),
  family: text("family"),
  genus: text("genus"),
  species: text("species"),
  habitat: text("habitat"),
  diet: text("diet"),
  weightKg: numeric("weight_kg"),
  heightCm: numeric("height_cm"),
  lifespanYears: numeric("lifespan_years"),
  conservationStatus: text("conservation_status"),
  description: text("description"),
  interestingFacts: text("interesting_facts").array(),
  feedingSchedule: text("feeding_schedule"),
  imageUrl: text("image_url"),
  locationId: integer("location_id").references(() => mapPinsTable.id),
  isFeatured: boolean("is_featured").notNull().default(false),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export type Animal = typeof animalsTable.$inferSelect;
export type InsertAnimal = typeof animalsTable.$inferInsert;
