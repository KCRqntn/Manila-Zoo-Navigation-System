import type { animalsTable } from "@workspace/db";

/**
 * Answers about one animal that contain only what was asked.
 *
 * The fine-tuned BERT model decides the topic of a message ("animal_info", "animal_location",
 * "navigation", …); within animal_info it can't tell "what does the lion eat?" from "where does the
 * lion live?". This second step reads which detail the visitor wants (the "aspect") and answers from
 * that database field alone. A field the database doesn't have is reported as missing, never
 * filled in.
 */
export type Animal = typeof animalsTable.$inferSelect;

export type Aspect =
  | "scientific" | "habitat" | "diet" | "feeding" | "fact" | "status" | "appearance"
  | "weight" | "height" | "lifespan" | "classification" | "location" | "overview";

// Checked in this order; a message can ask for several ("what does it eat and where does it live?")
const ASPECTS: [Aspect, RegExp][] = [
  ["scientific", /scientific|siyentipiko|latin\s+name/i],
  // Feeding times before diet: "when are the lions fed?" is a schedule question
  ["feeding", /\bfeed(ing)?\b|\bfed\b|pakain|oras ng pagkain|meal\s*time/i],
  ["diet", /\beats?\b|\beating\b|\bdiet\b|\bfood\b|\bkain(in)?\b|kumakain|kinakain|pagkain|\bprey\b|\bherbivore|\bcarnivore|\bomnivore/i],
  ["habitat", /habitat|\blives?\b|\bliving\b|native to|natural home|in the wild|come from|comes from|tirahan|nakatira|naninirahan|galing saan|saan galing/i],
  ["fact", /\bfacts?\b|\bfun\b|interesting|trivia|did you know|alam mo ba|kawili-wili|kakaiba/i],
  ["status", /conservation|endangered|extinct|threatened|\bstatus\b|\biucn\b|nanganganib|vulnerable/i],
  ["weight", /\bweigh(s|t)?\b|how heavy|\bkg\b|\bkilos?\b|\bbigat\b|timbang/i],
  ["height", /how tall|\btall\b|\bheight\b|\blength\b|how long is|how big|\bsize\b|\b(ma)?taas\b|\b(ma)?haba\b|\b(ma)?laki\b/i],
  ["lifespan", /lifespan|life span|how long (do|does|can) .*\blive|how old|live for|years? old|ilang taon|tagal ng buhay|nabubuhay/i],
  ["classification", /\bfamily\b|\bgenus\b|\border\b|\bclass\b|\bphylum\b|\bkingdom\b|\bspecies\b|taxonom|classif|\bpamilya\b|\buri\b/i],
  ["appearance", /\blooks?\s+like\b|\bhow\s+(does|do)\b.*\blook\b|\bappearance\b|\bdescribe\b.*\b(look|body)\b|\bcolou?rs?\b|\bitsura\b|\bhitsura\b|\banyo\b|\bkulay\b|\bphysical\b/i],
  // Where the animal is IN THE ZOO (its exhibit); "where does it live in the wild" is habitat
  ["location", /\bexhibit\b|enclosure|\bcage\b|kulungan|which (area|section|part)|anong (area|exhibit|kulungan)|\bwhere\b|\bfind\b|\blocat(ed|ion)\b|\b(na)?saan\b|\bnasan\b|\bsan\b|makikita|\b(want|wanna|like|going)\s+to\s+see\b|\bcan\s+(i|we)\s+see\b|\bgustong?\s+(ko\s+|naming\s+)?(makita|tingnan)\b|\b(do\s+you|does\s+the\s+zoo)\s+have\b|\b(is|are)\s+there\b|\bmay\b.*\bba\b|\bmeron\b|\bmayroon\b/i],
];

// Words that make a "where" question about the natural home, not the zoo exhibit
const NATURAL_HOME = /\b(live|lives|living|come from|comes from|native|in the wild|habitat|nakatira|naninirahan|galing|tirahan)\b/i;

/** The details a message asks about; "overview" when it just names the animal ("tell me about the lion"). */
export function detectAspects(message: string): Aspect[] {
  // In the order the visitor asked them
  let found = ASPECTS.map(([a, re]) => ({ a, at: message.search(re) })).filter(x => x.at >= 0).sort((x, y) => x.at - y.at).map(x => x.a);
  // "How long do lions live?" is lifespan, not habitat
  if (found.includes("lifespan")) found = found.filter(a => a !== "habitat");
  // "Where do zebras live?" / "Where does the lion come from?" ask for the habitat only
  if (found.includes("location") && NATURAL_HOME.test(message) && !/\b(zoo|here|dito)\b/i.test(message)) {
    found = found.filter(a => a !== "location");
    if (!found.includes("habitat")) found.push("habitat");
  }
  return found.length ? found : ["overview"];
}

/** Whether the message asks for a specific detail (not just naming an animal) */
export const asksForDetail = (message: string) => !detectAspects(message).includes("overview");

/** The reply whenever the database doesn't have what was asked; nothing is ever filled in instead. */
export const MISSING = {
  en: "Sorry, that information is not currently available in the Manila Zoo database.",
  fil: "Paumanhin, ang impormasyong iyan ay kasalukuyang wala sa database ng Manila Zoo.",
};

const lowerFirst = (s: string) => {
  // Keep a proper noun at the start ("The Sahara region…" stays capitalised after "the")
  const [rawFirst, second] = s.split(/\s+/);
  const first = rawFirst?.replace(/[^\p{L}]+$/u, "");
  if (first && /^[A-Z][a-z]+$/.test(first) && !(first === "The" && second && /^[A-Z]/.test(second))) return s[0]!.toLowerCase() + s.slice(1);
  return first === "The" ? "the" + s.slice(3) : s;
};
const stripDot = (s: string) => s.trim().replace(/[.\s]+$/, "");
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const fmt = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 1 });

function dietSentence(a: Animal, fil: boolean): string | null {
  if (!a.diet) return null;
  const diet = stripDot(a.diet);
  if (fil) return `Ang pagkain ng ${a.name}: ${diet}.`;
  const m = diet.match(/^(mainly |mostly )?(carnivore|herbivore|omnivore)\b:?\s*(.*)$/i);
  if (!m) return `The ${a.name} eats ${lowerFirst(diet)}.`;
  const kind = m[2]!.toLowerCase();
  const article = kind === "omnivore" ? "an" : "a";
  const qualifier = m[1] ? m[1].trim().toLowerCase() + " " : "";
  const rest = m[3]?.trim();
  const first = `The ${a.name} is ${qualifier}${article} ${kind}`;
  if (!rest) return `${first}.`;
  return /^feeds\b/i.test(rest) ? `${first}; it ${lowerFirst(rest)}.` : `${first}. It eats ${lowerFirst(rest)}.`;
}

// Words that describe how an animal looks: body parts, colors, patterns and size
const LOOKS = /\b(stripes?|striped|manes?|fur|coat|feathers?|plumage|scales?|skin|colou?rs?|colou?red|white|black|red|blue|green|yellow|orange|brown|gr[ae]y|golden|spots?|spotted|patterns?|horns?|antlers?|tails?|beaks?|bills?|claws?|crest(ed)?|wattles?|casque|helmet|wings?|wingspan|shell|tusks?|neck|legs?|eyes?|ears?|face|head|body|toes?|webbed|largest|large|small|long|tall|size|cm|kg|meters?|metres?|grows?)\b/i;

/**
 * How the animal looks, from its own record only: the sentences of its description (or, failing
 * that, its facts) that describe its body, colors or size, plus its recorded weight and height.
 * The animal's own name is ignored when looking for color words ("White Bengal Tiger").
 */
function appearanceAnswer(a: Animal, fil: boolean): string | null {
  const nameWords = new RegExp(`\\b(${a.name.split(/[^\p{L}]+/u).filter(w => w.length > 2).join("|")})\\b`, "giu");
  const describes = (s: string) => LOOKS.test(s.replace(nameWords, ""));
  const sentences = (a.description ?? "").split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  let picked = sentences.filter(describes);
  if (picked.length === 0) picked = (a.interestingFacts ?? []).filter(f => f.trim() && describes(f));
  const parts = picked.slice(0, 3).map(s => `${stripDot(s)}.`);
  // A sentence taken from the middle of the description may open with "They"/"It": say who
  if (parts[0] && /^(They|Their|It|Its)\b/.test(parts[0])) parts[0] = `${fil ? "Ang" : "The"} ${a.name}: ${parts[0]}`;
  const said = parts.join(" ");
  const kg = num(a.weightKg), cm = num(a.heightCm);
  if (kg && !/\bkg\b/i.test(said)) parts.push(fil ? `Ang bigat nito ay mga ${fmt(kg)} kg.` : `It weighs about ${fmt(kg)} kg.`);
  if (cm && !/\bcm\b/i.test(said)) parts.push(fil ? `Ang taas o haba nito ay mga ${fmt(cm)} cm.` : `It is about ${fmt(cm)} cm tall or long.`);
  return parts.length ? parts.join(" ") : null;
}

/** One sentence answering one aspect, or null when the database doesn't have it */
function answerAspect(a: Animal, aspect: Aspect, fil: boolean, exhibitName: string | null): string | null {
  const n = a.name;
  switch (aspect) {
    case "scientific":
      return a.scientificName ? (fil ? `Ang siyentipikong pangalan ng ${n} ay ${a.scientificName}.` : `The scientific name of the ${n} is ${a.scientificName}.`) : null;
    case "habitat":
      return a.habitat ? (fil ? `Ang tirahan ng ${n}: ${stripDot(a.habitat)}.` : `The ${n}'s habitat is ${lowerFirst(stripDot(a.habitat))}.`) : null;
    case "diet":
      return dietSentence(a, fil);
    case "feeding":
      return a.feedingSchedule
        ? (fil ? `Oras ng pagpapakain sa ${n}: ${stripDot(a.feedingSchedule)}.` : `Feeding time for the ${n}: ${stripDot(a.feedingSchedule)}.`)
        : null;
    case "appearance":
      return appearanceAnswer(a, fil);
    case "fact": {
      const facts = (a.interestingFacts ?? []).filter(f => f.trim());
      if (facts.length === 0) return null;
      const fact = stripDot(facts[Math.floor(Math.random() * facts.length)]!);
      return fil ? `Alam mo ba? ${fact}.` : `Fun fact: ${fact}.`;
    }
    case "status":
      return a.conservationStatus ? (fil ? `Ang conservation status ng ${n} ay ${a.conservationStatus}.` : `The ${n}'s conservation status is ${a.conservationStatus}.`) : null;
    case "weight": {
      const kg = num(a.weightKg);
      return kg ? (fil ? `Ang ${n} ay may bigat na mga ${fmt(kg)} kg.` : `The ${n} weighs about ${fmt(kg)} kg.`) : null;
    }
    case "height": {
      const cm = num(a.heightCm);
      return cm ? (fil ? `Ang ${n} ay may taas o haba na mga ${fmt(cm)} cm.` : `The ${n} is about ${fmt(cm)} cm tall or long.`) : null;
    }
    case "lifespan": {
      const yrs = num(a.lifespanYears);
      return yrs ? (fil ? `Ang ${n} ay nabubuhay nang mga ${fmt(yrs)} taon.` : `The ${n} lives for about ${fmt(yrs)} years.`) : null;
    }
    case "classification": {
      const parts = ([["Kingdom", a.kingdom], ["Phylum", a.phylum], ["Class", a.class], ["Order", a.order], ["Family", a.family], ["Genus", a.genus], ["Species", a.species]] as const)
        .filter(([, v]) => v);
      return parts.length ? `${fil ? `Klasipikasyon ng ${n}` : `Classification of the ${n}`}: ${parts.map(([k, v]) => `${k} ${v}`).join(", ")}.` : null;
    }
    case "location":
      return exhibitName ? (fil ? `Ang ${n} ay nasa ${exhibitName} exhibit.` : `The ${n} is in the ${exhibitName} exhibit.`) : null;
    case "overview":
      return a.description ? `${n}${a.scientificName ? ` (${a.scientificName})` : ""}: ${stripDot(a.description)}.` : null;
  }
}

/** The reply to a question about one animal: only the asked-for details, or the "not found" message. */
export function answerAboutAnimal(message: string, a: Animal, fil: boolean, exhibitName: string | null, aspects?: Aspect[]): string {
  const lines = (aspects ?? detectAspects(message)).map(aspect => answerAspect(a, aspect, fil, exhibitName));
  const found = lines.filter((l): l is string => !!l);
  if (found.length === 0) return fil ? MISSING.fil : MISSING.en;
  // Several details asked and some missing: give what exists and say the rest isn't recorded
  if (found.length < lines.length) found.push(fil ? "Ang iba pang tinanong mo ay wala sa database ng Manila Zoo." : "The rest of what you asked isn't in the Manila Zoo database.");
  return found.join("\n");
}

// The animal each chat was last about, so follow-ups like "Habitat?" or "What does it eat?" work
const MEMORY_MS = 30 * 60_000;
const lastAnimal = new Map<string, { id: number; at: number }>();

export function rememberAnimal(sessionId: string, animalId: number) {
  lastAnimal.set(sessionId, { id: animalId, at: Date.now() });
  if (lastAnimal.size > 5000) {
    const cutoff = Date.now() - MEMORY_MS;
    for (const [k, v] of lastAnimal) if (v.at < cutoff) lastAnimal.delete(k);
  }
}

export function recalledAnimalId(sessionId: string): number | null {
  const m = lastAnimal.get(sessionId);
  return m && Date.now() - m.at < MEMORY_MS ? m.id : null;
}

// The map place each chat was last about (an animal's exhibit, a restroom…), so "How do I get
// there?" can be answered with directions to it
const lastPlace = new Map<string, { id: number; at: number }>();

export function rememberPlace(sessionId: string, pinId: number) {
  lastPlace.set(sessionId, { id: pinId, at: Date.now() });
  if (lastPlace.size > 5000) {
    const cutoff = Date.now() - MEMORY_MS;
    for (const [k, v] of lastPlace) if (v.at < cutoff) lastPlace.delete(k);
  }
}

export function recalledPlaceId(sessionId: string): number | null {
  const m = lastPlace.get(sessionId);
  return m && Date.now() - m.at < MEMORY_MS ? m.id : null;
}

// What the chat last asked about an animal (its exhibit, its diet…), so "What about the ostrich?" or
// "And the deer?" asks the same thing about the new animal
const lastAspects = new Map<string, { aspects: Aspect[]; at: number }>();

export function rememberAspects(sessionId: string, aspects: Aspect[]) {
  lastAspects.set(sessionId, { aspects, at: Date.now() });
  if (lastAspects.size > 5000) {
    const cutoff = Date.now() - MEMORY_MS;
    for (const [k, v] of lastAspects) if (v.at < cutoff) lastAspects.delete(k);
  }
}

export function recalledAspects(sessionId: string): Aspect[] | null {
  const m = lastAspects.get(sessionId);
  return m && Date.now() - m.at < MEMORY_MS ? m.aspects : null;
}

// When ZooBot asked "Which one do you mean: A, B or C?", the question it's waiting to answer
const pendingChoice = new Map<string, { question: string; ids: number[]; at: number }>();

export function awaitChoice(sessionId: string, question: string, ids: number[]) {
  pendingChoice.set(sessionId, { question, ids, at: Date.now() });
}

/** The waiting question, if any; it's only kept for the very next message */
export function takeChoice(sessionId: string): { question: string; ids: number[] } | null {
  const c = pendingChoice.get(sessionId);
  pendingChoice.delete(sessionId);
  return c && Date.now() - c.at < MEMORY_MS ? c : null;
}

/** The one candidate a reply like "the Japanese one" picks: by the words that set its name apart */
export function chooseFrom<T extends { name: string }>(reply: string, candidates: T[]): T | null {
  const said = new Set(reply.toLowerCase().split(/[^\p{L}]+/u).flatMap(w => [w, w.replace(/(es|s)$/, "")]));
  const words = (c: T) => c.name.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  const shared = candidates.map(words).reduce((acc, w) => acc.filter(x => w.includes(x)));
  const picked = candidates.filter(c => words(c).some(w => !shared.includes(w) && said.has(w)));
  return picked.length === 1 ? picked[0]! : null;
}
