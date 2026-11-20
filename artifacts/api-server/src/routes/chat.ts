import { response, Router } from "express";
import { randomUUID } from "crypto";
import { eq, ilike, or, and, inArray } from "drizzle-orm";
import { db, pool, chatHistoryTable, analyticsTable, faqTable, mapPinsTable, mapPathsTable, animalsTable, eventsTable, categoriesTable, type MapPin } from "@workspace/db";
import { SendChatMessageBody, SubmitChatFeedbackBody } from "@workspace/api-zod";
import { planRoute, routeRank, toPlace, type RoutePlace, type WalkingRoute } from "../lib/routing";
import { metresOutsideZoo, ZOO_EDGE_TOLERANCE_M, insideZoo } from "../lib/zooBoundary";
import { AI_SERVICE_URL } from "../lib/aiService";
import { answerRuleQuestion } from "../lib/zooRules";
import { HOURS_ANSWER } from "../lib/visitInfo";
import { currentTicketPrices } from "./datasets";
import { answerAboutAnimal, asksForDetail, detectAspects, rememberAnimal, recalledAnimalId, rememberPlace, recalledPlaceId, awaitChoice, takeChoice, chooseFrom, rememberAspects, recalledAspects, MISSING, type Aspect } from "../lib/animalAnswers";
import { correctSpelling, zooVocabulary } from "../lib/spelling";

const router = Router();

// Below this, BERT's guess is less reliable than the keyword rules (see ai-training/models/eval_report.md)
const BERT_MIN_CONFIDENCE = 0.5;

// ZooBot covers Manila Zoo only. Questions about transport (LRT, MRT, jeep, bus routes, taxis), places
// outside the zoo, other zoos, or unrelated topics get the out-of-scope reply and never a walking
// route. The model has a trained out_of_scope intent too; these rules are the safety net that
// applies whatever the model guessed.
const OUTSIDE_ZOO = new RegExp([
  String.raw`\b(lrt|mrt|lrt-?[12]|train stations?|istasyon|bus (?:stops?|stations?|terminals?)|terminals?|sakayan|jeepneys?|jeep|grab ?car|taxis?|uber|tricycles?|trike|angkas|joyride|commute|mag-?commute|p2p|airport|naia|ferry|pier|rizal park|luneta|ocean park|intramuros|quiapo|divisoria|cubao|makati|pasay|quezon city|sm manila|sm city|robinsons|malls?|manila bay|baywalk|hotels?|inns?|hostels?|airbnb|resorts?)\b`,
  // Riding a bus somewhere ("what bus should I take", "sumakay ng bus"), not bus parking at the zoo
  String.raw`\b(?:what|which|anong|aling)\s+bus\b|\b(?:take|ride|sumakay|sakay)\b.*\bbus\b|\bbus\s+(?:to|papunta|papuntang|route)\b`,
  // Travelling TO the zoo ("how do I get to Manila Zoo", "paano pumunta sa Manila Zoo")
  String.raw`\b(?:get|go|going|travel)\s+to\s+(?:the\s+)?(?:manila\s+)?zoo\b|\b(?:pumunta|papunta|papuntang|makarating)\s+(?:sa\s+)?(?:manila\s+)?zoo\b`,
  // Eating outside the zoo: restaurant chains, or restaurants near/outside the zoo (the zoo's own
  // Food Court and Plaza Restaurant are "in the zoo", which stays in scope)
  String.raw`\b(jollibee|mcdo|mcdonald'?s|kfc|chowking|mang inasal|greenwich|starbucks|7-?eleven)\b`,
  String.raw`\b(restaurants?|resto|kainan|cafes?|coffee shops?|eat|kumain)\b[^?]*\b(near|nearby|around|outside|malapit sa|sa labas ng)\s+(the\s+)?(manila\s+)?zoo\b|\b(restaurants?|resto|kainan|cafes?)\s+(nearby|outside|malapit dito)\b`,
  // Other zoos and attractions
  String.raw`\b(avilon|zoobic|baluarte|paradizoo|cebu safari|crocodile park|singapore zoo|san diego zoo|other zoos?|another zoo|ibang zoo|which zoo|best zoo|tourist spots?|tourist attractions?)\b`,
  // Other places around the city
  String.raw`\b(church|simbahan|pharmacy|botika|drugstore|gas station|convenience store)\b`,
].join("|"), "i");
// …except arriving and parking AT the zoo, which is zoo visitor information ("where can the school
// bus park?", "where should our Grab drop us off?")
const ZOO_ARRIVAL = /\bparking\b|\bpark\b|parada|drop.?off|\bibaba\b|babaan/i;
const OUTSIDE_PARK_NAMES = /\b(rizal|luneta|ocean)\s+park\b/gi;

function isOutsideZoo(message: string): boolean {
  return OUTSIDE_ZOO.test(message) && !ZOO_ARRIVAL.test(message.replace(OUTSIDE_PARK_NAMES, ""));
}

// General-knowledge topics that have nothing to do with a zoo visit
const UNRELATED_TOPIC = new RegExp([
  String.raw`\b(weather|forecast|panahon|uulan|president|presidente|mayor|homework|assignment|takdang.?aralin|math|translate|isalin|jokes?|news|balita|capital of|population of|recipe|cook|luto|magluto|stock market|lotto|bitcoin|crypto|nba|basketball|election|eleksyon|movies?|pelikula|poem|install|photosynthesis)\b`,
  String.raw`\b\d+\s*(?:x|times|plus|minus|divided by|[*+/-])\s*\d+\b`,
  // "Who is the president/leader…", also the common typo "resident" ("Manila resident" ticket questions don't start with "who is")
  String.raw`\b(?:who\s+is|who's|sino\s+ang)\s+(?:the\s+)?(?:current\s+)?(?:p?resident|vice\s+president|senator|governor|king|queen|prime\s+minister|leader|pangulo)\b`,
].join("|"), "i");

function isUnrelated(message: string): boolean {
  return isOutsideZoo(message) || UNRELATED_TOPIC.test(message);
}

const EMERGENCY = /\bemergenc|\bambulance\b|\bfirst\s+aid\b|\binjur(ed|y|ies)\b|\bbleeding\b|\bsaklolo\b|\bnasaktan\b|\bdumudugo\b|\bnahimatay\b|\bfainted\b/i;

// Words a real emergency message contains. The model tends to guess "emergency" for anything it
// doesn't understand ("you are useless", "hi hi hi", emoji); without one of these, that guess is dropped.
const EMERGENCY_HINT = new RegExp([
  String.raw`\bemergenc|\bambulance\b|\bfirst\s+aid\b|\binjur|\bbleed|\bblood\b|\bfaint|\bcollaps|\bunconscious\b|\bseizure|\bheart\s+attack\b|\bstroke\b|\bcan'?t\s+breathe?\b|\bbreathing\b|\bchok(e|ing)\b|\bheat\s?stroke\b|\bdizzy\b|\bsick\b|\bpain\b|\bhurt\b|\bwound|\bbitten\b|\bbit\s+(me|him|her|my)\b|\bbite\b|\bstung\b|\bsting\b|\ballerg|\bfell\b|\bfall(en)?\b|\baccident|\bfire\b|\bsmoke\b|\bburn|\bhelp\b|\bsos\b|\bdanger|\bunsafe\b|\bpolice\b|\bsecurity\b|\bguard\b|\bdoctor\b|\bnurse\b|\bclinic\b|\bmedic|\bhospital\b|\bhotline\b`,
  String.raw`\bscrap(e|ed|es)\b|\bcuts?\b|\bbruis|\bsprain|\bbroke\b|\bbroken\b|\bfractur|\bbandage|\bband-?aids?\b|\bplaster\b|\basthma|\battack\b|\bvomit|\bthrow(ing)?\s+up\b|\bfever\b|\bbees?\b|\bwasps?\b|\b(outside|out\s+of)\s+(its|the|their)\s+(cage|enclosure|exhibit)\b`,
  String.raw`\blost\b|\bmissing\b|\bcan'?t\s+find\s+(my|our)\b|\bseparated\b|\b(escaped|loose|got\s+out)\b|\bstole|\bstolen\b|\bthie(f|ves)\b|\bpickpocket|\bsnatch|\bfight|\bharass|\bstranger\b|\bthreat`,
  String.raw`\bsaklolo\b|\btulong\b|\btulungan\b|\bnasaktan\b|\bnasugatan\b|\bsugat|\bdumudugo\b|\bdugo\b|\bnahimatay\b|\bhinimatay\b|\bnahihilo\b|\bnahulog\b|\bnadapa\b|\bnakagat\b|\bkagat\b|\bsunog\b|\bnasusunog\b|\bnawawala\b|\bnawala\b|\bhindi\s+(ko|namin)\s+(makita|mahanap)\b|\bnakawala\b|\bninakaw\b|\bmagnanakaw\b|\bnanakawan\b|\baway\b|\bpulis\b|\bguwardiya\b|\bdoktor\b|\bmasama\s+ang\s+pakiramdam\b|\bhindi\s+makahinga\b|\baksidente\b|\bdelikado\b|\bmapanganib\b|\bsakit\b`,
  String.raw`\bambulans|\bnakawala|\bkinagat\b|\bbubuyog\b|\bputakti\b|\bhika\b|\binaatake\b|\binatake\b|\bnaligaw\b|\bligaw\b|\bgamot\b|\bsumusuka\b|\blagnat\b|\bnabali\b|\bnapilay\b|\bpilay\b|\bgasgas\b|\bnahiwa\b`,
].join("|"), "i");

// ─── Safety ──────────────────────────────────────────────────────────────────
// Checked before everything else, so these answers stand whatever the model guessed or the topic.

// Thoughts of suicide or self-harm: a caring reply with crisis lines, never just the zoo security number
const SELF_HARM = /\b(kill|hurt|harm|cut)\s+my\s?self\b|\bsuicid|\bend\s+(my\s+life|it\s+all)\b|\b(want|wanna|going)\s+to\s+die\b|\bwanna\s+die\b|\bdon'?t\s+want\s+to\s+(live|be\s+alive)\b|\bself[-\s]?harm\b|\bno\s+reason\s+to\s+live\b|\bmagpakamatay\b|\bpatayin\s+(ko\s+)?(ang\s+)?sarili\b|\bsaktan\s+(ko\s+)?(ang\s+)?sarili\b|\bayoko\s+(na\s+)?(ng\s+|nang\s+)?mabuhay\b|\bgusto\s+ko\s+(na\s+)?(ng\s+|nang\s+)?mamatay\b/i;

// Hurting, poisoning or killing the animals, as something the visitor would do ("I want to hurt…",
// "how can I poison…"); not questions about the animals ("how do lions kill their prey?")
const HARM_VERBS = String.raw`(hurt|harm|kill|poison|abuse|kick|hit|beat|stab|shoot|torture|injure|attack|throw\s+(rocks?|stones?)\s+at)\b(?!\s+time)`;
const ANIMAL_HARM = new RegExp([
  String.raw`\b(i|we|i'll|we'll)\s+(really\s+)?((want|need|plan|try|am\s+going|are\s+going)\s+to\s+|wanna\s+|gonna\s+|will\s+|would\s+|can\s+|could\s+|should\s+|might\s+)?` + HARM_VERBS,
  String.raw`\b(i'm|im|we're)\s+(going\s+to|gonna)\s+` + HARM_VERBS,
  String.raw`\b(how\s+(do|can|could|would|should)\s+(i|we|someone|one)|how\s+to|ways?\s+to|(best|easiest)\s+way\s+to)\s+(\w+\s+)?` + HARM_VERBS,
  String.raw`\b(poison|lason)\w*\b.{0,40}\b(kill|die|patay|mamatay)\w*\b|\b(kill|patay)\w*\b.{0,40}\b(poison|lason)\w*\b`,
  String.raw`\b(saktan|patayin|lasunin|sipain|paluin|bugbugin|pahirapan|batuhin)\b.{0,25}\b(hayop|mga|ang|yung)\b`,
].join("|"), "i");

// Climbing into, crossing or reaching past an enclosure, fence or barrier ("can the tiger jump the
// fence?" is about the animal, so "the <animal> jump…" is skipped)
const ENCLOSURE_DANGER = new RegExp([
  String.raw`(?<!\b(the|a|an|ang|yung)\s+\w+\s+)\b(climb|jump|crawl|hop|cross)\w*\b.{0,25}\b(enclosures?|cages?|fences?|barriers?|railings?|rails?|moat|walls?|glass|kulungan|bakod)\b`,
  String.raw`\b(go|get|sneak|step|reach|put|stick|fall)\w*\s+(\w+\s+){0,3}?(in|into|inside|over|past|beyond|behind)\s+(the\s+)?(\w+\s+){0,2}(enclosures?|cages?|fences?|barriers?|railings?|moat|kulungan)\b`,
  String.raw`\benter\w*\s+(the\s+|an?\s+)?(\w+\s+){0,2}(enclosures?|cages?)\b`,
  String.raw`\b(pumasok|umakyat|tumalon|sumampa|tumawid)\b.{0,25}\b(kulungan|bakod|enclosure|cage|harang)\b`,
].join("|"), "i");

// Touching, holding or riding the animals (not "ride the tram", "hold my bag", "bring my pet")
const TOUCH_ANIMAL = /\b(can|may|could|pwede|puwede)\s+(i|we|my\s+\w+|kids?|children|ba|po)?\s*(\w+\s+)?(touch|pet|hug|hold|ride|carry|cuddle|kiss|play\s+with|hawakan|himasin|sakyan|yakapin|kargahin)\b(?!\s+(the\s+|a\s+|my\s+|our\s+)?(tram|trains?|bikes?|bicycles?|boats?|carousel|kiddie|rides?|swings?|slides?|elevator|hands?|strollers?|wheelchairs?|bags?|umbrellas?|baby|tumblers?|cameras?|phones?|tickets?)\b)/i;

// Visitors feeding the animals in their own words ("how do I feed the crocodile my leftover chicken",
// "throw bread to the ducks"); not "when do they feed the lions?"
const VISITOR_FEEDING = /\b(can|may|could|how\s+(do|can|could|should))\s+(i|we|my\s+\w+|kids?)\s+(\w+\s+)?feed\b|\b(i|we)\s+(want\s+to|wanna|will|would\s+like\s+to|brought\s+\w+\s+to)\s+feed\b|\b(give|throw|toss)\b.{0,25}\b(food|bread|chips|candy|snacks?|leftovers?)\b.{0,25}\bto\s+(the\s+)?\w+|\bpakainin\s+(ko|namin)\b/i;

// Taking an animal out of the zoo, as something the visitor would do (not "do monkeys steal food?")
const THEFT = /\b(i|we|someone|how\s+(do|can|could|would|to)|how\s+to|gonna|wanna|want\s+to)\b.{0,25}\b(steal|kidnap|smuggle)\b|\b(nakawin|magnakaw|nanakawin|itakas)\b|\b(take|bring|sneak)\s+(an?|the|one|a\s+baby)\s+(\w+\s+){0,2}(animals?|monkeys?|birds?|snakes?|turtles?|tortoises?|parrots?|cockatoos?|hayop)\s+(home|out)\b/i;

// Getting in without a ticket (but "can seniors get in free?" is a ticket question: DISCOUNT_WORDS)
const SNEAK_IN = /\b(sneak|get|go|enter|climb)\w*\s+in(to|side)?\b.{0,30}\b(without|free|for\s+free|not\s+pay|no\s+ticket)|\bwithout\s+(paying|a\s+ticket|tickets?)\b|\b(skip|avoid|dodge)\s+(the\s+)?(ticket|payment|entrance\s+fee|fee)\b|\b(puslit|lumusot|makalusot)\b/i;
const DISCOUNT_WORDS = /\b(seniors?|senior\s+citizens?|students?|pwds?|disab|child|children|kids?|bab(y|ies)|toddlers?|infants?|residents?|teachers?|employees?|birthday|discount|osca|lola|lolo|estudyante|bata)\b/i;

// Weapons and dangerous items
const WEAPONS = /\b(guns?|firearms?|pistols?|revolvers?|rifles?|weapons?|ammo|ammunition|bullets?|explosives?|bombs?|grenades?|tasers?|stun\s+guns?|pepper\s+spray|baril|armas|bala|pampasabog|paputok)\b/i;

const SAFETY = {
  selfHarm: {
    en: "I'm really sorry you're feeling this way. You don't have to go through this alone. Please reach out right now: call the NCMH Crisis Hotline at 1553 (free, 24/7), or 911 if you are in immediate danger. If you are inside the zoo, any zoo staff member or security (+63 2 8525-7275) can stay with you and get help.",
    fil: "Pasensya na at ganito ang nararamdaman mo. Hindi mo kailangang harapin ito nang mag-isa. Tumawag ngayon sa NCMH Crisis Hotline sa 1553 (libre, 24/7), o sa 911 kung nasa panganib ka. Kung nasa loob ka ng zoo, lumapit sa kahit sinong tauhan o sa zoo security (+63 2 8525-7275); sasamahan ka nila at tutulungan.",
  },
  animalHarm: {
    en: "Harming, poisoning or disturbing the animals is never allowed, and animal cruelty is a crime under the Animal Welfare Act (RA 8485). Zoo security will act on it. If you see anyone hurting an animal, tell the nearest zoo staff member or call security at +63 2 8525-7275.",
    fil: "Mahigpit na ipinagbabawal ang pananakit, paglason o pang-iistorbo sa mga hayop, at krimen ang kalupitan sa hayop ayon sa Animal Welfare Act (RA 8485). Aaksyunan ito ng zoo security. Kung may makita kang nananakit ng hayop, sabihan ang pinakamalapit na tauhan ng zoo o tumawag sa security sa +63 2 8525-7275.",
  },
  enclosure: {
    en: "For your safety, never climb, cross or reach into an enclosure, fence or barrier, not even for a photo. The animals are wild and can be dangerous, and it stresses them. Please take pictures from the viewing areas; zoo staff will stop anyone who crosses a barrier.",
    fil: "Para sa iyong kaligtasan, huwag umakyat, tumawid o umabot sa loob ng kulungan, bakod o harang, kahit para sa litrato. Mababangis ang mga hayop at maaaring mapanganib, at nai-stress sila rito. Kumuha ng litrato mula sa mga viewing area; pipigilan ng mga tauhan ng zoo ang sinumang lalampas sa harang.",
  },
  touch: {
    en: "Please don't touch, hold or ride the animals unless zoo staff invite you to during an official activity. They are wild animals that can bite or scratch, and handling stresses them. Enjoy them from the viewing areas.",
    fil: "Huwag hawakan, kargahin o sakyan ang mga hayop maliban kung inanyayahan ka ng mga tauhan ng zoo sa isang opisyal na aktibidad. Mababangis na hayop sila na maaaring mangagat o mangalmot, at nai-stress sila kapag hinahawakan. Panoorin sila mula sa mga viewing area.",
  },
  theft: {
    en: "Taking any animal from the zoo is not allowed and is a crime. The animals are protected and cared for by the zoo, and many are endangered. Zoo security will act on any attempt. If you'd like to help them, ask me about the endangered animals or the zoo's events.",
    fil: "Bawal at krimen ang pagkuha ng anumang hayop mula sa zoo. Protektado at inaalagaan ng zoo ang mga hayop, at marami sa kanila ang nanganganib. Aaksyunan ng zoo security ang anumang pagtatangka. Kung gusto mo silang tulungan, itanong sa akin ang tungkol sa mga nanganganib na hayop o sa mga kaganapan ng zoo.",
  },
  sneakIn: {
    en: "Every visitor needs a ticket from the entrance. Some visitors get a discount or free entry (for example, children 2 years old and below). Ask \"How much is the ticket?\" to see all the rates.",
    fil: "Kailangan ng tiket mula sa pasukan ang bawat bisita. May diskwento o libreng pasok ang ilang bisita (halimbawa, mga batang 2 taong gulang pababa). Itanong ang \"Magkano ang ticket?\" para makita ang lahat ng presyo.",
  },
  weapons: {
    en: "No. Weapons, firearms, explosives and sharp or pointed objects are not allowed inside Manila Zoo. Zoo personnel and security may act on any violation.",
    fil: "Hindi po. Bawal ang armas, baril, pampasabog at matutulis na bagay sa loob ng Manila Zoo. Maaaring umaksyon ang mga tauhan at security ng zoo sa anumang paglabag.",
  },
};

/** The safety answer for a message, with the intent to log it under, or null when none applies. */
function safetyReply(message: string, isFil: boolean): { reply: Reply; intent: string } | null {
  const say = (text: { en: string; fil: string }, intent = "safety") =>
    ({ reply: { reply: isFil ? text.fil : text.en, relatedAnimals: [], relatedPins: [] }, intent });
  if (SELF_HARM.test(message)) return say(SAFETY.selfHarm, "emergency");
  if (ANIMAL_HARM.test(message)) return say(SAFETY.animalHarm);
  if (THEFT.test(message)) return say(SAFETY.theft);
  if (ENCLOSURE_DANGER.test(message)) return say(SAFETY.enclosure);
  if (WEAPONS.test(message)) return say(SAFETY.weapons);
  if (SNEAK_IN.test(message) && !DISCOUNT_WORDS.test(message)) return say(SAFETY.sneakIn);
  if (VISITOR_FEEDING.test(message)) {
    const rule = answerRuleQuestion("can I feed the animals", isFil ? "fil" : "en");
    if (rule) return { reply: { reply: rule, relatedAnimals: [], relatedPins: [] }, intent: "safety" };
  }
  if (TOUCH_ANIMAL.test(message)) return say(SAFETY.touch);
  return null;
}

// The reply to anything outside Manila Zoo (other places, transport, general knowledge)
const OUT_OF_SCOPE = {
  en: "Sorry, I can only assist with questions related to Manila Zoo. You can ask me about animals, exhibits, facilities, navigation, and visitor information.",
  fil: "Paumanhin, makakatulong lamang ako sa mga tanong tungkol sa Manila Zoo. Maaari mo akong tanungin tungkol sa mga hayop, exhibit, pasilidad, direksyon, at impormasyon para sa bisita.",
};

// "The largest animal in the world", "the fastest bird", "pinakamalaking hayop sa mundo": rankings
// and world trivia. The database has no rankings (and many size fields are empty), so these are
// never answered, even about the zoo's own animals. "Pinakamalapit" (nearest) is not one of them.
const SUPERLATIVE = /\b(largest|biggest|smallest|tallest|shortest|fastest|slowest|heaviest|lightest|longest|oldest|youngest|strongest|weakest|smartest|deadliest|most dangerous|most venomous|rarest|world'?s|world records?|in the world|on earth)\b|\bpinaka(?!malapit)\w+|\bsa (buong )?mundo\b/i;
// World trivia is outside the zoo altogether; a ranking of the zoo's own animals is just not recorded
const WORLD = /\bworld|\bearth\b|\bmundo\b/i;

// An explicit request for walking directions, as opposed to asking where something is
const DIRECTIONS = /\bhow\s+(do|can|should)\s+(i|we)\s+(get|go|walk|reach)\b|\bdirections?\b|\broute\b|\btake\s+(me|us)\b|\bguide\s+(me|us)\b|\blead\s+(me|us)\b|\bshow\s+(me|us)\s+(the\s+way|how)\b|\b(which|what)\s+way\b|\bway\s+to\b|\bhow\s+far\b|\bget\s+(back|out)\b|\bwant\s+to\s+go\b|\bpa(a)?no\s+(po\s+)?(ako\s+)?(pumunta|pupunta|makarating|makakarating|bumalik|lumabas|pmunta)\b|\b(papunta|papuntang)\b|\bdadaan\b|\bituro\b|\bgaano\s+kalayo\b|\bmalayo\b|\bsamahan\b/i;
// A follow-up about the place just talked about ("How do I get there?", "Paano pumunta doon?")
const THERE = /\b(there|it|that|them|doon|dun|diyan|dyan|jan|siya|sila)\b/i;

function detectIntent(message: string): string {
  if (DIRECTIONS.test(message)) return "navigation";
  if (/where|location|find|locate|saan|nasa saan/i.test(message)) return "animal_location";
  if (/lion|tiger|elephant|giraffe|monkey|snake|bird|crocodile|bear|eagle|python|tortoise/i.test(message)) return "animal_info";
  if (/time|open|close|hours|oras|bukas|sarado/i.test(message)) return "zoo_hours";
  if (/ticket|price|fee|bayad|presyo|magkano/i.test(message)) return "tickets";
  if (/food|eat|restaurant|canteen|pagkain|merienda/i.test(message)) return "facilities";
  if (/emergency|help|lost|first aid|ambulance/i.test(message)) return "emergency";
  // Whole words for the short ones: "cr" is inside "crocodile", "hi" inside "Philippines"
  if (/restroom|\bc\.?r\b|comfort room|toilet|banyo/i.test(message)) return "facilities";
  if (/parking|park/i.test(message)) return "parking";
  if (/event|show|feeding|program|show/i.test(message)) return "events";
  if (/\b(hello|hi|hey|kumusta|magandang|good morning|good afternoon|good evening)\b/i.test(message)) return "greeting";
  return "general";
}

function detectLanguage(message: string): string {
  // Whole words only, so "zoo", "food" or "open" don't read as Filipino "oo"/"po"
  return /\b(saan|nasaan|ano|anong|sino|paano|bakit|kailan|kumusta|salamat|po|opo|hindi|oo|maganda|hayop|mahal|bukas|sarado|meron|walang|kung|magkano|ang|mga|ba)\b/i.test(message) ? "fil" : "en";
}

// Thanks and goodbyes aren't a trained intent; the model tends to guess "emergency" for them
const THANKS = /^\s*(thanks?( you)?|thank u|ty|salamat( po)?|maraming salamat( po)?|bye|goodbye|paalam)\b[\s!.,po]*$/i;

// Animals visitors ask for by a name the database doesn't store; a group word stands for several
// ("snake" means the pythons and the cobras). Plurals are looked up by their singular too.
const ANIMAL_ALIASES: Record<string, string | string[]> = {
  monkey: "macaque", monkeys: "macaque", unggoy: "macaque", matsing: "macaque",
  lizard: "monitor", butiki: "monitor", parrot: "cockatoo", turtle: "tortoise",
  snake: ["python", "cobra"], ahas: ["python", "cobra"],
  // Filipino names
  tigre: "tiger", leon: "lion", buwaya: "crocodile", agila: "eagle", kuwago: "owl", sawa: "python",
  pagong: "tortoise", usa: "deer", bayawak: "monitor", kalaw: "hornbill", kalapati: "pigeon", kobra: "cobra",
};
const aliasesOf = (w: string): string[] => { const a = ANIMAL_ALIASES[w]; return a == null ? [] : Array.isArray(a) ? a : [a]; };
/** The head word of an animal's name, which says what kind of animal it is ("Philippine Eagle Owl" is an owl) */
const headWord = (name: string) => name.replace(/\(.*?\)/g, "").toLowerCase().split(/[^\p{L}]+/u).filter(Boolean).at(-1) ?? "";
// Everyday words that appear in animal names but don't identify one on their own ("water" in Sailfin
// Water Lizard, "red" in Red-footed Tortoise, "philippine" in many). They still count next to a specific word.
const GENERIC_NAME_PARTS = new Set(("water tree common red green blue white black brown long tailed crested spitting footed eared " +
  "fruit imperial painted ring double wattled indian african japanese burmese philippine celebes bengal").split(" "));
// Words that describe an animal rather than name it ("albino tiger", "white tiger", "baby elephant")
const DESCRIPTORS = new Set(["albino", "white", "black", "giant", "baby", "little", "golden", "spotted", "striped"]);

// Words that never name an animal; skipping them avoids false matches like "the" or "ang"
const STOP_WORDS = new Set([
  "the", "and", "for", "are", "can", "you", "what", "where", "when", "how", "does", "did", "why", "who", "which",
  "tell", "about", "find", "see", "eat", "eats", "live", "zoo", "manila", "animal", "animals", "please", "there",
  "ang", "mga", "ng", "sa", "saan", "nasaan", "ano", "anong", "paano", "bakit", "kailan", "yung", "iyong", "dito",
  "makikita", "hayop", "kinakain", "pagkain", "tungkol", "naman", "ba", "po", "ka",
  "scientific", "name", "siyentipikong", "siyentipiko", "pangalan",
]);

// Real words one letter away from an animal's name word ("store"/stork, "write"/white), never read as typos
const NOT_TYPOS = new Set([
  "store", "stores", "write", "while", "whale", "greet", "great", "failed", "pointed", "pointy", "cared",
  "scared", "heard", "tight", "eager", "lemon", "lemons", "there", "where", "three", "these", "those", "other",
  "rings", "brows", "doubt", "fruity", "tiles", "nation", "pigeons", "tigers", "zebras", "cobras", "hyenas",
]);

/** Whether two words differ by at most one typo (two for words of 8+ letters); a swap of neighbours counts as one. */
function withinTypos(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length) >= 8 ? 2 : 1;
  if (Math.abs(a.length - b.length) > max) return false;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j]!, prev2[j - 2]! + 1);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length]! <= max;
}

/**
 * Finds the animals a message is about, by name or common/Tagalog name, tolerating punctuation and
 * plurals. Each animal is scored by how many of its name's words the message mentions, so
 * "Philippine eagle" picks the Philippine Eagle, not the first "Philippine" animal.
 */
async function findAnimals(message: string) {
  const words = message.toLowerCase().replace(/[^\p{L}\s-]/gu, " ").split(/\s+/)
    // Question words ("how long", "what time") never name an animal, even when one's name has them ("Long-tailed")
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !DETAIL_WORDS.has(w));
  // Each word stands for itself, its singular, and its English alias ("unggoy" -> macaque, "snakes" -> python, cobra)
  // Plurals by "-s" and "-es" both ("snakes" -> snake, "foxes" -> fox)
  const terms = words.map(w => {
    const ones = [w.replace(/s$/, ""), w.replace(/es$/, "")];
    return new Set([w, ...ones, ...aliasesOf(w), ...ones.flatMap(aliasesOf)]);
  });
  if (terms.length === 0) return [];

  const all = await db.select().from(animalsTable);
  const scored = all.map(a => {
    const nameWords = `${a.name} ${a.commonName ?? ""}`.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
    const head = headWord(a.name);
    let score = 0;
    let namesKind = false;
    let specific = false;
    for (const forms of terms) {
      const matched = [...forms].some(t => t.length >= 3 && nameWords.some(n => n === t || (t.length >= 4 && n.startsWith(t))));
      const typo = !matched && [...forms].some(t => t.length >= 5 && !NOT_TYPOS.has(t) && nameWords.some(n => n.length >= 5 && withinTypos(t, n)));
      // A misspelt name word still counts, a little less ("capybra" -> capybara)
      if (matched) score += 2;
      else if (typo) score += 1;
      if ((matched || typo) && ![...forms].every(t => GENERIC_NAME_PARTS.has(t))) specific = true;
      if ([...forms].some(t => t === head)) namesKind = true;
    }
    // Only everyday words of the name matched ("buy water" is not the Sailfin Water Lizard): no match
    if (!specific) score = 0;
    // Naming the kind of animal settles a tie: "albino tiger" is the tiger, not the albino python, and
    // "agila" (eagle) is the Philippine Eagle, not the Philippine Eagle Owl
    if (score > 0 && namesKind) score += 1;
    return { a, score, size: a.name.split(/\s+/).length };
  }).filter(s => s.score > 0);
  if (scored.length === 0) return [];
  // Most name words matched first; on a tie the shorter name ("Philippine Eagle" before "Philippine Eagle Owl")
  scored.sort((x, y) => y.score - x.score || x.size - y.size || x.a.name.localeCompare(y.a.name));
  const best = scored[0]!.score;
  return scored.filter(s => s.score === best).slice(0, 6).map(s => s.a);
}

type Animal = typeof animalsTable.$inferSelect;

/** A chat reply; `route` is a walking route (navigation only), `location` the one place the answer is about. */
type Reply = { reply: string; relatedAnimals: unknown[]; relatedPins: unknown[]; route?: WalkingRoute | null; location?: MapPin | null };

/**
 * The answer about a named animal: only the detail asked for (habitat, diet, feeding time, a fun
 * fact, its exhibit…), from that database field alone; "tell me about…" gets the short description.
 * The session remembers the animal and its exhibit, so a follow-up ("Habitat?", "What does it eat?",
 * "How do I get there?") is about it too. `aspectsOverride` answers those details instead of the ones
 * the message asks for (["location"] answers with the exhibit alone).
 */
async function animalReply(message: string, hits: Animal[], isFil: boolean, sessionId: string, aspectsOverride?: Aspect[]): Promise<Reply> {
  const asked = aspectsOverride ?? detectAspects(message);
  const a = pickAnimal(message, hits);
  if (!a) {
    const names = hits.map(h => h.name);
    const options = names.length > 1 ? `${names.slice(0, -1).join(", ")} ${isFil ? "o" : "or"} ${names.at(-1)}` : names[0];
    // "Where are the monkeys?": when every match lives in the same exhibit, that exhibit is the answer
    const homes = new Set(hits.map(h => h.locationId));
    const [only] = homes;
    if (asked.includes("location") && homes.size === 1 && only != null) {
      const [pin] = await db.select().from(mapPinsTable).where(eq(mapPinsTable.id, only));
      if (pin) {
        rememberPlace(sessionId, pin.id);
        rememberAspects(sessionId, ["location"]);
        return {
          reply: isFil
            ? `Ang ${options} ay nasa ${pin.name} exhibit. Itanong ang "Paano pumunta doon?" para sa direksyon.`
            : `${hits.length === 2 ? "Both" : "All of them"} (${names.join(", ")}) are in the ${pin.name} exhibit. Ask "How do I get there?" for walking directions.`,
          relatedAnimals: hits, relatedPins: [pin], location: pin,
        };
      }
    }
    awaitChoice(sessionId, message, hits.map(h => h.id));
    return {
      reply: isFil ? `Aling hayop ang tinutukoy mo: ${options}?` : `Which one do you mean: ${options}?`,
      relatedAnimals: hits, relatedPins: [],
    };
  }
  const [pin] = a.locationId ? await db.select().from(mapPinsTable).where(eq(mapPinsTable.id, a.locationId)) : [];
  rememberAnimal(sessionId, a.id);
  rememberAspects(sessionId, asked);
  if (pin) rememberPlace(sessionId, pin.id);
  const reply = answerAboutAnimal(message, a, isFil, pin?.name ?? null, aspectsOverride);
  // Where the animal is: name the exhibit and offer directions, but don't give them unasked
  const asksLocation = asked.includes("location");
  const hint = asksLocation && pin ? (isFil ? ` Itanong ang "Paano pumunta doon?" para sa direksyon.` : ` Ask "How do I get there?" for walking directions.`) : "";
  return { reply: describedAs(message, a, isFil) + reply + hint, relatedAnimals: [a], relatedPins: asksLocation && pin ? [pin] : [], location: asksLocation ? pin ?? null : null };
}

/**
 * When the visitor describes the animal differently from its record ("albino tiger" for the White
 * Bengal Tiger), say which record the answer is about rather than pretend the name matches.
 */
function describedAs(message: string, a: Animal, isFil: boolean): string {
  const words = message.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  const name = a.name.toLowerCase();
  const i = words.findIndex((w, k) => DESCRIPTORS.has(w) && !name.includes(w) && k + 1 < words.length);
  if (i < 0) return "";
  const said = `${words[i]} ${words[i + 1]}`;
  return isFil
    ? `Walang hayop na "${said}" sa database ng Manila Zoo; ang pinakamalapit na tugma ay ang ${a.name}. `
    : `There's no animal named "${said}" in the Manila Zoo database; the closest match is the ${a.name}. `;
}

/**
 * The one animal a message means: the only match, or the one whose full name it spells out
 * ("Burmese python" is not the albino one). Null when the name fits several equally ("macaque").
 */
function pickAnimal(message: string, hits: Animal[]): Animal | null {
  if (hits.length === 1) return hits[0]!;
  const said = new Set(message.toLowerCase().split(/[^\p{L}]+/u).flatMap(w => [w, w.replace(/(es|s)$/, "")]));
  const full = hits.filter(h => h.name.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean).every(w => said.has(w)));
  return full.length === 1 ? full[0]! : null;
}

// "it", "they", "its"… : a follow-up about the animal just discussed
const FOLLOW_UP = /\b(it|its|it's|they|them|their|this animal|that animal|siya|sila|niya|nila|ito|iyan|yan)\b/i;

/**
 * The animal a message is about: one it names, or (for a short or "it/they" follow-up asking for a
 * detail) the one this chat was just about. Empty when neither applies.
 */
async function animalsFor(message: string, sessionId: string, allowRecall: boolean): Promise<Animal[]> {
  const named = await findAnimals(message);
  if (named.length > 0) return named;
  if (!allowRecall || !asksForDetail(message)) return [];
  const short = message.trim().split(/\s+/).length <= 4;
  if (!short && !FOLLOW_UP.test(message)) return [];
  const id = recalledAnimalId(sessionId);
  if (!id) return [];
  const [a] = await db.select().from(animalsTable).where(eq(animalsTable.id, id));
  return a ? [a] : [];
}

// Words that ask for a detail rather than name an animal
const DETAIL_WORDS = new Set(("habitat diet food eat eats feeding feed fed schedule time times fact facts fun interesting status conservation endangered " +
  "weight weigh weighs heavy tall height length big size lifespan long old live lives living scientific latin name family genus order class species " +
  "exhibit enclosure cage also give know info information its their they them this that unknown some any kind type tirahan pagkain kinakain " +
  "oras pagpapakain siyentipikong pangalan bigat taas haba laki ilang taon nakatira naninirahan").split(" "));

// Words that ask to see or go somewhere, never part of an animal's name ("I want to see snakes")
const FILLER_WORDS = new Set(("want wanna like would could should see look visit show go going one ones near nearby close around " +
  "here inside first next also please just really some any gusto gustong makita tingnan puntahan malapit dito").split(" "));

/** The words naming an animal that isn't in the database ("unicorn"), or null if the message names none */
function unknownAnimalWords(message: string): string | null {
  const words = message.toLowerCase().replace(/[^\p{L}\s'-]/gu, " ").split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !DETAIL_WORDS.has(w) && !FAQ_COMMON.has(w) && !FILLER_WORDS.has(w));
  return words.length ? words.slice(0, 3).join(" ") : null;
}

// Traits the database doesn't record for any animal ("which one is venomous?", "are they dangerous?")
const ATTRIBUTE = /\b(venomous|poisonous|dangerous|aggressive|friendly|nocturnal|makamandag|mapanganib|delikado)\b/i;

// "Animals near the entrance", "exhibits close to the food court", "mga hayop malapit sa CR"
const NEAR_ANIMALS = /\b(animals?|exhibits?|hayop)\b.*\b(near|nearby|close to|around|beside|malapit)\b|\b(near|malapit)\b.*\b(animals?|exhibits?|hayop)\b/i;

/**
 * The animal exhibits closest to a place the visitor names (by walking distance over the mapped
 * walkways), with the animals recorded in each. Null when the message isn't asking this or names no
 * place on the map; "near me" is answered elsewhere, from the visitor's position.
 */
async function exhibitsNear(message: string, pins: MapPin[], isFil: boolean, sessionId: string): Promise<Reply | null> {
  if (!NEAR_ANIMALS.test(message) || /\bnear\s+me\b|\bmalapit\s+sa\s+akin\b/i.test(message)) return null;
  const text = message.replace(/\b(animals?|exhibits?|hayop)\b/gi, " ");
  const type = PLACE_TYPES.find(([re]) => re.test(text))?.[1];
  const anchor = namedPin(text, pins.filter(p => p.pinType !== "animal")) ?? namedPin(text, pins)
    ?? (type ? pins.find(p => p.pinType === type) : undefined);
  if (!anchor) return null;
  const paths = await db.select().from(mapPathsTable);
  const ranked = pins.filter(p => p.pinType === "animal" && p.id !== anchor.id)
    .map(p => ({ p, r: planRoute(toPlace(anchor), toPlace(p), paths) }))
    .filter(x => x.r.on_paths)
    .sort((x, y) => x.r.distance_m - y.r.distance_m)
    .slice(0, 3);
  if (ranked.length === 0) return null;
  const residents = await db.select().from(animalsTable).where(inArray(animalsTable.locationId, ranked.map(x => x.p.id)));
  const lines = ranked.map(({ p, r }) => {
    const here = residents.filter(a => a.locationId === p.id).map(a => a.name);
    return `• ${p.name} (${isFil ? `mga ${r.distance_m} metro` : `about ${r.distance_m} m`})${here.length ? `: ${here.join(", ")}` : ""}`;
  });
  rememberPlace(sessionId, ranked[0]!.p.id);
  return {
    reply: isFil
      ? `Ang mga exhibit na pinakamalapit sa ${anchor.name}:\n${lines.join("\n")}\nItanong ang "Paano pumunta doon?" para sa direksyon papunta sa pinakamalapit.`
      : `The exhibits closest to ${anchor.name}:\n${lines.join("\n")}\nAsk "How do I get there?" for directions to the nearest one.`,
    relatedAnimals: residents, relatedPins: ranked.map(x => x.p), location: ranked[0]!.p,
  };
}

// ─── Exhibits: which animals live where ──────────────────────────────────────

/** A word and its singular forms: "aviaries" -> aviary, "reptiles" -> reptile, "foxes" -> fox */
const wordForms = (w: string): string[] => [...new Set([w, w.replace(/ies$/, "y"), w.replace(/es$/, ""), w.replace(/s$/, "")])].filter(f => f.length >= 3);

/** Whether a message word names an exhibit-name word: same word, singular/plural, or a small typo */
function namesExhibitWord(word: string, token: string): boolean {
  const ws = wordForms(word), ts = wordForms(token);
  if (ws.some(w => ts.includes(w))) return true;
  return !NOT_TYPOS.has(word) && ws.some(w => w.length >= 5 && ts.some(t => t.length >= 5 && withinTypos(w, t)));
}

/**
 * The animal exhibits a message names, by the distinctive words of their names, tolerating case,
 * extra words, plurals and typos ("aviaries", "the aviary", "avairy", "reptile house"). Several when
 * they match equally well ("reptile" names both Indoor Reptiles and Outdoor Reptile); empty when none.
 */
async function findExhibits(message: string): Promise<MapPin[]> {
  const pins = insideZoo(await db.select().from(mapPinsTable).where(and(eq(mapPinsTable.pinType, "animal"), eq(mapPinsTable.isActive, true))));
  const words = message.toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  const scored = pins.map(p => {
    const tokens = p.name.toLowerCase().replace(/\(.*?\)/g, "").split(/[^\p{L}]+/u)
      .filter(t => t.length >= 4 && !GENERIC_NAME_WORDS.has(t) && !STOP_WORDS.has(t));
    return { p, score: tokens.filter(t => words.some(w => namesExhibitWord(w, t))).length };
  }).filter(s => s.score > 0);
  const best = Math.max(0, ...scored.map(s => s.score));
  return scored.filter(s => s.score === best).map(s => s.p);
}

/**
 * The answer about an exhibit (or several that match equally): the animals recorded there, from
 * animals.location_id, with a "Show on map" place when the answer is about one exhibit.
 */
async function exhibitReply(places: MapPin[], isFil: boolean, sessionId: string): Promise<Reply> {
  const residentsOf = (place: MapPin) => db.select().from(animalsTable)
    .where(or(eq(animalsTable.locationId, place.id), ...(place.animalId ? [eq(animalsTable.id, place.animalId)] : [])))
    .orderBy(animalsTable.name);
  if (places.length === 1) {
    const place = places[0]!;
    rememberPlace(sessionId, place.id);
    const residents = await residentsOf(place);
    const names = residents.map(r => r.name).join(", ");
    const hint = isFil ? ` Itanong ang "Paano pumunta doon?" para sa direksyon.` : ` Ask "How do I get there?" for walking directions.`;
    // An exhibit on the map whose animals have no profile yet: say so instead of describing them
    const reply = isFil
      ? `Ang ${place.name} ay isang exhibit sa Manila Zoo at nakamarka ito sa mapa.${names ? ` Mga hayop dito: ${names}.` : " Wala pang profile ng hayop para dito sa database."}`
      : `${place.name} is an exhibit in Manila Zoo, marked on the map.${names ? ` Animals here: ${names}.` : " There are no animal profiles for it in the database yet."}`;
    if (residents.length > 1) rememberList(sessionId, residents.map(r => r.id));
    return { reply: reply + hint, relatedAnimals: residents, relatedPins: [place], location: place };
  }
  // Several exhibits match equally ("reptile house"): each with its animals, and no single place to show
  const groups = await Promise.all(places.map(async place => ({ place, residents: await residentsOf(place) })));
  const lines = groups.map(g => `• ${g.place.name}: ${g.residents.length ? g.residents.map(r => r.name).join(", ") : isFil ? "wala pang profile ng hayop" : "no animal profiles yet"}`).join("\n");
  const first = places[0]!.name;
  return {
    reply: isFil
      ? `${places.length} exhibit ang tugma:\n${lines}\nItanong ang "Ano ang nasa ${first}?" o "Paano pumunta sa ${first}?" para sa isa sa kanila.`
      : `${places.length} exhibits match:\n${lines}\nAsk "What's in ${first}?" or "How do I get to ${first}?" about one of them.`,
    relatedAnimals: groups.flatMap(g => g.residents), relatedPins: places,
  };
}

// Questions about what lives in a place: "what's in the aviary", "what are in aviary", "what animals
// are in the aviary", "who lives in the reptile house", "what can I see at the Savannah", "animals in
// the aviary", "ano ang nasa aviary", "sino ang nakatira sa Primates", "mga hayop sa Savannah"
const EXHIBIT_CONTENTS = new RegExp([
  String.raw`\bwhat('?s|\s+is|\s+are)\s+(there\s+)?(in|inside|at)\b`,
  String.raw`\b(what|which)\s+(kinds?\s+of\s+|types?\s+of\s+)?(animals?|species|birds|creatures|reptiles|mammals|primates)\b.{0,30}\b(in|inside|at)\b`,
  String.raw`\bwho\s+(lives?|stays?|is|are)\s+(in|inside|at)\b`,
  String.raw`\bwhat\s+(can|could|will)\s+(i|we|you)\s+(see|find|view)\s+(in|inside|at)\b`,
  String.raw`\b(animals?|residents|species|inhabitants)\s+(that\s+live\s+)?(in|inside|at|of)\b`,
  String.raw`\b(ano|anong|anu-ano|ano-ano)\b.{0,25}\b(nasa|sa\s+loob|makikita\s+sa|meron\s+sa|mayroon\s+sa)\b`,
  String.raw`\bsino\s+(ang\s+)?(mga\s+)?nakatira\b`,
  String.raw`\bmga\s+hayop\s+(sa|nasa)\b`,
].join("|"), "i");
// "Aviary animals", "aviary residents": an exhibit named next to a word for its animals
const ANIMALS_WORD = /\b(animals?|residents|inhabitants|species|hayop)\b/i;
// Details about one animal ("when is feeding at the aviary?"); "lives" and "species" don't count here,
// since "who lives in…" and "what species are in…" ask what is in the exhibit
const ANIMAL_DETAIL_ASPECTS = new Set<Aspect>(["scientific", "feeding", "diet", "fact", "status", "weight", "height", "lifespan", "appearance"]);

/**
 * "What's in [exhibit]?" in any wording: the exhibits named and the reply listing their animals, or
 * null when the message isn't asking what lives in an exhibit (or names none).
 */
async function exhibitContents(message: string, isFil: boolean, sessionId: string): Promise<Reply | null> {
  if (detectAspects(message).some(a => ANIMAL_DETAIL_ASPECTS.has(a))) return null;
  const contents = EXHIBIT_CONTENTS.test(message);
  if (!contents && !ANIMALS_WORD.test(message)) return null;
  const exhibits = await findExhibits(message);
  if (exhibits.length === 0) return null;
  // "Zebra animals", "capybara residents": the exhibit is named after its animal; the exhibit answer
  // still fits. Without a contents question, a named animal that isn't an exhibit's name word wins.
  if (!contents && (await findAnimals(message)).some(a => !exhibits.some(p => p.id === a.locationId))) return null;
  return exhibitReply(exhibits, isFil, sessionId);
}

// Words too common to show that a message and an FAQ question are about the same thing
const FAQ_COMMON = new Set([
  "what", "where", "when", "which", "there", "have", "does", "your", "with", "from", "this", "that", "they", "about",
  "manila", "inside", "available", "allowed", "much", "many", "some", "anong", "saan", "paano", "pwede", "puwede",
  "meron", "mayroon", "naman", "kayo", "ninyo", "dito", "zoo's", "visit", "visitors",
]);
const faqWords = (s: string) => new Set(
  s.toLowerCase().replace(/[^\p{L}\s']/gu, " ").split(/\s+/)
    .filter(w => w.length >= 4 && !FAQ_COMMON.has(w) && !STOP_WORDS.has(w))
    .map(w => w.replace(/(es|s)$/, "")),
);

/**
 * The FAQ answer to a message, when it shares a distinctive word with an FAQ question
 * ("Do you have wheelchairs?" -> "Are wheelchairs available?"). Prefers the message's language.
 */
async function findFaq(message: string, language: string): Promise<string | null> {
  const asked = faqWords(message);
  if (asked.size === 0) return null;
  const faqs = await db.select().from(faqTable).where(eq(faqTable.isActive, true));
  let best: { answer: string; score: number } | null = null;
  for (const f of faqs) {
    const shared = [...faqWords(f.question)].filter(w => asked.has(w)).length;
    if (shared === 0) continue;
    const score = shared * 2 + (f.language === language ? 1 : 0);
    if (!best || score > best.score) best = { answer: f.answer, score };
  }
  return best?.answer ?? null;
}

// An explicit request for the collection: "what animals are there?", "list all animals", "which
// animals are endangered?", "anong mga hayop ang meron?". A message that merely contains the word
// "animal" ("the largest animal in the world") is not one.
const LIST_REQUEST = /\b(what|which)\s+(kinds?\s+of\s+|types?\s+of\s+)?(animals|birds|mammals|reptiles)\b|\b(list|show|tell me|name|see)\b.*\b(animals|species|birds|mammals|reptiles)\b|\ball\s+(the\s+|of\s+the\s+)?(animals?\s+species|species|animals|birds|mammals|reptiles)\b|\b(animals|birds|mammals|reptiles)\s+(are there|are here|can i see|do you have|in (the )?(manila )?zoo)\b|\b(ano|anong|ano ang|anu-anong|lahat ng|ilista)\s+(ang\s+)?(mga\s+)?(hayop|ibon|reptilya)\b|\bmga (hayop|ibon)\b.*\b(meron|mayroon|makikita)\b/i;
const LIST_FILTERS: { re: RegExp; label: [string, string]; noun?: boolean; keep: (a: { conservationStatus: string | null; category: string | null }) => boolean }[] = [
  { re: /critically endangered/i, label: ["critically endangered", "critically endangered"], keep: a => /critically endangered/i.test(a.conservationStatus ?? "") },
  { re: /endangered|nanganganib/i, label: ["endangered or critically endangered", "endangered o critically endangered"], keep: a => /endangered/i.test(a.conservationStatus ?? "") },
  { re: /vulnerable/i, label: ["vulnerable", "vulnerable"], keep: a => /vulnerable/i.test(a.conservationStatus ?? "") },
  { re: /\bbirds?\b|\bibon\b/i, label: ["birds", "ibon"], noun: true, keep: a => a.category === "Birds" },
  { re: /\bmammals?\b/i, label: ["mammals", "mammal"], noun: true, keep: a => a.category === "Mammals" },
  { re: /\breptiles?\b|reptilya/i, label: ["reptiles", "reptilya"], noun: true, keep: a => a.category === "Reptiles" },
];

/** The animals in the database (all, or those matching what was asked), or null if the message isn't asking for a list. */
async function listAnimals(message: string, isFil: boolean) {
  if (!LIST_REQUEST.test(message) || SUPERLATIVE.test(message)) return null;
  const rows = await db.select({ a: animalsTable, category: categoriesTable.name }).from(animalsTable)
    .leftJoin(categoriesTable, eq(animalsTable.categoryId, categoriesTable.id)).orderBy(animalsTable.name);
  if (rows.length === 0) return null;
  const filter = LIST_FILTERS.find(f => f.re.test(message));
  const chosen = filter ? rows.filter(r => filter.keep({ conservationStatus: r.a.conservationStatus, category: r.category })) : rows;
  const what = filter ? (isFil ? filter.label[1] : filter.label[0]) : null;
  if (chosen.length === 0) {
    return { reply: isFil ? `Walang ${filter!.noun ? what : `${what} na hayop`} na nakatala sa database ng Manila Zoo.` : `There are no ${filter!.noun ? what : `${what} animals`} recorded in the Manila Zoo database.`, relatedAnimals: [], relatedPins: [] };
  }
  const list = chosen.map(r => `• ${r.a.name}${filter && /endangered|vulnerable/i.test(what!) ? ` (${r.a.conservationStatus})` : ""}`).join("\n");
  return {
    reply: isFil
      ? `Narito ang ${chosen.length} ${!what ? "hayop" : filter!.noun ? what : `${what} na hayop`} sa database ng Manila Zoo:\n${list}`
      : `Here are the ${chosen.length} ${!what ? "animals" : filter!.noun ? what : `${what} animals`} in the Manila Zoo database:\n${list}`,
    relatedAnimals: chosen.map(r => r.a),
    relatedPins: [],
  };
}

/** "Where can I see birds / reptiles / mammals?": each exhibit with the animals of that kind recorded there. */
async function kindLocations(message: string, isFil: boolean): Promise<Reply | null> {
  const filter = LIST_FILTERS.find(f => f.noun && f.re.test(message));
  if (!filter) return null;
  const rows = await db.select({ a: animalsTable, category: categoriesTable.name, pin: mapPinsTable }).from(animalsTable)
    .leftJoin(categoriesTable, eq(animalsTable.categoryId, categoriesTable.id))
    .leftJoin(mapPinsTable, eq(animalsTable.locationId, mapPinsTable.id));
  const chosen = rows.filter(r => r.pin && filter.keep({ conservationStatus: r.a.conservationStatus, category: r.category }));
  if (chosen.length === 0) return null;
  const byPin = new Map<number, { pin: MapPin; names: string[] }>();
  for (const r of chosen) {
    const entry = byPin.get(r.pin!.id) ?? { pin: r.pin!, names: [] };
    entry.names.push(r.a.name);
    byPin.set(r.pin!.id, entry);
  }
  const groups = [...byPin.values()].sort((x, y) => y.names.length - x.names.length);
  const what = isFil ? filter.label[1] : filter.label[0];
  const lines = groups.map(g => `• ${g.pin.name}: ${g.names.join(", ")}`).join("\n");
  return {
    reply: isFil
      ? `Makikita ang mga ${what} sa mga exhibit na ito:\n${lines}\nItanong ang "Paano pumunta sa ${groups[0]!.pin.name}?" para sa direksyon.`
      : `You can see ${what} in these exhibits:\n${lines}\nAsk "How do I get to ${groups[0]!.pin.name}?" for walking directions.`,
    relatedAnimals: chosen.map(r => r.a), relatedPins: groups.map(g => g.pin),
  };
}

// ─── Directions ──────────────────────────────────────────────────────────────

// "Where is the nearest restroom?" style questions map to a pin type
const PLACE_TYPES: [RegExp, string][] = [
  [/restroom|comfort ?ro{1,2}m|\bc\.?r\.?(?=\s|$|\?)|toilet|banyo|palikuran|kubeta|\bpee\b|\bihi\b|\bwashroom\b|\blavatory\b/i, "restroom"],
  [/first aid|clinic|medical|doctor|nurse|infirmary|klinika/i, "emergency"],
  [/\bfood\b|\beat\b|kain|snack|canteen|merienda|\bdrinks?\b|inumin|restaurant|\bwater\b|\btubig\b/i, "food_stall"],
  [/\bexit\b|labasan|palabas|\bget out\b|lumabas/i, "exit"],
  [/entrance|pasukan|main gate/i, "entrance"],
];
// Words in pin names too generic to identify a specific place
// ("Philippine Eagle" is a place, but "the Philippines" is not)
const GENERIC_NAME_WORDS = new Set(["main", "south", "north", "east", "west", "house", "center", "centre", "area", "section", "station", "stall", "restroom", "entrance", "exit", "food", "first", "zoo", "philippine", "philippines"]);
// "Where is…" phrasing, to catch location questions the model misclassifies
const HABITAT_WHERE = /\bwhere\s+(do|does|did)\b.*\b(live|lives|come from)\b|\bsaan\b.*\b(nakatira|naninirahan|tirahan|galing)\b|\b(nakatira|tirahan)\b.*\bsaan\b/i;
const WHERE_QUESTION =/\bwhere\b|how (do|can) i get|\b(na)?saan\b|paano (pumunta|makarating)/i;
const ACCESSIBLE_WORDS = /wheelchair|stroller|accessible|\bpwd\b|walang hagdan/i;

// Where directions start: a map pin, or the visitor's own position (id -1, no pin type)
type Start = RoutePlace & { pinType: string | null };

async function findDestination(message: string, pins: MapPin[], start: Start): Promise<MapPin | undefined> {
  // A place named in full ("food court", "plaza restaurant") beats "the nearest food place"
  const text = ` ${message.toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ")} `;
  const named = pins
    .map(p => ({ p, name: p.name.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim() }))
    .filter(({ p, name }) => name.includes(" ") && p.id !== start.id && text.includes(` ${name} `))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (named) return named.p;
  const type = PLACE_TYPES.find(([re]) => re.test(message))?.[1];
  if (type) {
    // Nearest pin of that type to where the visitor is; a zoo without a separate exit
    // lets visitors leave through the entrance
    const ofType = (t: string) => pins.filter(p => p.pinType === t && p.id !== start.id);
    const wanted = type === "exit" && !pins.some(p => p.pinType === "exit") ? "entrance" : type;
    let candidates = ofType(wanted);
    // The visitor may already be at the only one (e.g. asking for the exit from the entrance)
    if (candidates.length === 0 && start.pinType === wanted) candidates = pins.filter(p => p.id === start.id);
    // Nearest by walking distance along the walkways (same ranking as the map's "find nearest")
    const paths = await db.select().from(mapPathsTable);
    const walk = new Map(candidates.map(p => [p.id, planRoute(start, toPlace(p), paths)]));
    const rank = (p: MapPin) => routeRank(walk.get(p.id)!);
    const nearest = candidates.sort((a, b) => rank(a) - rank(b))[0];
    if (nearest) return nearest;
  }
  // "The nearest exhibit": the closest animal exhibit by walking distance
  if (NEAREST.test(message) && /\bexhibits?\b|\banimals?\b|\bhayop\b/i.test(message)) {
    const paths = await db.select().from(mapPathsTable);
    const exhibits = pins.filter(p => p.pinType === "animal" && p.id !== start.id);
    const dist = (p: MapPin) => routeRank(planRoute(start, toPlace(p), paths));
    const nearest = exhibits.sort((a, b) => dist(a) - dist(b))[0];
    if (nearest) return nearest;
  }
  const animal = (await findAnimals(message))[0];
  if (animal) {
    const pin = pins.find(p => p.id === animal.locationId) ?? pins.find(p => p.animalId === animal.id);
    if (pin) return pin;
  }
  return namedPin(message, pins);
}

const NEAREST = /\b(nearest|closest|near me|pinakamalapit)\b/i;

/** A map place the message names by the distinctive words of its name ("aviary", "indoor reptiles"). */
function namedPin(message: string, pins: MapPin[]): MapPin | undefined {
  const text = ` ${message.toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ")} `;
  const full = pins
    .map(p => ({ p, name: p.name.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim() }))
    .filter(({ name }) => name.length >= 4 && text.includes(` ${name} `))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (full) return full.p;
  const words = text.trim().split(/\s+/);
  let best: { pin: MapPin; score: number } | undefined;
  for (const pin of pins) {
    const tokens = pin.name.toLowerCase().split(/[^\p{L}]+/u).filter(t => t.length >= 4 && !GENERIC_NAME_WORDS.has(t));
    const score = tokens.filter(t => words.some(w => w.startsWith(t) || t.startsWith(w) && w.length >= 4)).length;
    if (score > 0 && (!best || score > best.score)) best = { pin, score };
  }
  return best?.pin;
}

type ChatContext = { animalId?: number | null; lat?: number | null; lng?: number | null };

/**
 * Splits "from A to B" questions into the start and destination parts, in English and Filipino:
 * "from the Aviary to Indoor Reptiles", "to the lion from the Aviary",
 * "mula sa Aviary papunta sa Savana", "papunta sa leon galing sa Aviary". Null when there's no "from".
 */
function splitFromTo(message: string): { from: string; to: string } | null {
  const patterns: [RegExp, "fromFirst" | "toFirst"][] = [
    [/\bfrom\s+(?:the\s+)?(.+?)\s+(?:to|going to|towards?)\s+(?:the\s+)?(.+)/i, "fromFirst"],
    [/\bto\s+(?:the\s+)?(.+?)\s+from\s+(?:the\s+)?(.+)/i, "toFirst"],
    [/\b(?:mula|galing)\s+(?:sa\s+)?(.+?)\s+(?:papunta|papuntang|hanggang)\s+(?:sa\s+)?(.+)/i, "fromFirst"],
    [/\b(?:papunta|papuntang)\s+(?:sa\s+)?(.+?)\s+(?:mula|galing)\s+(?:sa\s+)?(.+)/i, "toFirst"],
  ];
  for (const [re, order] of patterns) {
    const m = message.match(re);
    if (m) return order === "fromFirst" ? { from: m[1]!, to: m[2]! } : { from: m[2]!, to: m[1]! };
  }
  return null;
}

/**
 * Plans a walking route for a directions request; null when no destination can be identified.
 * Starts from the visitor's position (GPS, a spot picked on the map, or a scanned QR code) when the
 * app sends one, else the exhibit of the last scanned animal. Only when neither is known does it
 * start at the main entrance, and then `fromEntrance` is set so the reply can say so. "How do I get
 * there?" goes to the place (or animal's exhibit) the chat was just about, when `sessionId` is given.
 */
async function planChatRoute(message: string, lang: string, ctx: ChatContext, sessionId?: string): Promise<{ route: WalkingRoute; fromEntrance: boolean } | null> {
  const pins = insideZoo(await db.select().from(mapPinsTable).where(eq(mapPinsTable.isActive, true)));
  if (pins.length === 0) return null;
  const asStart = (p: MapPin): Start => ({ ...toPlace(p), pinType: p.pinType });

  let start: Start | undefined;
  if (ctx.lat != null && ctx.lng != null && metresOutsideZoo(ctx.lat, ctx.lng) <= ZOO_EDGE_TOLERANCE_M) {
    start = { id: -1, name: lang === "fil" ? "iyong lokasyon" : "your location", lat: ctx.lat, lng: ctx.lng, pinType: null };
  }
  if (!start && ctx.animalId) {
    const [animal] = await db.select().from(animalsTable).where(eq(animalsTable.id, ctx.animalId));
    const pin = animal && (pins.find(p => p.id === animal.locationId) ?? pins.find(p => p.animalId === animal.id));
    if (pin) start = asStart(pin);
  }
  // "From the Aviary to …": a starting place the visitor names beats their GPS or last scan
  const fromTo = splitFromTo(message);
  let destText = message;
  if (fromTo) {
    const named = await findDestination(fromTo.from, pins, start ?? asStart(pins[0]!));
    if (named) {
      start = asStart(named);
      destText = fromTo.to;
    }
  }
  const fromEntrance = !start;
  start ??= asStart(pins.find(p => p.pinType === "entrance") ?? pins[0]!);

  let dest = await findDestination(destText, pins, start);
  // "How do I get there?", "Take me there", "Directions please": the place just talked about
  if (!dest && sessionId && (THERE.test(destText) || destText.trim().split(/\s+/).length <= 4)) {
    const placeId = recalledPlaceId(sessionId);
    dest = pins.find(p => p.id === placeId);
    if (!dest) {
      const animalId = recalledAnimalId(sessionId);
      dest = animalId ? pins.find(p => p.animalId === animalId) : undefined;
    }
  }
  if (!dest) return null;

  const paths = await db.select().from(mapPathsTable);
  const accessibleOnly = ACCESSIBLE_WORDS.test(message);
  const route = planRoute(start, toPlace(dest), paths, { accessibleOnly, lang });
  if (accessibleOnly && !route.on_paths) {
    // No fully accessible route: fall back to any route and say so in the reply
    const any = planRoute(start, toPlace(dest), paths, { lang });
    if (any.on_paths) return { fromEntrance, route: { ...any, accessible_only: false, steps: [...any.steps, lang === "fil"
      ? "Paalala: Walang nakitang rutang ganap na pang-wheelchair, kaya maaaring may hagdan o baku-bakong daan ang rutang ito."
      : "Note: I couldn't find a fully wheelchair-accessible route, so this one may include steps or rough paths."] } };
  }
  return { route, fromEntrance };
}

function formatRoute(route: WalkingRoute, lang: string): string {
  const isFil = lang === "fil";
  if (!route.on_paths) return route.steps.join(" ");
  const header = isFil
    ? `Ganito pumunta sa ${route.to_name} mula sa ${route.from_name} (mga ${route.distance_m} metro, ${route.walk_minutes} minutong lakad):`
    : `Here's how to get to ${route.to_name} from ${route.from_name} (about ${route.distance_m} m, ${route.walk_minutes}-minute walk):`;
  const note = route.accessible_only
    ? (isFil ? "\nGumagamit lamang ang rutang ito ng mga daanang pang-wheelchair." : "\nThis route uses wheelchair-accessible walkways only.")
    : "";
  return `${header}\n${route.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}${note}`;
}

/**
 * Ticket prices from the Ticket Prices dataset: only published, verified prices in effect today.
 * Without any, the chatbot says prices need verification instead of guessing.
 */
async function ticketsAnswer(isFil: boolean): Promise<string> {
  const prices = await currentTicketPrices();
  if (prices.length === 0) {
    return isFil
      ? "Wala pang beripikadong presyo ng tiket sa system sa ngayon. Kumpirmahin ang presyo sa Manila Zoo (manilazoo@manila.gov.ph o sa Info Desk)."
      : "There are no verified ticket prices in the system right now. Please confirm prices with Manila Zoo (manilazoo@manila.gov.ph or the Info Desk).";
  }
  const peso = (p: { price: string | null; is_free: boolean }) => (p.is_free ? (isFil ? "Libre" : "Free") : `₱${Number(p.price).toLocaleString("en-PH")}`);
  const FIL_TYPES: Record<string, string> = { "Manila resident": "residente ng Maynila", "Non-Manila resident": "hindi residente ng Maynila", "All visitors": "lahat" };
  const EN_TYPES: Record<string, string> = { "Manila resident": "Manila residents", "Non-Manila resident": "non-Manila residents", "All visitors": "all visitors" };
  const typeLabel = (t: string) => (isFil ? FIL_TYPES : EN_TYPES)[t] ?? t;
  const byCategory = new Map<string, typeof prices>();
  for (const p of prices) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p]);
  const lines = [...byCategory.entries()].map(([cat, ps]) => {
    const amounts = ps.map(p => (ps.length === 1 && p.visitor_type === "All visitors" ? peso(p) : `${peso(p)} (${typeLabel(p.visitor_type)})`)).join(" / ");
    return `• ${cat}: ${amounts}${ps[0]!.notes ? ` — ${ps[0]!.notes}` : ""}`;
  });
  const verified = prices.map(p => String(p.verified_at)).sort().at(-1);
  return (isFil ? "Presyo ng pagpasok sa Manila Zoo:\n" : "Manila Zoo admission rates:\n") + lines.join("\n") +
    (isFil ? `\nMagpakita ng valid ID sa pasukan kung may diskwento. (Huling beripikasyon: ${verified})`
           : `\nDiscounted visitors must show a valid ID at the entrance. (Last verified: ${verified})`);
}

/** Walking directions as a reply, saying so when they start at the Main Entrance because the visitor's position is unknown. */
function directionsReply(planned: { route: WalkingRoute; fromEntrance: boolean }, lang: string): string {
  let directions = formatRoute(planned.route, lang);
  // Never pretend to know where the visitor is
  if (planned.fromEntrance) directions += lang === "fil"
    ? "\n(Mula ito sa Main Entrance dahil hindi ko alam kung nasaan ka. Pindutin ang \"Aking lokasyon\" sa Mapa o mag-scan ng QR code para sa direksyon mula sa kinaroroonan mo.)"
    : "\n(These start at the Main Entrance because I don't know where you are. Tap \"My location\" on the Map or scan a QR code for directions from where you're standing.)";
  return directions;
}

/**
 * Where an animal or exhibit is: the exhibit it lives in (or the place named), with no walking
 * directions; the visitor can ask "How do I get there?" next. A follow-up ("Where can I find it?")
 * is about the animal or place the chat was just about.
 */
async function locationReply(message: string, isFil: boolean, sessionId: string, ctx: ChatContext): Promise<Reply> {
  const hits = await animalsFor(message, sessionId, true);
  if (hits.length > 0) return animalReply(message, hits, isFil, sessionId, ["location"]);

  const pins = insideZoo(await db.select().from(mapPinsTable).where(eq(mapPinsTable.isActive, true)));
  // "What animals can I see near the entrance?": the closest exhibits to that place, by walking distance
  const nearby = await exhibitsNear(message, pins, isFil, sessionId);
  if (nearby) return nearby;
  // "Where are the reptiles?" asks for every exhibit with reptiles, unless an exhibit is named in full ("Indoor Reptiles")
  const text = ` ${message.toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ")} `;
  const namesPinInFull = pins.some(p => text.includes(` ${p.name.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim()} `));
  if (!namesPinInFull) {
    const kinds = await kindLocations(message, isFil);
    if (kinds) return kinds;
  }
  // "What's in the aviary?", "aviary animals": the exhibit and the animals recorded there
  const contents = await exhibitContents(message, isFil, sessionId);
  if (contents) return contents;
  let place = namedPin(message, pins);
  // "The nearest exhibit": closest by walking distance from the visitor, who must be located
  if (!place && NEAREST.test(message)) {
    if (ctx.lat == null || ctx.lng == null) {
      return { reply: isFil ? "Hindi ko alam kung nasaan ka. Pindutin ang \"Aking lokasyon\" sa Mapa o mag-scan ng QR code, saka itanong ulit." : "I don't know where you are yet. Tap \"My location\" on the Map or scan a QR code, then ask again.", relatedAnimals: [], relatedPins: [] };
    }
    const planned = await planChatRoute(message, isFil ? "fil" : "en", ctx);
    place = planned ? pins.find(p => p.id === planned.route.to_pin_id) : undefined;
  }
  if (!place && THERE.test(message)) place = pins.find(p => p.id === recalledPlaceId(sessionId));
  if (place) {
    if (place.pinType === "animal") return exhibitReply([place], isFil, sessionId);
    rememberPlace(sessionId, place.id);
    const hint = isFil ? ` Itanong ang "Paano pumunta doon?" para sa direksyon.` : ` Ask "How do I get there?" for walking directions.`;
    return { reply: (isFil ? `Ang ${place.name} ay nakamarka sa mapa ng Manila Zoo.` : `${place.name} is marked on the Manila Zoo map.`) + hint, relatedAnimals: [], relatedPins: [place], location: place };
  }
  // "Which one is venomous?": a trait the database doesn't record
  if (ATTRIBUTE.test(message)) return { reply: isFil ? MISSING.fil : MISSING.en, relatedAnimals: [], relatedPins: [] };
  // An animal the zoo doesn't have ("Where is the giraffe?")
  const unknown = unknownAnimalWords(message);
  if (unknown) {
    return {
      reply: isFil
        ? `Paumanhin, wala akong nakitang "${unknown}" sa database ng Manila Zoo. Tingnan ang Animals page para sa kumpletong listahan.`
        : `Sorry, I couldn't find "${unknown}" in the Manila Zoo database. See the Animals page for the full list.`,
      relatedAnimals: [], relatedPins: [],
    };
  }
  return { reply: isFil ? "Aling hayop o lugar ang hinahanap mo? Halimbawa: \"Saan ang leon?\"" : "Which animal or place are you looking for? For example: \"Where is the lion?\"", relatedAnimals: [], relatedPins: [] };
}

async function generateReply(message: string, intent: string, language: string, sessionId: string, ctx: ChatContext): Promise<Reply> {
  const isFil = language === "fil";

  switch (intent) {
    case "out_of_scope":
      return { reply: isFil ? OUT_OF_SCOPE.fil : OUT_OF_SCOPE.en, relatedAnimals: [], relatedPins: [] };

    case "animal_location":
      return locationReply(message, isFil, sessionId, ctx);
    case "greeting":
      return { reply: isFil ? "Magandang araw! Ako si ZooBot, ang inyong gabay sa Manila Zoo. Paano ko kayo matutulungan ngayon?" : "Welcome to Manila Zoo! I'm ZooBot, your virtual guide. How can I help you today?", relatedAnimals: [], relatedPins: [] };

    case "zoo_hours":
      return { reply: isFil ? HOURS_ANSWER.fil : HOURS_ANSWER.en, relatedAnimals: [], relatedPins: [] };

    case "tickets":
      return { reply: await ticketsAnswer(isFil), relatedAnimals: [], relatedPins: [] };

    case "navigation": {
      // Walking directions over the mapped walkways, from where the visitor is when that's known
      const planned = await planChatRoute(message, language, ctx, sessionId);
      if (!planned) {
        return { reply: isFil ? "Saan mo gustong pumunta? Halimbawa: \"Paano pumunta sa Aviary?\"" : "Where would you like to go? For example: \"How do I get to the Aviary?\"", relatedAnimals: [], relatedPins: [] };
      }
      const [dest] = await db.select().from(mapPinsTable).where(eq(mapPinsTable.id, planned.route.to_pin_id));
      if (dest) rememberPlace(sessionId, dest.id);
      return { reply: directionsReply(planned, language), relatedAnimals: [], relatedPins: dest ? [dest] : [], route: planned.route, location: dest ?? null };
    }

    case "animal_info": {
      // "What reptiles do you have?" asks for the list, not where they are
      if (LIST_REQUEST.test(message) && (await findAnimals(message)).length === 0) {
        const collection = await listAnimals(message, isFil);
        if (collection) return collection;
      }
      // "Which exhibit is the lion in?" asks only where it is
      if (detectAspects(message).every(a => a === "location")) return locationReply(message, isFil, sessionId, ctx);
      const hits = await animalsFor(message, sessionId, true);
      if (hits.length > 0) return animalReply(message, hits, isFil, sessionId);
      // No particular animal named: "What animals are there?" gets the whole collection
      const collection = await listAnimals(message, isFil);
      if (collection) return collection;
      // No animal by that name, but an exhibit ("Tell me about the aviary"): the exhibit and the animals
      // recorded there. "Not available" is only for messages that name neither an animal nor an exhibit.
      const exhibits = await findExhibits(message);
      if (exhibits.length > 0) {
        const answer = await exhibitReply(exhibits, isFil, sessionId);
        // A per-animal detail asked about a whole exhibit ("When is feeding at the aviary?"): exhibits
        // have no such record, so say so, and list the animals the visitor can ask about instead
        if (detectAspects(message).some(a => ANIMAL_DETAIL_ASPECTS.has(a))) {
          answer.reply = `${isFil ? MISSING.fil : MISSING.en} ${isFil ? "Itanong ito tungkol sa isang hayop sa exhibit." : "Ask about one of the exhibit's animals instead."}\n${answer.reply}`;
        }
        return answer;
      }
      // A detail about an animal that isn't in the database ("the habitat of the unicorn")
      const unknown = unknownAnimalWords(message);
      if (asksForDetail(message) && unknown) {
        return {
          reply: isFil
            ? `Paumanhin, wala akong nakitang hayop na "${unknown}" sa database ng Manila Zoo. Pakisuri ang pangalan, o tingnan ang Animals page para sa kumpletong listahan.`
            : `Sorry, I couldn't find an animal called "${unknown}" in the Manila Zoo database. Please check the name, or see the Animals page for the full list.`,
          relatedAnimals: [], relatedPins: [],
        };
      }
      // "The habitat of an unknown animal": no record to answer from
      if (asksForDetail(message) && /\b(an|any|some|unknown|that)\s+(\w+\s+)?(animal|hayop)\b/i.test(message)) {
        return {
          reply: isFil
            ? "Paumanhin, hindi ko mahanap ang hayop na iyon sa database ng Manila Zoo. Pakisabi ang pangalan ng hayop, o tingnan ang Animals page para sa kumpletong listahan."
            : "Sorry, I couldn't find that animal in the Manila Zoo database. Please tell me the animal's name, or see the Animals page for the full list.",
          relatedAnimals: [], relatedPins: [],
        };
      }
      // A detail asked without saying which animal ("Habitat?") and nothing to follow up on
      if (asksForDetail(message)) {
        return { reply: isFil ? "Aling hayop ang tinutukoy mo? Halimbawa: \"Ano ang tirahan ng leon?\"" : "Which animal do you mean? For example: \"What is the habitat of the lion?\"", relatedAnimals: [], relatedPins: [] };
      }
      return { reply: isFil ? "Paumanhin, wala akong nakitang ganoong hayop sa database ng Manila Zoo. Tingnan ang Animals page para sa kumpletong listahan." : "Sorry, I couldn't find that animal in the Manila Zoo database. See the Animals page for the full list.", relatedAnimals: [], relatedPins: [] };
    }

    case "emergency": {
      const emergencyPins = insideZoo(await db.select().from(mapPinsTable).where(and(eq(mapPinsTable.pinType, "emergency"), eq(mapPinsTable.isActive, true))));
      // Name the first-aid places that are actually on the map
      const places = emergencyPins.map(p => p.name).join(", ");
      const reply = isFil
        ? `Para sa emergency, makipag-ugnayan agad sa zoo security sa +63 2 8525-7275, o lumapit sa pinakamalapit na tauhan ng zoo.${places ? ` First aid: ${places}.` : ""}`
        : `For emergencies, contact zoo security at +63 2 8525-7275, or ask the nearest zoo staff member.${places ? ` First aid: ${places}.` : ""}`;
      // "Where is first aid?": the hotline first, then the way to the nearest first-aid station
      const planned = PLACE_TYPES.some(([re, type]) => type === "emergency" && re.test(message)) ? await planChatRoute(message, language, ctx) : null;
      if (planned) return { reply: `${reply}\n\n${directionsReply(planned, language)}`, relatedAnimals: [], relatedPins: emergencyPins, route: planned.route };
      return { reply, relatedAnimals: [], relatedPins: emergencyPins };
    }

    case "facilities": {
      // A specific facility question the FAQ answers ("Do you have wheelchairs?")
      const faq = await findFaq(message, language);
      if (faq) return { reply: faq, relatedAnimals: [], relatedPins: [] };
      // The places of the kind asked about (restrooms, food…) that are on the map; when no kind is
      // named, ask which one rather than assume restrooms
      const kind = PLACE_TYPES.find(([re]) => re.test(message))?.[1];
      if (!kind) {
        return {
          reply: isFil
            ? "Anong pasilidad ang hinahanap mo? Halimbawa: CR, kainan, first aid o ang labasan."
            : "Which facility are you looking for? For example: a restroom, food, first aid or the exit.",
          relatedAnimals: [], relatedPins: [],
        };
      }
      const facilityPins = insideZoo(await db.select().from(mapPinsTable).where(and(eq(mapPinsTable.pinType, kind), eq(mapPinsTable.isActive, true))));
      const label = ({ restroom: ["Restrooms", "Mga CR"], food_stall: ["Food places", "Mga kainan"], emergency: ["First aid", "First aid"], exit: ["Exits", "Mga labasan"], entrance: ["Entrances", "Mga pasukan"] } as Record<string, [string, string]>)[kind] ?? ["Places", "Mga lugar"];
      if (facilityPins.length === 0 && kind === "exit") {
        // The map has no separate exit: visitors leave the way they came in
        const gates = insideZoo(await db.select().from(mapPinsTable).where(and(eq(mapPinsTable.pinType, "entrance"), eq(mapPinsTable.isActive, true))));
        if (gates.length > 0) {
          rememberPlace(sessionId, gates[0]!.id);
          const names = gates.map(g => g.name).join(", ");
          return {
            reply: isFil
              ? `Walang hiwalay na labasan sa mapa; lumalabas ang mga bisita sa ${names}. Itanong ang "Paano pumunta doon?" para sa direksyon.`
              : `There's no separate exit on the map; visitors leave through the ${names}. Ask "How do I get there?" for walking directions.`,
            relatedAnimals: [], relatedPins: gates, location: gates[0]!,
          };
        }
      }
      if (facilityPins.length === 0) return { reply: isFil ? MISSING.fil : MISSING.en, relatedAnimals: [], relatedPins: [] };
      // Near the visitor, or near an animal they name ("a restroom near the zebra"): the closest one by
      // walking distance, without walking steps (those come with "How do I get there?")
      const allPins = insideZoo(await db.select().from(mapPinsTable).where(eq(mapPinsTable.isActive, true)));
      const named = (await findAnimals(message))[0];
      const namedHome = named ? allPins.find(p => p.id === named.locationId) ?? allPins.find(p => p.animalId === named.id) : undefined;
      const from: RoutePlace | null = namedHome ? toPlace(namedHome)
        : ctx.lat != null && ctx.lng != null && metresOutsideZoo(ctx.lat, ctx.lng) <= ZOO_EDGE_TOLERANCE_M ? { id: -1, name: "you", lat: ctx.lat, lng: ctx.lng } : null;
      if (from) {
        const paths = await db.select().from(mapPathsTable);
        const ranked = facilityPins.map(p => ({ p, r: planRoute(from, toPlace(p), paths) })).sort((a, b) => routeRank(a.r) - routeRank(b.r));
        const { p, r } = ranked[0]!;
        rememberPlace(sessionId, p.id);
        const near = namedHome ? namedHome.name : null;
        const what = isFil ? label[1].replace(/^Mga /, "") : label[0].replace(/s$/, "").toLowerCase();
        const reply = isFil
          ? `Ang pinakamalapit na ${what} ${near ? `sa ${near}` : "sa iyo"} ay ang ${p.name}${r.on_paths ? `, mga ${r.distance_m} metro` : ""}. Itanong ang "Paano pumunta doon?" para sa direksyon.`
          : `The nearest ${what} ${near ? `to ${near}` : "to you"} is ${p.name}${r.on_paths ? `, about ${r.distance_m} m away` : ""}. Ask "How do I get there?" for walking directions.`;
        return { reply, relatedAnimals: [], relatedPins: [p], location: p };
      }
      // "The nearest restroom" without knowing where the visitor is: list them all and say how to get the nearest
      const unknownPosition = NEAREST.test(message)
        ? (isFil ? "\nHindi ko pa alam kung nasaan ka. Pindutin ang \"Aking lokasyon\" sa Mapa o mag-scan ng QR code, saka itanong ulit para malaman ang pinakamalapit."
                 : "\nI don't know where you are yet. Tap \"My location\" on the Map or scan a QR code, then ask again to get the nearest one.")
        : "";
      return { reply: `${isFil ? label[1] : label[0]}: ${facilityPins.map(p => p.name).join(", ")}.${unknownPosition}`, relatedAnimals: [], relatedPins: facilityPins };
    }

    case "parking": {
      // The parking answer comes from the FAQ (the zoo's published information)
      const faq = await findFaq(message, language) ?? await findFaq("parking available", "en");
      return { reply: faq ?? (isFil ? MISSING.fil : MISSING.en), relatedAnimals: [], relatedPins: [] };
    }

    case "events": {
      // "When is the lion's feeding time?" is about that animal, not the events calendar
      if (/feed|pakain/i.test(message)) {
        const fed = await animalsFor(message, sessionId, true);
        if (fed.length > 0) return animalReply(message, fed, isFil, sessionId);
      }
      // Only events that haven't ended yet, soonest first
      const now = new Date();
      // Published events whose publish time has come; cancelled ones are listed as cancelled
      const upcoming = (await db.select().from(eventsTable).where(inArray(eventsTable.status, ["published", "cancelled"])))
        .filter(e => (!e.publishAt || e.publishAt <= now) && (e.endDate ?? e.startDate ?? now) >= now)
        .sort((x, y) => (x.startDate?.getTime() ?? 0) - (y.startDate?.getTime() ?? 0))
        .slice(0, 3);
      const when = (d: Date | null) => d
        ? ` (${d.toLocaleString(isFil ? "fil-PH" : "en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })})`
        : "";
      const list = upcoming.map(e => `• ${e.title}${when(e.startDate)}${e.status === "cancelled" ? (isFil ? " — KANSELADO" : " — CANCELLED") : ""}`).join("\n");
      return {
        reply: isFil
          ? (list ? `Mga paparating na kaganapan:\n${list}\nTingnan ang Events page para sa detalye.` : "Wala pang nakatakdang kaganapan sa ngayon. Tingnan ang Events page para sa mga balita at mga laro.")
          : (list ? `Upcoming events:\n${list}\nSee the Events page for details.` : "There are no upcoming events scheduled right now. Check the Events page for news and games."),
        relatedAnimals: [], relatedPins: [],
      };
    }

    default: {
      // A detail about a named animal ("the lion's habitat") is answered from its record, before any FAQ
      if (asksForDetail(message)) {
        const about = await animalsFor(message, sessionId, true);
        if (about.length > 0) return animalReply(message, about, isFil, sessionId);
      }
      const faq = await findFaq(message, language);
      if (faq) return { reply: faq, relatedAnimals: [], relatedPins: [] };
      // A question naming one of the zoo's animals that the model didn't label as animal_info ("Ano ang sawa?")
      const named = await animalsFor(message, sessionId, true);
      if (named.length > 0) return animalReply(message, named, isFil, sessionId);
      const collection = await listAnimals(message, isFil);
      if (collection) return collection;
      if (ATTRIBUTE.test(message)) return { reply: isFil ? MISSING.fil : MISSING.en, relatedAnimals: [], relatedPins: [] };
      // A few words that match nothing and aren't a question ("asdfgh", "hmm", "ok"): ask what they mean
      // instead of claiming the database lacks it. "Is there wifi?" is a real question: not available.
      if (message.trim().split(/\s+/).length <= 3 && !QUESTION_WORDS.test(message)) return { reply: isFil ? UNCLEAR.fil : UNCLEAR.en, relatedAnimals: [], relatedPins: [] };
      return { reply: isFil ? MISSING.fil : MISSING.en, relatedAnimals: [], relatedPins: [] };
    }
  }
}

const TRAIT_STEMS: Record<string, RegExp> = {
  venomous: /venom/i, poisonous: /poison|venom/i, makamandag: /venom|makamandag/i, dangerous: /dangerous|aggressive|venom/i,
  aggressive: /aggressive/i, nocturnal: /nocturnal|at night/i, friendly: /friendly|docile|gentle/i,
  mapanganib: /dangerous|aggressive|venom/i, delikado: /dangerous|aggressive|venom/i,
};

/** The sentences of an animal's record (description, facts) that mention the trait asked about */
function traitEvidence(a: Animal, trait: string): string | null {
  const stem = TRAIT_STEMS[trait] ?? new RegExp(trait, "i");
  const sentences = [a.description ?? "", ...(a.interestingFacts ?? [])].flatMap(t => t.split(/(?<=[.!?])\s+/)).filter(s => stem.test(s));
  return sentences.length ? sentences.slice(0, 2).join(" ") : null;
}

function traitReply(message: string, named: Animal[], isFil: boolean): Reply {
  const trait = message.match(ATTRIBUTE)![0].toLowerCase();
  if (named.length === 0) return { reply: isFil ? MISSING.fil : MISSING.en, relatedAnimals: [], relatedPins: [] };
  const lines = named.slice(0, 4).map(a => {
    const said = traitEvidence(a, trait);
    return said
      ? (isFil ? `Ayon sa tala ng ${a.name}: "${said}"` : `The ${a.name}'s record says: "${said}"`)
      : (isFil ? `Hindi nakatala sa database ng Manila Zoo kung ${trait} ang ${a.name}.` : `The Manila Zoo database doesn't record whether the ${a.name} is ${trait}.`);
  });
  return { reply: lines.join("\n"), relatedAnimals: named.slice(0, 4), relatedPins: [] };
}

// "The first one", "the 2nd", "the last one", "yung una", "pangalawa"
const ORDINAL = /\b(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th|una|pangalawa|ikalawa|pangatlo|ikatlo|huli)\b/i;
function ordinalIndex(word: string, length: number): number | null {
  const w = word.toLowerCase();
  const i = ({ first: 0, "1st": 0, una: 0, second: 1, "2nd": 1, pangalawa: 1, ikalawa: 1, third: 2, "3rd": 2, pangatlo: 2, ikatlo: 2, fourth: 3, "4th": 3, fifth: 4, "5th": 4 } as Record<string, number>)[w]
    ?? (w === "last" || w === "huli" ? length - 1 : null);
  return i != null && i < length ? i : null;
}

// The animals each chat was last shown as a list, so "the first one" can refer to them
const lastList = new Map<string, { ids: number[]; at: number }>();
function rememberList(sessionId: string, ids: number[]) {
  lastList.set(sessionId, { ids, at: Date.now() });
  if (lastList.size > 5000) for (const [k, v] of lastList) if (Date.now() - v.at > 30 * 60_000) lastList.delete(k);
}
function recalledList(sessionId: string): number[] | null {
  const m = lastList.get(sessionId);
  return m && Date.now() - m.at < 30 * 60_000 ? m.ids : null;
}

// A question asks with a "?" or starts with a question word ("Is there wifi", "Saan ang CR");
// "You are useless" contains "are" but is a remark, not a question
const QUESTION_WORDS = /^\s*(is|are|can|could|do|does|did|where|what|when|how|why|who|which|have|has|may|will|meron|mayroon|saan|nasaan|ano|anong|paano|pwede|puwede|bakit|kailan|magkano|ilan|sino)\b|\?/i;
// Place names whose words would otherwise read as animal details ("food" in "food court")
const PLACE_NAME_WORDS = /\bfood\s+(court|stalls?|places?|area)\b|\bplaza\s+restaurant\b/gi;

const UNCLEAR = {
  en: "Sorry, I didn't understand that. You can ask me things like \"Where is the lion?\", \"Where is the nearest restroom?\", \"What animals are endangered?\", \"How much is the ticket?\" or \"What time does the zoo open?\"",
  fil: "Paumanhin, hindi ko iyon naintindihan. Maaari mong itanong ang \"Saan ang leon?\", \"Nasaan ang pinakamalapit na CR?\", \"Anong mga hayop ang nanganganib?\", \"Magkano ang ticket?\" o \"Anong oras bukas ang zoo?\"",
};

// "What about the ostrich?", "And the deer?", "Paano naman ang leon?", "Yung zebra naman?": the same
// question as before, about another animal
const SWITCH_SUBJECT = /^\s*(what|how)\s+about\b|^\s*and\s+(the\s+|a\s+|an\s+)?\w|^\s*(eh?|at)\s+(ang\s+|yung\s+|sa\s+)?\w|^\s*(paano|ano)\s+naman\b|\bnaman\s*\??\s*$/i;

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { message: typed, session_id, language, context_animal_id } = parsed.data;
  // The visitor's position, when the app knows it (not part of the generated schema, so read raw)
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const contextLat = num(req.body?.context_lat), contextLng = num(req.body?.context_lng);
  const ctx: ChatContext = { animalId: context_animal_id, lat: contextLat, lng: contextLng };
  const sessionId = session_id || randomUUID();

  // Misspelt zoo words are fixed first ("leoin" -> "leon", "restrom" -> "restroom"), so the model,
  // the rules and the database lookups all read what the visitor meant. The history keeps what they typed.
  const { text: message, corrections } = correctSpelling(typed, await zooVocabulary(Object.keys(ANIMAL_ALIASES)));

  let intent = detectIntent(message);
  let confidence = 0.5;
  let intentSource = "keywords";

  try {
    const response = await fetch(`${AI_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`AI service returned ${response.status}`);
    const result = (await response.json()) as { intent?: string; confidence?: number };
    // Trust BERT only when it is confident; otherwise keep the keyword match
    if (result.intent && typeof result.confidence === "number" && result.confidence >= BERT_MIN_CONFIDENCE) {
      intent = result.intent;
      confidence = result.confidence;
      intentSource = "bert";
    }
  } catch (error) {
    req.log.warn({ err: error }, "BERT intent service unavailable; using keyword matching");
  }
  // A question written in Filipino gets a Filipino answer even when the app is set to English;
  // otherwise the app's language setting decides
  const detectedLanguage = detectLanguage(message) === "fil" ? "fil" : language || "en";
  const isFil = detectedLanguage === "fil";

  // 0. Safety (self-harm, harming or taking the animals, entering enclosures, weapons…): its answer
  // replaces whatever the steps below decide (applied in step 5f), on the corrected or typed text
  const safety = safetyReply(message, isFil) ?? (typed !== message ? safetyReply(typed, isFil) : null);

  // 1. Scope. Unrelated questions get the out-of-scope reply whatever the model guessed; the rules
  // check what was typed as well as the corrected text. A model "out_of_scope" for a message that
  // names one of the zoo's animals or places falls back to the keyword rules instead.
  const trivia = SUPERLATIVE.test(message);
  if (isUnrelated(message) || isUnrelated(typed) || (trivia && WORLD.test(message))) {
    intent = "out_of_scope";
    intentSource += "+unrelated-rule";
  } else if (trivia) {
    intent = "not_recorded";
    intentSource += "+not-in-database-rule";
  } else if (intent === "out_of_scope") {
    const pins = await db.select().from(mapPinsTable).where(eq(mapPinsTable.isActive, true));
    // "Give me the list of all the animals in the zoo", "what animals are in the zoo": the zoo's own collection
    if (LIST_REQUEST.test(message)) {
      intent = "animal_info";
      intentSource += "+list-rule";
    } else if ((await findAnimals(message)).length > 0 || namedPin(message, pins) || PLACE_TYPES.some(([re]) => re.test(message))) {
      const fallback = detectIntent(message);
      if (fallback !== "general") { intent = fallback; intentSource += "+zoo-words"; }
    }
  }
  const inScope = intent !== "out_of_scope" && intent !== "not_recorded";

  // 1b. The model guesses "emergency" for much it doesn't understand ("you are useless", emoji). Without
  // an emergency word that guess is dropped for the keyword rules, so the hotline means a real emergency.
  let droppedEmergency = false;
  if (intent === "emergency" && !EMERGENCY_HINT.test(message) && !EMERGENCY_HINT.test(typed)) {
    const fallback = detectIntent(message);
    intent = fallback === "emergency" ? "general" : fallback;
    droppedEmergency = true;
    intentSource += "+not-emergency";
  }

  // 2. Safety first: a clear emergency always gets the emergency answer (security hotline, first
  // aid), even if the model misreads it, e.g. "who do I call in an emergency?" as general
  if (EMERGENCY.test(message) && intent !== "emergency") {
    intent = "emergency";
    intentSource += "+emergency-rule";
  }

  // 3. Where something is vs how to get there. "Where is the lion?" is answered with its exhibit
  // (animal_location); walking directions only come with an explicit request ("How do I get to the
  // lion?", "Take me there", navigation). "Where does the lion live?" asks for its natural habitat.
  const habitatWhere = HABITAT_WHERE.test(message) && !/\b(zoo|here|dito)\b/i.test(message);
  const wantsDirections = DIRECTIONS.test(message);
  const placeType = PLACE_TYPES.find(([re]) => re.test(message))?.[1];
  // Place names don't ask for an animal detail ("the food court" is not a question about diet)
  const aspects = detectAspects(message.replace(PLACE_NAME_WORDS, " "));
  const asksInfoDetail = aspects.some(a => a !== "overview" && a !== "location");
  if (inScope && intent !== "emergency") {
    const before = intent;
    const aboutAnimal = async () => (await animalsFor(message, sessionId, true)).length > 0;
    if (habitatWhere && (intent === "animal_location" || intent === "navigation")) intent = "animal_info";
    else if (wantsDirections && ["animal_location", "facilities", "animal_info", "general", "greeting", "parking"].includes(intent) && !(intent === "parking" && ZOO_ARRIVAL.test(message))) intent = "navigation";
    // "leon habitat" read as a place question: it asks for a detail, not where the animal is
    else if ((intent === "animal_location" || (intent === "navigation" && !wantsDirections)) && asksInfoDetail && !aspects.includes("location")) intent = "animal_info";
    // "Nearest comfort room" read as parking: it names a facility, not a parking question
    else if (intent === "parking" && placeType && !ZOO_ARRIVAL.test(message)) intent = "facilities";
    // "Where can I eat near the tiger?": a facility near an animal, not the animal's exhibit
    else if (["animal_location", "animal_info", "general"].includes(intent) && placeType && placeType !== "entrance"
      && /\b(near|nearby|close to|closest to|next to|malapit)\b/i.test(message) && !NEAR_ANIMALS.test(message)) intent = "facilities";
    else if (!wantsDirections && (intent === "navigation" || ((intent === "general" || intent === "greeting") && WHERE_QUESTION.test(message)))) {
      // A "where is" question the model read as directions or small talk: a facility, or an animal/exhibit
      intent = placeType && placeType !== "entrance" && (await findAnimals(message)).length === 0 ? "facilities" : "animal_location";
    } else if (intent === "animal_location" && placeType && (await findAnimals(message)).length === 0) intent = "facilities";
    // "Saan siya makikita?" after talking about the tiger is about the tiger, not a restroom
    else if (intent === "facilities" && !placeType && aspects.includes("location") && await aboutAnimal()) intent = "animal_location";
    if (intent !== before) intentSource += `+${intent === "navigation" ? "directions" : intent === "animal_info" ? "detail" : intent === "facilities" ? "facility" : "location"}-rule`;
  }

  // 4. A detail about a named animal ("habitat of the tortoise", "when is the ostrich fed?") is
  // answered from that animal's record, whatever topic the model picked
  const nearSomething = intent === "facilities" && /\bnear|malapit/i.test(message);
  if (inScope && !["animal_info", "animal_location", "navigation"].includes(intent) && !nearSomething && asksInfoDetail
      && (await animalsFor(message, sessionId, true)).length > 0) {
    intent = "animal_info";
    intentSource += "+detail-rule";
  }

  // 5. The answer to ZooBot's "Which one do you mean?" ("the Japanese one") answers the original question
  let chosen: Reply | null = null;
  const waiting = takeChoice(sessionId);
  if (waiting && !EMERGENCY.test(message) && message.trim().split(/\s+/).length <= 6) {
    const candidates = await db.select().from(animalsTable).where(inArray(animalsTable.id, waiting.ids));
    const pick = chooseFrom(message, candidates);
    if (pick) {
      chosen = await animalReply(waiting.question, [pick], isFil, sessionId);
      intent = asksForDetail(waiting.question) && detectAspects(waiting.question).every(a => a === "location") ? "animal_location" : "animal_info";
      intentSource += "+clarified";
    }
  }
  // 5b. "Animals near the food court": the closest exhibits to that place, whatever topic the model picked
  if (!chosen && inScope && intent !== "emergency" && !wantsDirections) {
    const pins = insideZoo(await db.select().from(mapPinsTable).where(eq(mapPinsTable.isActive, true)));
    const nearby = await exhibitsNear(message, pins, isFil, sessionId);
    if (nearby) { chosen = nearby; intent = "animal_location"; intentSource += "+near-rule"; }
  }
  // 5b2. "What's in the aviary?", "aviary animals", "who lives in the reptile house": the exhibit's
  // animals, whatever topic the model picked (it reads these as animal_info, general or facilities)
  if (!chosen && inScope && intent !== "emergency" && !wantsDirections) {
    const contents = await exhibitContents(message, isFil, sessionId);
    if (contents) { chosen = contents; intent = "animal_location"; intentSource += "+exhibit-contents"; }
  }
  // 5c. A trait ("Is the cobra venomous?", "Is it dangerous?"): quoted from the animal's own record when
  // its description or facts mention it, otherwise "not recorded". Never guessed.
  if (!chosen && inScope && intent !== "emergency" && ATTRIBUTE.test(message) && !wantsDirections) {
    let named = await findAnimals(message);
    if (named.length === 0 && FOLLOW_UP.test(message)) {
      const id = recalledAnimalId(sessionId);
      named = id ? await db.select().from(animalsTable).where(eq(animalsTable.id, id)) : [];
    }
    chosen = traitReply(message, named, isFil);
    if (named.length === 1) rememberAnimal(sessionId, named[0]!.id);
    intentSource += "+trait";
  }
  // 5c2. "Where is the first one?" after a list of animals: that animal from the list
  const ordinal = ORDINAL.exec(message);
  const listed = recalledList(sessionId);
  if (!chosen && inScope && ordinal && listed && message.trim().split(/\s+/).length <= 8) {
    const index = ordinalIndex(ordinal[0], listed.length);
    const [pick] = index != null ? await db.select().from(animalsTable).where(eq(animalsTable.id, listed[index]!)) : [];
    if (pick) {
      const asked = detectAspects(message);
      chosen = await animalReply(pick.name, [pick], isFil, sessionId, asked.includes("overview") ? ["overview"] : asked);
      intent = asked.every(a => a === "location") ? "animal_location" : "animal_info";
      intentSource += "+list-pick";
    }
  }
  // 5d. Only question words ("where?", "saan?"): ask what they're looking for
  const contentWords = message.toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w) && !FILLER_WORDS.has(w));
  if (!chosen && inScope && intent !== "emergency" && contentWords.length === 0 && !placeType && !THANKS.test(message)
      && message.trim().split(/\s+/).length <= 2) {
    chosen = {
      reply: WHERE_QUESTION.test(message)
        ? (isFil ? "Aling hayop o lugar ang hinahanap mo? Halimbawa: \"Saan ang leon?\" o \"Nasaan ang CR?\"" : "Which animal or place are you looking for? For example: \"Where is the lion?\" or \"Where is the restroom?\"")
        : (isFil ? UNCLEAR.fil : UNCLEAR.en),
      relatedAnimals: [], relatedPins: [],
    };
    intent = "general";
    intentSource += "+clarify";
  }
  // 5e. "What about the ostrich?" after "Where is the zebra?": ask the earlier question about the new animal
  if (!chosen && inScope && SWITCH_SUBJECT.test(message) && !asksForDetail(message)) {
    const previous = recalledAspects(sessionId);
    const named = previous ? await findAnimals(message) : [];
    if (previous && named.length > 0) {
      chosen = await animalReply(message, named, isFil, sessionId, previous);
      intent = previous.every(a => a === "location") ? "animal_location" : "animal_info";
      intentSource += "+follow-up";
    }
  }
  // 5f. The safety answer from step 0 stands over every other answer
  if (safety) {
    chosen = safety.reply;
    intent = safety.intent;
    intentSource += "+safety";
  }
  if (THANKS.test(message)) {
    intent = "greeting";
    intentSource += "+thanks";
  }
  const none = { relatedAnimals: [] as unknown[], relatedPins: [] as unknown[] };
  let { reply, relatedAnimals, relatedPins, route = null, location = null } = chosen ?? (THANKS.test(message)
    ? { reply: isFil ? "Walang anuman! Masiyahan sa pagbisita sa Manila Zoo." : "You're welcome! Enjoy your visit to Manila Zoo.", ...none }
    : intent === "not_recorded"
      ? { reply: isFil ? MISSING.fil : MISSING.en, ...none }
      : await generateReply(message, intent, detectedLanguage, sessionId, ctx));
  // A dropped "emergency" guess that matched nothing else: the model didn't understand, so say so
  if (droppedEmergency && !chosen && (reply === MISSING.en || reply === MISSING.fil)) reply = isFil ? UNCLEAR.fil : UNCLEAR.en;

  // 6. Questions about zoo rules ("can I bring my dog?", "bawal ba manigarilyo?") get the official
  // rule, whatever intent the model picked; the rules aren't one of its trained intents
  const ruleReply = !inScope || chosen ? null : answerRuleQuestion(message, detectedLanguage);
  if (ruleReply) {
    reply = ruleReply;
    relatedAnimals = [];
    relatedPins = [];
    route = null;
    location = null;
    intentSource += "+rules";
  }

  // A reply that names several animals (a list, an exhibit's residents) is what "the first one" refers to next
  const shown = (relatedAnimals as { id?: unknown }[]).map(a => a.id).filter((id): id is number => typeof id === "number");
  if (shown.length > 1) rememberList(sessionId, shown);

  // The history keeps what the visitor typed; the analytics note any spelling corrections
  await db.insert(chatHistoryTable).values({ sessionId, role: "user", message: typed, intent, confidence: String(confidence) });
  await db.insert(chatHistoryTable).values({ sessionId, role: "assistant", message: reply, intent, confidence: String(confidence) });
  db.insert(analyticsTable).values({ eventType: "chat_message", sessionId, metadata: { intent, intentSource, confidence, language: detectedLanguage, ...(corrections.length ? { corrections } : {}) } }).catch(() => {});

  res.json({
    reply, session_id: sessionId, intent, confidence, related_animals: relatedAnimals, related_locations: relatedPins,
    language_detected: detectedLanguage, ...(route ? { route } : {}),
    // The one place the answer is about (for a "Show on map" button), and the corrected wording
    ...(location ? { location: { id: location.id, name: location.name } } : {}),
    ...(corrections.length ? { corrected_message: message } : {}),
  });
});

router.get("/chat/history", async (req, res): Promise<void> => {
  const { session_id, limit = "50" } = req.query;
  let query = db.select().from(chatHistoryTable).orderBy(chatHistoryTable.createdAt).limit(Number(limit));
  if (session_id) {
    const rows = await db.select().from(chatHistoryTable).where(eq(chatHistoryTable.sessionId, String(session_id))).orderBy(chatHistoryTable.createdAt).limit(Number(limit));
    res.json(rows);
    return;
  }
  const rows = await query;
  res.json(rows);
});

router.post("/chat/feedback", async (req, res): Promise<void> => {
  const parsed = SubmitChatFeedbackBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const result = await pool.query(
    "INSERT INTO feedback (chat_history_id, rating, comment) VALUES ($1, $2, $3) RETURNING *",
    [parsed.data.chat_history_id ?? null, parsed.data.rating ?? null, parsed.data.comment ?? null]
  );
  res.status(201).json(result.rows[0] ?? {});
});

export default router;
