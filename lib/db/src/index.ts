import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// DATE columns stay as "YYYY-MM-DD" text: converting them to JavaScript dates at local midnight
// shifts them a day in UTC+8 (e.g. a ticket price's effective date)
pg.types.setTypeParser(1082, (value: string) => value);

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
