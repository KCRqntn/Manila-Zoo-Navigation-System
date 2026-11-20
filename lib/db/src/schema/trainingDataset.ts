import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const trainingDatasetTable = pgTable("training_dataset", {
  id: serial("id").primaryKey(),
  input: text("input").notNull(),
  output: text("output").notNull(),
  intent: text("intent"),
  language: text("language").notNull().default("en"),
  isValidated: boolean("is_validated").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TrainingDataset = typeof trainingDatasetTable.$inferSelect;
export type InsertTrainingDataset = typeof trainingDatasetTable.$inferInsert;
