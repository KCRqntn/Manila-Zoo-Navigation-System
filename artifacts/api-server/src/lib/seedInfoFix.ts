import { inArray } from "drizzle-orm";
import { db, faqTable, trainingDatasetTable } from "@workspace/db";
import { HOURS_ANSWER, TICKETS_ANSWER } from "./visitInfo";
import { logger } from "./logger";

/**
 * The original seed data had made-up hours (closed Mondays, 8 AM – 6 PM) and ticket prices
 * (PHP 50). This swaps in the official hours and rates, but only for answers that are still the
 * exact seed text, so answers an admin has written are never touched. Safe to run on every start.
 */
const OUTDATED: { old: string[]; now: string }[] = [
  {
    now: HOURS_ANSWER.en,
    old: [
      "Manila Zoo is open Tuesday to Sunday, 8:00 AM to 6:00 PM. Closed every Monday.",
      "Manila Zoo is open Tuesday to Sunday, 8:00 AM to 6:00 PM. We are closed every Monday.",
      "Manila Zoo is open Tuesday to Sunday, 8:00 AM to 6:00 PM. Closed on Mondays.",
    ],
  },
  {
    now: HOURS_ANSWER.fil,
    old: [
      "Bukas ang Manila Zoo mula Martes hanggang Linggo, 8:00 AM hanggang 6:00 PM. Sarado tuwing Lunes.",
      "Bukas ang Manila Zoo mula Martes hanggang Linggo, 8:00 AM hanggang 6:00 PM.",
    ],
  },
  {
    now: TICKETS_ANSWER.en,
    old: [
      "Adults: PHP 50, Children (3-11 years): PHP 30, Senior/PWD: PHP 25. Free for children 2 years and below.",
      "Adults: PHP 50, Children (3-11 years): PHP 30, Senior Citizens/PWD: PHP 25. Children 2 years and below enter free.",
      "Adults pay PHP 50, children PHP 30, and seniors/PWD PHP 25. Children 2 years and below are free.",
      "Adults pay PHP 50, children PHP 30, and seniors/PWD PHP 25.",
    ],
  },
  {
    now: TICKETS_ANSWER.fil,
    old: [
      "Adults: PHP 50, Bata (3-11 taon): PHP 30, Senior/PWD: PHP 25. Libre ang mga bata na 2 taon pababa.",
      "Adults: PHP 50, Bata (3-11 taong gulang): PHP 30, Senior/PWD: PHP 25. Libre ang mga bata na 2 taong gulang pababa.",
    ],
  },
];

export async function fixSeedVisitInfo(): Promise<void> {
  let faqs = 0, examples = 0;
  for (const { old, now } of OUTDATED) {
    faqs += (await db.update(faqTable).set({ answer: now }).where(inArray(faqTable.answer, old)).returning({ id: faqTable.id })).length;
    examples += (await db.update(trainingDatasetTable).set({ output: now }).where(inArray(trainingDatasetTable.output, old)).returning({ id: trainingDatasetTable.id })).length;
  }
  if (faqs + examples > 0) logger.info({ faqs, examples }, "Replaced seed hours and ticket prices with the official ones");
}
