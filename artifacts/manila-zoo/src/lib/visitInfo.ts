/**
 * Official Manila Zoo operating hours and admission rates (rates updated September 14, 2023).
 * Keep in sync with the chatbot's copy in api-server/src/lib/visitInfo.ts.
 */
type Text = { en: string; fil: string };

export const HOURS: { days: Text; time: string }[] = [
  { days: { en: "Tuesdays – Sundays", fil: "Martes – Linggo" }, time: "9:00 AM – 8:00 PM" },
  { days: { en: "Holidays", fil: "Mga holiday" }, time: "9:00 AM – 8:00 PM" },
  { days: { en: "Mondays", fil: "Lunes" }, time: "11:00 AM – 8:00 PM" },
  { days: { en: "Holidays that fall on a Monday", fil: "Holiday na tumapat sa Lunes" }, time: "11:00 AM – 8:00 PM" },
];
export const LAST_ENTRY = "6:00 PM";

export const RATES_UPDATED: Text = { en: "Updated September 14, 2023", fil: "Na-update noong Setyembre 14, 2023" };

/** Rate per visitor type; `nonManila` is null when one price applies to everyone in the group. */
export const RATES: { who: Text; manila: string; nonManila: string | null; note?: Text }[] = [
  { who: { en: "Adults and children 3 years old and above", fil: "Matatanda at mga batang 3 taong gulang pataas" }, manila: "₱150", nonManila: "₱300" },
  { who: { en: "Students", fil: "Mga estudyante" }, manila: "₱100", nonManila: "₱200" },
  {
    who: { en: "Senior citizens and PWDs", fil: "Senior citizen at PWD" },
    note: { en: "20% discount", fil: "20% diskwento" },
    manila: "₱120", nonManila: "₱240",
  },
  {
    who: { en: "Children 2 years old and below", fil: "Mga batang 2 taong gulang pababa" },
    note: { en: "No registration needed", fil: "Hindi kailangang magparehistro" },
    manila: "Free", nonManila: null,
  },
  {
    who: { en: "Manila LGU employees and teachers under the Manila Division of City Schools", fil: "Mga empleyado ng Manila LGU at guro sa ilalim ng Manila Division of City Schools" },
    manila: "₱100", nonManila: null,
  },
];

export const SENIOR_WEDNESDAY: Text = {
  en: "Senior citizens of Manila with a valid OSCA ID visit free every Wednesday.",
  fil: "Libre ang mga senior citizen ng Maynila na may valid OSCA ID tuwing Miyerkules.",
};

export const ID_REMINDER = {
  lead: {
    en: "Discounted visitors must present a valid ID when entering Manila Zoo:",
    fil: "Ang mga may diskwentong bisita ay kinakailangang magpakita ng kanilang valid ID bago pumasok ng Manila Zoo:",
  },
  items: [
    { en: "Manila residents: a valid ID with a Manila address", fil: "Residente ng Maynila: valid ID na may address sa Maynila" },
    { en: "Non-Manila residents: a valid ID", fil: "Hindi residente ng Maynila: valid ID" },
  ],
  thanks: { en: "Thank you for your understanding and cooperation.", fil: "Salamat sa inyong pang-unawa at pakikiisa." },
};
