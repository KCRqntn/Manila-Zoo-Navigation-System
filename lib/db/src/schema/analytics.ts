import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { animalsTable } from "./animals";
import { qrCodesTable } from "./qrCodes";

export const analyticsTable = pgTable("analytics", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  // Statistics outlive the animal or QR code they mention (migration 2026-11-15-01)
  animalId: integer("animal_id").references(() => animalsTable.id, { onDelete: "set null" }),
  qrCodeId: integer("qr_code_id").references(() => qrCodesTable.id, { onDelete: "set null" }),
  sessionId: text("session_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Analytics = typeof analyticsTable.$inferSelect;
export type InsertAnalytics = typeof analyticsTable.$inferInsert;
