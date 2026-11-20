/**
 * The AI Guide's offline mode.
 *
 * The fine-tuned mBERT model (about 680 MB) runs on the zoo server and is too large for a phone, so
 * without a connection the AI Guide answers here instead, from the zoo data already saved on the
 * phone (animals, map places, walkways, FAQs; see sw.js and "Save zoo for offline") using keyword
 * rules rather than the model. Walking directions use the server's own routing code
 * (api-server/src/lib/routing.ts), so they match the online answers.
 *
 * It answers: animal facts and where an animal is, where a place is and how to get there, the
 * nearest restroom / food / first aid / exit, opening hours, ticket prices, the list of animals,
 * and the saved FAQs. Anything else gets a reply saying what works offline. Nothing is sent or
 * logged; the conversation stays on the phone.
 */
import {
  getSearchAnimalsUrl,
  getListMapPinsUrl,
  getGetMapLayoutUrl,
  getSearchFaqsUrl,
} from "@workspace/api-client-react";
import { planRoute, routeRank, toPlace, type MapPath, type RoutePlace, type WalkingRoute } from "../../../api-server/src/lib/routing";
import { HOURS, LAST_ENTRY, RATES, RATES_UPDATED, SENIOR_WEDNESDAY } from "./visitInfo";
import { getRecentScannedAnimal, getVisitorLocation, isInsideZoo } from "./visitorLocation";

type Lang = "en" | "fil";

type Animal = {
  id: number; name: string; common_name?: string | null; scientific_name?: string | null;
  habitat?: string | null; diet?: string | null; lifespan_years?: string | number | null;
  weight_kg?: string | number | null; conservation_status?: string | null; feeding_schedule?: string | null;
  description?: string | null; interesting_facts?: string[] | null; location_id?: number | null;
};
type Pin = { id: number; name: string; pin_type: string; lat: string | number; lng: string | number; is_active?: boolean; animal_id?: number | null };
type LayoutPath = { name: string | null; is_open: boolean; is_accessible: boolean; is_active?: boolean; geometry: { coordinates: number[][] } };
type Faq = { question: string; answer: string; language: string };

export type OfflineReply = {
  reply: string;
  /** The place the answer is about, for the "Show on map" button */
  place?: { id: number; name: string } | null;
};

// ─── Saved data ──────────────────────────────────────────────────────────────

/** A saved API response: the service worker answers from its copy when offline; Cache Storage is the fallback. */
async function savedJson<T>(urls: string[]): Promise<T | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) return (await response.json()) as T;
    } catch {
      // No network and no service worker copy: look in Cache Storage directly
    }
    try {
      const saved = await caches.match(new URL(url, window.location.origin).href, { ignoreVary: true });
      if (saved) return (await saved.json()) as T;
    } catch {
      // Cache Storage unavailable (private mode)
    }
  }
  return null;
}

const ANIMAL_URLS = () => [getSearchAnimalsUrl({ limit: 500 }), getSearchAnimalsUrl({}), getSearchAnimalsUrl()];
const FAQ_URLS = (lang: Lang) => [getSearchFaqsUrl({ language: lang })];

/**
 * While online, fetches what offline mode needs so the service worker keeps a copy, even if the
 * visitor never pressed "Save zoo for offline". Best effort; failures are ignored.
 */
export function warmOfflineChat(): void {
  const urls = [...ANIMAL_URLS().slice(0, 1), getListMapPinsUrl(), getGetMapLayoutUrl(), ...FAQ_URLS("en"), ...FAQ_URLS("fil")];
  for (const url of urls) fetch(url).catch(() => {});
}

type ZooData = { animals: Animal[]; pins: Pin[]; paths: MapPath[]; faqs: Faq[] };

async function loadZooData(lang: Lang): Promise<ZooData> {
  const [animals, pins, layout, faqsLang, faqsOther] = await Promise.all([
    savedJson<Animal[]>(ANIMAL_URLS()),
    savedJson<Pin[]>([getListMapPinsUrl()]),
    savedJson<{ paths?: LayoutPath[] }>([getGetMapLayoutUrl()]),
    savedJson<Faq[]>(FAQ_URLS(lang)),
    savedJson<Faq[]>(FAQ_URLS(lang === "fil" ? "en" : "fil")),
  ]);
  return {
    animals: Array.isArray(animals) ? animals : [],
    pins: (Array.isArray(pins) ? pins : []).filter(p => p.is_active !== false),
    paths: (layout?.paths ?? []).map(p => ({ name: p.name, isOpen: p.is_open, isAccessible: p.is_accessible, isActive: p.is_active, geometry: p.geometry })),
    faqs: [...(Array.isArray(faqsLang) ? faqsLang : []), ...(Array.isArray(faqsOther) ? faqsOther : [])],
  };
}

// ─── Reading the question ────────────────────────────────────────────────────

// Same Filipino word test as the server (whole words, so "zoo" or "open" don't count)
const FIL_WORDS = /\b(saan|nasaan|ano|anong|sino|paano|bakit|kailan|kumusta|salamat|po|opo|hindi|oo|maganda|hayop|mahal|bukas|sarado|meron|walang|kung|magkano|ang|mga|ba)\b/i;

const normalize = (s: string) => ` ${s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim()} `;

const ALIASES: Record<string, string[]> = {
  monkey: ["macaque"], monkeys: ["macaque"], unggoy: ["macaque"], matsing: ["macaque"],
  lizard: ["monitor"], butiki: ["monitor"], parrot: ["cockatoo"], turtle: ["tortoise"],
  snake: ["python", "cobra"], ahas: ["python", "cobra"],
  tigre: ["tiger"], leon: ["lion"], buwaya: ["crocodile"], agila: ["eagle"], kuwago: ["owl"], sawa: ["python"],
  pagong: ["tortoise"], usa: ["deer"], bayawak: ["monitor"], kalaw: ["hornbill"], kalapati: ["pigeon"], kobra: ["cobra"],
  elepante: ["elephant"], ibon: ["bird"],
};
const STOP = new Set(("the and for are can you what where when how does did why who which tell about find see eat eats live zoo manila animal animals " +
  "please there get way show is it to of in at do i me my a an go going near nearest closest " +
  "ang mga ng sa saan nasaan ano anong paano bakit kailan yung iyong dito makikita hayop kinakain pagkain tungkol naman ba po ka pumunta papunta").split(" "));
const GENERIC_NAME = new Set(("water tree common red green blue white black brown long tailed crested spitting footed eared fruit imperial painted " +
  "ring double wattled indian african japanese burmese philippine celebes bengal albino area house building exhibit garden zoo main the and").split(" "));

const has = (text: string, re: RegExp) => re.test(text);
const WANTS_DIRECTIONS = /\b(how (do|can) i (get|go)|how to get|directions?|route|way to|paano (pumunta|makarating|magpunta)|papunta|daan papunta|dadaan)\b/;
const WANTS_LOCATION = /\b(where|saan|nasaan|nasa|locat\w*|find|makikita|hanapin)\b/;
const IS_THANKS = /\b(thank(s| you)?|salamat|bye|goodbye|paalam)\b/;
const IS_GREETING = /^\s*(hi|hello|hey|kumusta|kamusta|good (morning|afternoon|evening)|magandang (umaga|hapon|gabi|araw))\b/;
const IS_HOURS = /\b(hours?|open(ing)?|close[sd]?|closing|time|oras|bukas|sarado|schedule)\b/;
const IS_TICKETS = /\b(tickets?|tiket|prices?|presyo|magkano|bayad|fees?|admission|rates?|entrance fee|how much)\b/;
const IS_LIST = /\b(what animals|which animals|list of (the )?animals|all (the )?animals|anong mga hayop|ano ang mga hayop|lahat ng hayop|mga hayop (dito|sa zoo))\b/;

const FACILITIES: { re: RegExp; type: string; label: { en: string; fil: string } }[] = [
  { re: /\b(restrooms?|toilets?|cr|c r|comfort rooms?|banyo|palikuran|washroom)\b/, type: "restroom", label: { en: "restroom", fil: "CR" } },
  { re: /\b(food|eat|restaurant|canteen|snacks?|drinks?|kain|kakain|pagkain|kainan|inumin|merienda|food court)\b/, type: "food_stall", label: { en: "place to eat", fil: "kainan" } },
  { re: /\b(first aid|clinic|nurse|doctor|medical|injur\w*|hospital|klinika|nasugatan|emergency)\b/, type: "emergency", label: { en: "first aid station", fil: "first aid" } },
  { re: /\b(exit|gate|entrance|labasan|pasukan|lalabas)\b/, type: "entrance", label: { en: "exit", fil: "labasan" } },
];

const wordsOf = (text: string) => text.trim().split(" ").filter(w => w.length >= 3 && !STOP.has(w));
const singular = (w: string) => w.replace(/ies$/, "y").replace(/(s|es)$/, "");

function findAnimals(text: string, animals: Animal[]): Animal[] {
  const asked = new Set(wordsOf(text).flatMap(w => [w, singular(w), ...(ALIASES[w] ?? [])]));
  if (asked.size === 0) return [];
  const scored = animals.map(a => {
    const nameWords = normalize(`${a.name} ${a.common_name ?? ""}`).trim().split(" ").filter(Boolean);
    const specific = nameWords.filter(w => !GENERIC_NAME.has(w) && w.length >= 3);
    const hits = specific.filter(w => asked.has(w) || asked.has(singular(w))).length;
    const extra = nameWords.filter(w => GENERIC_NAME.has(w) && asked.has(w)).length;
    return { a, score: hits > 0 ? hits * 2 + extra : 0 };
  }).filter(s => s.score > 0);
  const best = Math.max(0, ...scored.map(s => s.score));
  return scored.filter(s => s.score === best).map(s => s.a).slice(0, 6);
}

function findPin(text: string, pins: Pin[]): Pin | null {
  const words = wordsOf(text);
  let best: { p: Pin; score: number } | null = null;
  for (const p of pins) {
    const tokens = normalize(p.name).trim().split(" ").filter(t => t.length >= 4 && !GENERIC_NAME.has(t));
    const score = tokens.filter(t => words.some(w => w === t || (w.length >= 4 && (t.startsWith(w) || w.startsWith(t))))).length;
    if (score > 0 && (!best || score > best.score)) best = { p, score };
  }
  return best?.p ?? null;
}

// ─── Answers ─────────────────────────────────────────────────────────────────

const T = (lang: Lang, en: string, fil: string) => (lang === "fil" ? fil : en);

function hoursAnswer(lang: Lang): string {
  return T(lang, "Manila Zoo opening hours:\n", "Oras ng Manila Zoo:\n") +
    HOURS.map(h => `• ${h.days[lang]}: ${h.time}`).join("\n") +
    T(lang, `\nLast entry of visitors is at ${LAST_ENTRY}.`, `\nAng huling pagpasok ng mga bisita ay ${LAST_ENTRY}.`);
}

function ticketsAnswer(lang: Lang): string {
  const free = T(lang, "Free", "Libre");
  const lines = RATES.map(r => {
    const price = r.nonManila ? `${r.manila} / ${r.nonManila}` : r.manila === "Free" ? free : r.manila;
    return `• ${r.who[lang]}${r.note ? ` (${r.note[lang]})` : ""}: ${price}`;
  });
  return T(lang, `Admission rates, Manila residents / non-Manila residents (${RATES_UPDATED.en}):\n`,
    `Presyo ng pagpasok, residente ng Maynila / hindi residente ng Maynila (${RATES_UPDATED.fil}):\n`) +
    lines.join("\n") + `\n${SENIOR_WEDNESDAY[lang]}`;
}

function formatRoute(route: WalkingRoute, lang: Lang): string {
  if (!route.on_paths) return route.steps.join(" ");
  const header = T(lang,
    `Here's how to get to ${route.to_name} from ${route.from_name} (about ${route.distance_m} m, ${route.walk_minutes}-minute walk):`,
    `Ganito pumunta sa ${route.to_name} mula sa ${route.from_name} (mga ${route.distance_m} metro, ${route.walk_minutes} minutong lakad):`);
  return `${header}\n${route.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
}

/** Where directions start: the visitor's position, else the exhibit scanned last, else the Main Entrance (said so). */
function routeStart(data: ZooData, lang: Lang): { start: RoutePlace; fromEntrance: boolean } | null {
  const here = getVisitorLocation();
  if (here && isInsideZoo(here)) return { start: { id: -1, name: T(lang, "your location", "iyong lokasyon"), lat: here.lat, lng: here.lng }, fromEntrance: false };
  const scanned = getRecentScannedAnimal();
  const scannedPin = scanned != null ? data.pins.find(p => p.id === data.animals.find(a => a.id === scanned)?.location_id) : undefined;
  if (scannedPin) return { start: toPlace({ ...scannedPin, lat: String(scannedPin.lat), lng: String(scannedPin.lng) }), fromEntrance: false };
  const gates = data.pins.filter(p => p.pin_type === "entrance");
  const main = gates.find(p => /main/i.test(p.name)) ?? gates[0];
  return main ? { start: toPlace({ ...main, lat: String(main.lat), lng: String(main.lng) }), fromEntrance: true } : null;
}

function directionsTo(dest: Pin, data: ZooData, lang: Lang): string {
  const from = routeStart(data, lang);
  if (!from || data.paths.length === 0) {
    return T(lang, `${dest.name} is marked on the map. (Walking directions need the saved map; open the Map once while online.)`,
      `Nakamarka sa mapa ang ${dest.name}. (Kailangan ng naka-save na mapa para sa direksyon; buksan ang Mapa habang may koneksyon.)`);
  }
  const route = planRoute(from.start, toPlace({ ...dest, lat: String(dest.lat), lng: String(dest.lng) }), data.paths, { lang });
  let text = formatRoute(route, lang);
  if (from.fromEntrance) text += T(lang,
    "\n(These start at the Main Entrance because I don't know where you are. Tap \"My location\" on the Map or scan a QR code for directions from where you're standing.)",
    "\n(Mula ito sa Main Entrance dahil hindi ko alam kung nasaan ka. Pindutin ang \"Aking lokasyon\" sa Mapa o mag-scan ng QR code para sa direksyon mula sa kinaroroonan mo.)");
  return text;
}

function nearestFacility(kind: (typeof FACILITIES)[number], data: ZooData, lang: Lang): OfflineReply {
  const places = data.pins.filter(p => p.pin_type === kind.type);
  if (places.length === 0) return { reply: T(lang, `I don't have a saved ${kind.label.en} on this phone's map.`, `Walang naka-save na ${kind.label.fil} sa mapa ng phone na ito.`) };
  const here = getVisitorLocation();
  const emergency = kind.type === "emergency"
    ? T(lang, "For emergencies, contact zoo security at +63 2 8525-7275, or ask the nearest zoo staff member.\n\n",
      "Para sa emergency, makipag-ugnayan agad sa zoo security sa +63 2 8525-7275, o lumapit sa pinakamalapit na tauhan ng zoo.\n\n")
    : "";
  if (!here || !isInsideZoo(here) || data.paths.length === 0) {
    return {
      reply: emergency + T(lang, `${kind.label.en[0]!.toUpperCase()}${kind.label.en.slice(1)}s: ${places.map(p => p.name).join(", ")}.`,
        `Mga ${kind.label.fil}: ${places.map(p => p.name).join(", ")}.`) +
        T(lang, "\nTap \"My location\" on the Map or scan a QR code, then ask again to find the nearest one.",
          "\nPindutin ang \"Aking lokasyon\" sa Mapa o mag-scan ng QR code, saka itanong ulit para malaman ang pinakamalapit."),
    };
  }
  const start: RoutePlace = { id: -1, name: T(lang, "your location", "iyong lokasyon"), lat: here.lat, lng: here.lng };
  const ranked = places
    .map(p => ({ p, r: planRoute(start, toPlace({ ...p, lat: String(p.lat), lng: String(p.lng) }), data.paths, { lang }) }))
    .sort((a, b) => routeRank(a.r) - routeRank(b.r));
  const best = ranked[0]!;
  return { reply: emergency + formatRoute(best.r, lang), place: { id: best.p.id, name: best.p.name } };
}

function animalFacts(text: string, a: Animal, data: ZooData, lang: Lang): OfflineReply {
  const pin = data.pins.find(p => p.id === a.location_id);
  const at = pin ? T(lang, ` You can see it at ${pin.name}.`, ` Makikita ito sa ${pin.name}.`) : "";
  const asks = (re: RegExp) => re.test(text);
  const parts: string[] = [];
  if (asks(/\b(diet|eat|eats|food|kain|kumakain|kinakain|pagkain)\b/) && a.diet) parts.push(T(lang, `Diet: ${a.diet}.`, `Kinakain: ${a.diet}.`));
  if (asks(/\b(habitat|live|lives|home|tirahan|nakatira)\b/) && a.habitat) parts.push(T(lang, `Habitat: ${a.habitat}.`, `Tirahan: ${a.habitat}.`));
  if (asks(/\b(lifespan|old|age|years|live long|ilang taon|tagal)\b/) && a.lifespan_years) parts.push(T(lang, `Lifespan: about ${a.lifespan_years} years.`, `Haba ng buhay: mga ${a.lifespan_years} taon.`));
  if (asks(/\b(endangered|status|conservation|extinct|nanganganib|vulnerable)\b/) && a.conservation_status) parts.push(T(lang, `Conservation status: ${a.conservation_status}.`, `Katayuan sa konserbasyon: ${a.conservation_status}.`));
  if (asks(/\b(feeding|fed|feed|pakain|pagpapakain)\b/) && a.feeding_schedule) parts.push(T(lang, `Feeding schedule: ${a.feeding_schedule}.`, `Oras ng pagpapakain: ${a.feeding_schedule}.`));
  if (asks(/\b(scientific|siyentipiko)\b/) && a.scientific_name) parts.push(T(lang, `Scientific name: ${a.scientific_name}.`, `Siyentipikong pangalan: ${a.scientific_name}.`));
  if (asks(/\b(weight|heavy|weigh|bigat)\b/) && a.weight_kg) parts.push(T(lang, `Weight: about ${a.weight_kg} kg.`, `Bigat: mga ${a.weight_kg} kg.`));
  if (parts.length === 0) {
    const fact = a.interesting_facts?.[0];
    parts.push(`${a.description ?? a.name}${fact ? ` ${fact}.` : ""}`);
  }
  return { reply: `${a.name}: ${parts.join(" ")}${at}`, place: pin ? { id: pin.id, name: pin.name } : null };
}

// Words most FAQ questions share ("Can I bring…", "Are … allowed?"), so they don't decide the match
const FAQ_COMMON = new Set(("bring allowed allow available have has get there can are is puwede pwede bawal meron may magdala dalhin").split(" "));
// Filipino words for what the FAQs ask about, so a Filipino question finds an English-only FAQ
const FAQ_SYNONYMS: Record<string, string> = {
  alaga: "pet", alagang: "pet", aso: "pet", pusa: "pet", tubig: "water", inumin: "drink", paradahan: "parking",
  kasaysayan: "history", tawagan: "contact", makipag: "contact", silya: "wheelchair", bayad: "fee",
};
const faqWords = (text: string) =>
  new Set(wordsOf(text).map(w => FAQ_SYNONYMS[w] ?? singular(w)).filter(w => w.length >= 3 && !FAQ_COMMON.has(w)));

function findFaq(text: string, faqs: Faq[], lang: Lang): string | null {
  const asked = faqWords(text);
  let best: { f: Faq; score: number; shared: number } | null = null;
  for (const f of faqs) {
    const shared = [...faqWords(normalize(f.question))].filter(w => asked.has(w)).length;
    const score = shared * 2 + (f.language === lang ? 1 : 0);
    if (shared > 0 && (!best || score > best.score)) best = { f, score, shared };
  }
  return best && (best.shared >= 2 || asked.size <= 2) ? best.f.answer : null;
}

const WHAT_WORKS = {
  en: "I'm in offline mode, so I can only answer from the zoo information saved on this phone. Try: \"Where is the lion?\", \"How do I get to the Aviary?\", \"Where is the nearest restroom?\", \"What time does the zoo open?\" or \"How much are the tickets?\". Connect to the internet for the full AI Guide.",
  fil: "Nasa offline mode ako, kaya ang naka-save na impormasyon lang sa phone na ito ang masasagot ko. Subukan: \"Saan ang leon?\", \"Paano pumunta sa Aviary?\", \"Saan ang pinakamalapit na CR?\", \"Anong oras bukas ang zoo?\" o \"Magkano ang tiket?\". Kumonekta sa internet para sa buong AI Guide.",
};

/** Answers one question without a connection, in the question's language (else the app's). */
export async function answerOffline(question: string, appLanguage: string): Promise<OfflineReply> {
  const lang: Lang = FIL_WORDS.test(question) ? "fil" : appLanguage === "fil" ? "fil" : "en";
  const text = normalize(question);
  const data = await loadZooData(lang);

  if (data.animals.length === 0 && data.pins.length === 0) {
    return { reply: T(lang,
      "I'm offline and no zoo information is saved on this phone yet. When you're back online, open the Map and tap \"Save zoo for offline\" so I can answer without signal.",
      "Offline ako at wala pang naka-save na impormasyon ng zoo sa phone na ito. Kapag may koneksyon na, buksan ang Mapa at pindutin ang \"I-save para sa offline\" para makasagot ako kahit walang signal.") };
  }
  if (has(text, IS_THANKS)) return { reply: T(lang, "You're welcome! Enjoy your visit to Manila Zoo.", "Walang anuman! Masiyahan sa pagbisita sa Manila Zoo.") };
  if (has(text, IS_GREETING) && wordsOf(text).length <= 2) return { reply: `${T(lang, "Hello! I'm ZooBot.", "Kumusta! Ako si ZooBot.")} ${WHAT_WORKS[lang]}` };

  const directions = has(text, WANTS_DIRECTIONS);
  const location = directions || has(text, WANTS_LOCATION);
  const animals = findAnimals(text, data.animals);
  const pin = findPin(text, data.pins);

  // A named animal or place comes first ("where is the lion", "how do I get to the Aviary")
  if (animals.length > 1 && !location) {
    return { reply: T(lang, `Which one do you mean: ${animals.map(a => a.name).join(", ")}?`, `Alin ang tinutukoy mo: ${animals.map(a => a.name).join(", ")}?`) };
  }
  if (animals.length > 0) {
    const a = animals[0]!;
    if (location) {
      const homes = animals.map(x => ({ x, p: data.pins.find(p => p.id === x.location_id) })).filter(h => h.p);
      if (homes.length === 0) return { reply: T(lang, `${a.name} has no exhibit marked on the saved map.`, `Walang exhibit na nakamarka para sa ${a.name} sa naka-save na mapa.`) };
      const first = homes[0]!.p!;
      if (directions) return { reply: directionsTo(first, data, lang), place: { id: first.id, name: first.name } };
      const where = homes.map(h => T(lang, `The ${h.x.name} is at ${h.p!.name}.`, `Ang ${h.x.name} ay nasa ${h.p!.name}.`)).join(" ");
      return { reply: where + T(lang, " Ask \"How do I get there?\" with the exhibit's name for walking directions.", " Itanong ang \"Paano pumunta sa\" kasama ang pangalan ng exhibit para sa direksyon."), place: { id: first.id, name: first.name } };
    }
    return animalFacts(text, a, data, lang);
  }
  // Nearest facilities before named places, so "nearest restroom" isn't read as the Food Court restroom
  const facility = FACILITIES.find(f => has(text, f.re));
  if (facility && (location || /\b(nearest|closest|pinakamalapit|malapit)\b/.test(text) || wordsOf(text).length <= 2)) return nearestFacility(facility, data, lang);
  if (pin && location) {
    if (directions) return { reply: directionsTo(pin, data, lang), place: { id: pin.id, name: pin.name } };
    return { reply: T(lang, `${pin.name} is marked on the Manila Zoo map. Ask "How do I get to ${pin.name}?" for walking directions.`,
      `Nakamarka sa mapa ng Manila Zoo ang ${pin.name}. Itanong ang "Paano pumunta sa ${pin.name}?" para sa direksyon.`), place: { id: pin.id, name: pin.name } };
  }
  if (has(text, IS_TICKETS)) return { reply: ticketsAnswer(lang) };
  if (has(text, IS_HOURS)) return { reply: hoursAnswer(lang) };
  if (has(text, IS_LIST)) {
    const names = [...data.animals].sort((x, y) => x.name.localeCompare(y.name)).map(a => `• ${a.name}`).join("\n");
    return { reply: T(lang, `Here are the ${data.animals.length} animals saved on this phone:\n`, `Narito ang ${data.animals.length} hayop na naka-save sa phone na ito:\n`) + names };
  }
  if (facility) return nearestFacility(facility, data, lang);
  const faq = findFaq(text, data.faqs, lang);
  if (faq) return { reply: faq };
  return { reply: WHAT_WORKS[lang] };
}
