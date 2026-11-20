import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const chatHistoryTable = pgTable("chat_history", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  message: text("message").notNull(),
  intent: text("intent"),
  confidence: numeric("confidence"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ChatHistory = typeof chatHistoryTable.$inferSelect;
export type InsertChatHistory = typeof chatHistoryTable.$inferInsert;
