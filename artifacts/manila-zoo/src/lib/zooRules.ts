import { Ban, Baby, Cigarette, Dog, Flower2, HeartHandshake, PartyPopper, Sprout, Trash2, UtensilsCrossed, type LucideIcon } from "lucide-react";

/**
 * Official visitor rules of Manila Zoo, set by the Public Recreations Bureau (PRB) of the City of
 * Manila. Keep in sync with the chatbot's copy in api-server/src/lib/zooRules.ts.
 */
export type ZooRule = { id: string; icon: LucideIcon; en: string; fil: string };

export const ZOO_RULES: ZooRule[] = [
  { id: "respect", icon: HeartHandshake, en: "Respect the animals", fil: "Igalang ang mga hayop" },
  { id: "feeding", icon: Ban, en: "Do not feed the animals", fil: "Bawal pakainin ang mga hayop" },
  { id: "smoking", icon: Cigarette, en: "No smoking", fil: "Bawal manigarilyo" },
  { id: "littering", icon: Trash2, en: "No littering", fil: "Bawal magkalat" },
  { id: "outside-food", icon: UtensilsCrossed, en: "No outside food and drinks allowed", fil: "Bawal magpasok ng pagkain at inumin mula sa labas" },
  { id: "pets", icon: Dog, en: "Pets are not allowed inside the zoo premises", fil: "Bawal ang mga alagang hayop sa loob ng zoo" },
  { id: "balloons-toys", icon: PartyPopper, en: "Balloons and all kinds of toys are not allowed inside", fil: "Bawal ang lobo at anumang uri ng laruan sa loob" },
  { id: "children", icon: Baby, en: "Children must be supervised at all times", fil: "Bantayan ang mga bata sa lahat ng oras" },
  { id: "flowers", icon: Flower2, en: "Do not pluck the flowers", fil: "Bawal pumitas ng bulaklak" },
  { id: "grass", icon: Sprout, en: "Do not step on the grass", fil: "Bawal tumapak sa damo" },
];

/** The zoo's official Terms and Conditions (from the Manila Zoo website). */
export const ZOO_TERMS: { en: string; fil: string }[] = [
  { en: "Reservation fees are paid in advance through e-payment channels.", fil: "Binabayaran nang maaga ang reservation sa pamamagitan ng e-payment." },
  { en: "Fully paid reservations are honored only on the scheduled date.", fil: "Tinatanggap lamang ang bayad na reservation sa nakatakdang petsa." },
  { en: "No cancellation, refund or change after payment, except when a natural calamity (typhoon, flood, earthquake) is declared in Manila. The cancelled slot can then be used within 7 days, or it is forfeited.", fil: "Walang cancellation, refund o pagpapalit pagkatapos magbayad, maliban kung may idineklarang kalamidad sa Maynila (bagyo, baha, lindol). Magagamit ang na-cancel na slot sa loob ng 7 araw, o hindi na ito magagamit." },
  { en: "Littering is prohibited; violators may be fined.", fil: "Bawal magkalat; maaaring pagmultahin ang lalabag." },
  { en: "Keep a safe distance from the viewing areas.", fil: "Panatilihin ang ligtas na distansya mula sa mga viewing area." },
  { en: "Teasing, annoying or stressing the animals on exhibit will be dealt with accordingly.", fil: "Aaksyunan ang panunukso, pang-iinis o pagdudulot ng stress sa mga hayop." },
  { en: "Only authorized personnel may enter restricted zones.", fil: "Ang mga awtorisadong tauhan lamang ang maaaring pumasok sa mga restricted zone." },
  { en: "Children in the playground must have a guardian present at all times.", fil: "Kailangang may kasamang tagapag-alaga ang mga bata sa palaruan sa lahat ng oras." },
  { en: "No smoking.", fil: "Bawal manigarilyo." },
  { en: "Eating is allowed only in designated areas; no outside refreshments except a personal tumbler.", fil: "Sa mga itinakdang lugar lamang pwedeng kumain; bawal ang inumin mula sa labas maliban sa sariling tumbler." },
  { en: "Sharp or pointed objects, loud music, alcoholic drinks and unruly behavior are not tolerated.", fil: "Hindi pinapayagan ang matutulis na bagay, malakas na tugtog, alak at magulong pag-uugali." },
  { en: "For concerns and assistance, email manilazoo@manila.gov.ph, message the Manila Zoo Official Facebook page, or go to the Info Desk (Revenue Collection Unit).", fil: "Para sa mga katanungan at tulong, mag-email sa manilazoo@manila.gov.ph, mag-message sa Facebook page na Manila Zoo Official, o pumunta sa Info Desk (Revenue Collection Unit)." },
];
