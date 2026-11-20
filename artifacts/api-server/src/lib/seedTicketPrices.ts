import { pool } from "@workspace/db";

/**
 * First-run contents of the Ticket Prices dataset: the official admission rates from the Manila Zoo
 * website ("Rates (updated September 14, 2023)"), as supplied by the research team on 2026-10-19.
 * Runs only while the table is empty, so prices edited in the dashboard are never overwritten.
 */
const SOURCE = "Official Manila Zoo website, admission rates updated September 14, 2023 (copy supplied by the research team)";
const VERIFIED = "2026-10-19";
const EFFECTIVE = "2023-09-14";

const RATES: { category: string; visitor_type: string; price: number | null; is_free?: boolean; notes?: string }[] = [
  { category: "Adults and children 3 years old and above", visitor_type: "Manila resident", price: 150 },
  { category: "Adults and children 3 years old and above", visitor_type: "Non-Manila resident", price: 300 },
  { category: "Students", visitor_type: "Manila resident", price: 100, notes: "Valid ID required" },
  { category: "Students", visitor_type: "Non-Manila resident", price: 200, notes: "Valid ID required" },
  { category: "Senior citizens and PWDs (20% discount)", visitor_type: "Manila resident", price: 120, notes: "Valid ID required" },
  { category: "Senior citizens and PWDs (20% discount)", visitor_type: "Non-Manila resident", price: 240, notes: "Valid ID required" },
  { category: "Children 2 years old and below", visitor_type: "All visitors", price: null, is_free: true, notes: "Registration not required" },
  { category: "Manila LGU employees and teachers under the Manila Division of City Schools", visitor_type: "All visitors", price: 100, notes: "Valid ID required" },
  { category: "Senior citizens of Manila with a valid OSCA ID (Wednesdays)", visitor_type: "Manila resident", price: null, is_free: true, notes: "Free every Wednesday" },
];

export async function seedVerifiedTicketPrices(): Promise<void> {
  const { rows: [{ n }] } = await pool.query("SELECT count(*)::int AS n FROM ticket_prices");
  if (n > 0) return;
  for (const [i, r] of RATES.entries()) {
    await pool.query(
      `INSERT INTO ticket_prices (category, visitor_type, price, is_free, effective_date, status, is_verified, source_reference, verified_at, notes, sort_order, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, 'published', true, $6, $7, $8, $9, 'system (initial data)', 'system (initial data)')`,
      [r.category, r.visitor_type, r.price, r.is_free ?? false, EFFECTIVE, SOURCE, VERIFIED, r.notes ?? null, (i + 1) * 10]);
  }
}
