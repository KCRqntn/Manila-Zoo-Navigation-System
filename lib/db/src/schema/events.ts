import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().unique(),
  description: text("description"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  location: text("location"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  // Added by migration 2026-10-21-01 (see api-server/src/lib/migrations.ts)
  status: text("status").notNull().default("published"),
  publishAt: timestamp("publish_at"),
  pinId: integer("pin_id"),
  updatedAt: timestamp("updated_at"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Event = typeof eventsTable.$inferSelect;
export type InsertEvent = typeof eventsTable.$inferInsert;
