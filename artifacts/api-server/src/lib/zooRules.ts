/**
 * Official visitor rules of Manila Zoo, set by the Public Recreations Bureau (PRB) of the City of
 * Manila, and the chatbot's answers to questions about them. Keep the rule list in sync with the
 * website's copy in manila-zoo/src/lib/zooRules.ts.
 */
type Rule = { rule: { en: string; fil: string }; ask?: RegExp; answer?: { en: string; fil: string } };

const RULES: Rule[] = [
  {
    rule: { en: "Respect the animals", fil: "Igalang ang mga hayop" },
    ask: /\btease|\bteasing\b|\b(tap|knock|bang)(ping)?\b.{0,15}\bglass\b|\bthrow\b.{0,20}\banimals?\b|\binisin\b|\bkatukin\b|\bbatuhin\b/i,
    answer: {
      en: "Please respect the animals. Teasing, annoying or anything that stresses the animals on exhibit is not allowed and will be dealt with by zoo staff. Keep a safe distance from the viewing areas.",
      fil: "Igalang ang mga hayop. Bawal ang panunukso, pang-iinis o anumang gawain na nagdudulot ng stress sa mga hayop; aaksyunan ito ng mga tauhan ng zoo. Panatilihin ang ligtas na distansya mula sa mga viewing area.",
    },
  },
  {
    rule: { en: "Do not feed the animals", fil: "Bawal pakainin ang mga hayop" },
    // "Can I feed…", not "when do they feed…" (that's an events question)
    ask: /\b(can|may|could)\s+(i|we|kids?|children)\s+feed\b|\bfeed(ing)?\s+(the\s+)?animals?\s+(allowed|ok)\b|\b(pwede|puwede|bawal)\b.{0,20}\bpakain/i,
    answer: {
      en: "No. Feeding the animals is not allowed. Their keepers give them a special diet, and outside food can make them sick.",
      fil: "Hindi po. Bawal pakainin ang mga hayop. May espesyal na pagkain sila mula sa kanilang mga tagapag-alaga, at maaari silang magkasakit sa pagkain mula sa labas.",
    },
  },
  {
    rule: { en: "No smoking", fil: "Bawal manigarilyo" },
    ask: /\bsmok|\bvap(e|ing)\b|\bcigarette|\byosi\b|sigarilyo|manigarilyo/i,
    answer: {
      en: "Smoking (including vaping) is not allowed anywhere inside Manila Zoo.",
      fil: "Bawal manigarilyo (kasama ang vape) kahit saan sa loob ng Manila Zoo.",
    },
  },
  {
    rule: { en: "No littering", fil: "Bawal magkalat" },
    ask: /\blitter|\btrash\b|\bgarbage\b|\bbasura\b|\bkalat\b|magkalat/i,
    answer: {
      en: "Please don't litter. Keep your trash with you until you find a trash bin. Violators may be fined.",
      fil: "Bawal magkalat. Itago muna ang basura hanggang makakita ng basurahan. Maaaring pagmultahin ang lalabag.",
    },
  },
  {
    rule: { en: "No outside food and drinks allowed", fil: "Bawal magpasok ng pagkain at inumin mula sa labas" },
    ask: /\btumbler\b|\bbaon\b|\boutside\s+(food|drinks?)\b|\b(bring|brought|carry)\b.{0,25}\b(food|drinks?|snacks?|water|lunch)\b|\b(magdala|dala|dalhin)\b.{0,25}\b(pagkain|inumin|tubig|kain|snacks?|food)\b/i,
    answer: {
      en: "Outside food and drinks are not allowed inside the zoo, except drinks in your own personal tumbler. You can buy meals and drinks at the Food Court and the Plaza Restaurant; eating is only allowed in the designated dining areas.",
      fil: "Bawal magpasok ng pagkain at inumin mula sa labas, maliban sa inumin sa sariling tumbler. May mabibilhan ng pagkain at inumin sa Food Court at sa Plaza Restaurant; sa mga itinakdang kainan lamang pwedeng kumain.",
    },
  },
  {
    rule: { en: "Pets are not allowed inside the zoo premises", fil: "Bawal ang mga alagang hayop sa loob ng zoo" },
    // Dogs and cats only when bringing them ("where are the big cats?" is about zoo animals)
    ask: /\bpets?\b|alagang\s+hayop|\b(bring|brought|take|dala|magdala|dalhin|isama)\b.{0,25}\b(dogs?|cats?|puppy|aso|pusa)\b/i,
    answer: {
      en: "Sorry, pets are not allowed inside the zoo premises, for the safety of your pet and the zoo animals.",
      fil: "Paumanhin, bawal ang mga alagang hayop sa loob ng zoo, para sa kaligtasan ng inyong alaga at ng mga hayop sa zoo.",
    },
  },
  {
    rule: { en: "Balloons and all kinds of toys are not allowed inside", fil: "Bawal ang lobo at anumang uri ng laruan sa loob" },
    ask: /\bballoons?\b|\btoys?\b|\blobo\b|\blaruan\b/i,
    answer: {
      en: "Balloons and all kinds of toys are not allowed inside the zoo. They can scare or hurt the animals if they fly or fall into an enclosure.",
      fil: "Bawal ang lobo at anumang uri ng laruan sa loob ng zoo. Maaari itong makatakot o makasakit sa mga hayop kapag lumipad o nahulog sa kulungan.",
    },
  },
  {
    rule: { en: "Children must be supervised at all times", fil: "Bantayan ang mga bata sa lahat ng oras" },
    ask: /\bsupervis|\bunattended\b|\b(kids?|children|child)\s+alone\b|\bbantay|\bmag-isa\b.{0,15}\bbata|\bbata\b.{0,15}\bmag-isa/i,
    answer: {
      en: "Children must be supervised by an adult at all times inside the zoo.",
      fil: "Kailangang bantayan ng isang nakatatanda ang mga bata sa lahat ng oras sa loob ng zoo.",
    },
  },
  {
    rule: { en: "Do not pluck the flowers", fil: "Bawal pumitas ng bulaklak" },
    ask: /\bflowers?\b|\bpluck|\bpick\b.{0,15}\bplants?\b|bulaklak|pumitas|pitas/i,
    answer: {
      en: "Please don't pluck the flowers. Manila Zoo is also a botanical garden, so the plants are part of the collection.",
      fil: "Bawal pumitas ng bulaklak. Botanical garden din ang Manila Zoo, kaya bahagi ng koleksyon ang mga halaman.",
    },
  },
  {
    rule: { en: "Do not step on the grass", fil: "Bawal tumapak sa damo" },
    ask: /\bgrass\b|\blawn\b|\bdamo\b|\btumapak\b/i,
    answer: {
      en: "Please don't step on the grass. Stay on the walkways.",
      fil: "Bawal tumapak sa damo. Manatili sa mga daanan.",
    },
  },
];

/**
 * Other official information from the Manila Zoo website: its Terms and Conditions, About Us and
 * Contact Us sections. Answered like the rules, but not listed among the ten posted rules.
 */
type Info = { ask: RegExp; skip?: RegExp; answer: { en: string; fil: string } };

const INFO: Info[] = [
  {
    // Reservations and refunds
    ask: /\brefund|\bcancel\w*\b.{0,25}\b(reservations?|bookings?|tickets?|slots?)\b|\breservations?\b|\breserve\b|\brebook|\breschedul|i-refund|\bmagpareserba|\bireserba/i,
    answer: {
      en: "Reservations must be paid in full in advance through e-payment channels, and are honored only on the scheduled date. Paid reservations can't be cancelled, refunded or changed, except when a natural calamity (typhoon, flood or earthquake) is declared in Manila. In that case you may use the cancelled slot within 7 days; after that it is forfeited.",
      fil: "Kailangang bayaran nang buo at maaga ang reservation sa pamamagitan ng e-payment, at sa nakatakdang petsa lamang ito tatanggapin. Hindi na maaaring i-cancel, i-refund o palitan ang bayad na reservation, maliban kung may idineklarang kalamidad sa Maynila (bagyo, baha o lindol). Sa ganoong kaso, magagamit ang na-cancel na slot sa loob ng 7 araw; pagkatapos nito ay hindi na ito magagamit.",
    },
  },
  {
    // Items and behavior the management won't tolerate
    ask: /\bknife|\bknives\b|\bsharp\b|\bpointed\b|\bspeakers?\b|\bloud\s+music\b|\balcohol|\bbeers?\b|\bliquor\b|\bwine\b|\bintoxicat|\bdrunk\b|\balak\b|\bkutsilyo\b|\bmatulis\b|\blasing\b|\bmalakas\b.{0,15}\btugtog/i,
    answer: {
      en: "Sharp and pointed objects, loud music, alcoholic drinks and unruly behavior are not allowed inside the zoo. Zoo personnel may act on any violation.",
      fil: "Bawal ang matutulis na bagay, malakas na tugtog, alak at magulong pag-uugali sa loob ng zoo. Maaaring umaksyon ang mga tauhan ng zoo sa anumang paglabag.",
    },
  },
  {
    ask: /\brestricted\b|\bstaff\s+only\b|\bbehind\s+the\s+scenes?\b|\bauthori[sz]ed\s+personnel\b|\bbawal\s+pumasok\b/i,
    answer: {
      en: "Only authorized personnel may enter restricted zones, for the safety of visitors.",
      fil: "Ang mga awtorisadong tauhan lamang ang maaaring pumasok sa mga restricted zone, para sa kaligtasan ng mga bisita.",
    },
  },
  {
    ask: /\bplayground\b|\bpalaruan\b/i,
    answer: {
      en: "Children may use the playground only with a guardian present, who should guide them on the proper use of the play equipment to avoid accidents.",
      fil: "Pwedeng gumamit ng palaruan ang mga bata kung may kasamang tagapag-alaga, na gagabay sa tamang paggamit ng mga laruan para maiwasan ang aksidente.",
    },
  },
  {
    // History. "When did the zoo open?" but not "when does it open?" (that's opening hours)
    ask: /\bhistory\b|\bkasaysayan\b|\bfounded\b|\bestablished\b|\bfirst\s+open|\bopened\s+in\b|\b(when|what\s+year)\b.{0,25}\b(opened|built|founded)\b|\bwho\s+(built|founded|started)\b|\bhow\s+old\b.{0,15}\bzoo\b|\b(itinayo|binuksan|naitatag|itinatag)\b|\bilang\s+taon\s+na\b.{0,15}\bzoo\b|\babout\s+(the\s+)?manila\s+zoo\b(?!\s+animals?)|\btungkol\s+sa\s+manila\s+zoo\b(?!\s+hayop)/i,
    answer: {
      en: "The Manila Zoological and Botanical Garden is the only public zoo in the City of Manila. It first opened on July 25, 1959, during the term of Manila Mayor Arsenio H. Lacson, and is run by the City of Manila's Public Recreations Bureau. According to the zoo, it is home to more than 550 animals (13 mammal, 38 bird and 21 reptile species) cared for by professional veterinarians, and its botanical garden grows more than 10,000 plants.",
      fil: "Ang Manila Zoological and Botanical Garden ang nag-iisang pampublikong zoo sa Lungsod ng Maynila. Unang binuksan ito noong Hulyo 25, 1959, sa panahon ni Manila Mayor Arsenio H. Lacson, at pinamamahalaan ng Public Recreations Bureau ng Lungsod ng Maynila. Ayon sa zoo, mahigit 550 hayop (13 uri ng mammal, 38 uri ng ibon at 21 uri ng reptilya) ang inaalagaan dito ng mga propesyonal na beterinaryo, at mahigit 10,000 halaman ang pinapalago sa botanical garden nito.",
    },
  },
  {
    // Contact details. Emergencies get the emergency answer (security hotline, first aid) instead.
    ask: /\bcontact\b|\be-?mail\b|\bfacebook\b|\bfb\s+page\b|\bsocial\s+media\b|\binquir|\bmakipag-?ugnayan\b|\bkontak\b/i,
    skip: /\bemergenc|\binjur|\bhurt\b|\blost\b|\bnawawala\b|\bnawala\b|\bsugat|\bsaklolo\b|\bnasaktan\b|\bsecurity\b/i,
    answer: {
      en: "You can reach Manila Zoo by email at manilazoo@manila.gov.ph or through its official Facebook page, Manila Zoo Official (https://www.facebook.com/ManilaZooPH.OfficialPage). Inside the zoo, ask at the Info Desk (Revenue Collection Unit). Address: M. Adriatico St., Malate, Manila 1004 (map: https://goo.gl/maps/Ly7am5fp9Q9RMDKp9). For emergencies, call zoo security at +63 2 8525-7275.",
      fil: "Maaaring makipag-ugnayan sa Manila Zoo sa email na manilazoo@manila.gov.ph o sa opisyal nitong Facebook page, Manila Zoo Official (https://www.facebook.com/ManilaZooPH.OfficialPage). Sa loob ng zoo, magtanong sa Info Desk (Revenue Collection Unit). Address: M. Adriatico St., Malate, Manila 1004 (mapa: https://goo.gl/maps/Ly7am5fp9Q9RMDKp9). Para sa emergency, tumawag sa zoo security sa +63 2 8525-7275.",
    },
  },
];

// "What are the rules?" / "Ano ang mga bawal?"
const ALL_RULES_Q = /\brules?\b|\bregulations?\b|\bguidelines?\b|\bpatakaran\b|\balituntunin\b|what('s| is| are)\s+(not\s+)?(allowed|prohibited|forbidden)|\b(ano|anong)\b.{0,12}\bbawal\b|\bmga\s+bawal\b/i;

function allRules(isFil: boolean): string {
  const header = isFil
    ? "Mga patakaran ng Manila Zoo (Public Recreations Bureau):"
    : "Manila Zoo rules (Public Recreations Bureau):";
  const footer = isFil
    ? "Sundin din ang mga nakapaskil na karatula sa loob ng zoo. Salamat sa pagbisita!"
    : "Please also follow all posted signs inside the zoo. Thank you for visiting!";
  return `${header}\n${RULES.map(r => `• ${isFil ? r.rule.fil : r.rule.en}`).join("\n")}\n${footer}`;
}

/** The chatbot's answer when a message asks about a zoo rule, or null if it doesn't. */
export function answerRuleQuestion(message: string, lang: string): string | null {
  const isFil = lang === "fil";
  const hits = RULES.filter(r => r.ask?.test(message) && r.answer);
  if (hits.length > 0) {
    const answers = hits.map(r => (isFil ? r.answer!.fil : r.answer!.en)).join("\n");
    return `${answers}\n${isFil ? "Tingnan ang lahat ng patakaran sa Help page (Rules tab)." : "See all zoo rules on the Help page (Rules tab)."}`;
  }
  const info = INFO.find(i => i.ask.test(message) && !i.skip?.test(message));
  if (info) return isFil ? info.answer.fil : info.answer.en;
  return ALL_RULES_Q.test(message) ? allRules(isFil) : null;
}
