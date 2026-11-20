import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().unique(),
  content: text("content").notNull(),
  type: text("type").default("info"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  // Added by migration 2026-10-21-01 (see api-server/src/lib/migrations.ts)
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("published"),
  publishAt: timestamp("publish_at"),
  updatedAt: timestamp("updated_at"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Announcement = typeof announcementsTable.$inferSelect;
export type InsertAnnouncement = typeof announcementsTable.$inferInsert;
