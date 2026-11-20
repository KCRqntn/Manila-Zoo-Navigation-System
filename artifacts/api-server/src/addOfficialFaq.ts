import { pool } from "@workspace/db";

/**
 * Adds FAQ entries from the official Manila Zoo website (About Us, Contact Us, Terms and
 * Conditions). Safe to run again: adds missing questions and updates the answers of existing ones.
 *
 *   npx tsx --env-file=../../.env ./src/addOfficialFaq.ts
 */
export const OFFICIAL_FAQ = [
  { question: "What is the history of Manila Zoo?", answer: "The Manila Zoological and Botanical Garden is the only public zoo in the City of Manila. It first opened on July 25, 1959, during the term of Manila Mayor Arsenio H. Lacson. It is run by the City of Manila's Public Recreations Bureau (PRB). According to the zoo, it is home to more than 550 animals of 13 mammal, 38 bird and 21 reptile species, cared for by professional veterinarians, and its botanical garden grows more than 10,000 plants.", category: "general", language: "en" },
  { question: "How can I contact Manila Zoo?", answer: "Email: manilazoo@manila.gov.ph\nFacebook: Manila Zoo Official, https://www.facebook.com/ManilaZooPH.OfficialPage\nAddress: M. Adriatico St., Malate, Manila 1004, Metro Manila\nMap: https://goo.gl/maps/Ly7am5fp9Q9RMDKp9\nInside the zoo, ask at the Info Desk (Revenue Collection Unit). For emergencies, call zoo security at +63 2 8525-7275.", category: "general", language: "en" },
  { question: "Can I cancel or get a refund for my reservation?", answer: "Reservation fees are paid in advance through e-payment channels, and fully paid reservations are honored only on the scheduled date. No cancellation, refund or change can be made after payment, except when a natural calamity (typhoon, flood or earthquake) is declared in Manila. The cancelled slot can then be used within 7 days from the cancellation; after that it is forfeited.", category: "tickets", language: "en" },
  { question: "Can I bring water or drinks?", answer: "Outside food and drinks are not allowed, except drinks in your own personal tumbler. Meals and drinks are sold at the Food Court and the Plaza Restaurant, and eating is only allowed in the designated dining areas.", category: "rules", language: "en" },
  { question: "Ano ang kasaysayan ng Manila Zoo?", answer: "Ang Manila Zoological and Botanical Garden ang nag-iisang pampublikong zoo sa Lungsod ng Maynila. Unang binuksan ito noong Hulyo 25, 1959, sa panahon ni Manila Mayor Arsenio H. Lacson, at pinamamahalaan ng Public Recreations Bureau (PRB) ng Lungsod ng Maynila. Ayon sa zoo, mahigit 550 hayop (13 uri ng mammal, 38 uri ng ibon at 21 uri ng reptilya) ang inaalagaan dito ng mga propesyonal na beterinaryo, at mahigit 10,000 halaman ang pinapalago sa botanical garden nito.", category: "general", language: "fil" },
  { question: "Paano makipag-ugnayan sa Manila Zoo?", answer: "Email: manilazoo@manila.gov.ph\nFacebook: Manila Zoo Official, https://www.facebook.com/ManilaZooPH.OfficialPage\nAddress: M. Adriatico St., Malate, Manila 1004, Metro Manila\nMapa: https://goo.gl/maps/Ly7am5fp9Q9RMDKp9\nSa loob ng zoo, magtanong sa Info Desk (Revenue Collection Unit). Para sa emergency, tumawag sa zoo security sa +63 2 8525-7275.", category: "general", language: "fil" },
];

if (process.argv[1]?.endsWith("addOfficialFaq.ts")) {
  for (const f of OFFICIAL_FAQ) {
    const { rowCount } = await pool.query("UPDATE faq SET answer = $2 WHERE question = $1", [f.question, f.answer]);
    if (!rowCount) {
      await pool.query(
        "INSERT INTO faq (question, answer, category, language, is_active) VALUES ($1, $2, $3, $4, TRUE)",
        [f.question, f.answer, f.category, f.language],
      );
    }
    console.log(rowCount ? "updated" : "added", "-", f.question);
  }
  await pool.end();
}
