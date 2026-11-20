import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const faqTable = pgTable("faq", {
  id: serial("id").primaryKey(),
  question: text("question").notNull().unique(),
  answer: text("answer").notNull(),
  category: text("category"),
  language: text("language").notNull().default("en"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Faq = typeof faqTable.$inferSelect;
export type InsertFaq = typeof faqTable.$inferInsert;
