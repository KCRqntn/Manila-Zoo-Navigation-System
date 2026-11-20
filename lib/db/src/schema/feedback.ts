import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { chatHistoryTable } from "./chatHistory";

export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  chatHistoryId: integer("chat_history_id").references(() => chatHistoryTable.id),
  rating: integer("rating"),
  comment: text("comment"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Feedback = typeof feedbackTable.$inferSelect;
export type InsertFeedback = typeof feedbackTable.$inferInsert;
