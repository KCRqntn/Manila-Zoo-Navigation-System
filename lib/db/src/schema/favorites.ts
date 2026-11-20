import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { animalsTable } from "./animals";

export const favoritesTable = pgTable("favorites", {
  id: serial("id").primaryKey(),
  animalId: integer("animal_id").notNull().references(() => animalsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique().on(t.animalId, t.userId)]);

export type Favorite = typeof favoritesTable.$inferSelect;
export type InsertFavorite = typeof favoritesTable.$inferInsert;
