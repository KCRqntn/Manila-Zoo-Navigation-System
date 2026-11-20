// Offline spelling and grammar suggestions for the AI Guide chat box, in English and Filipino.
// Everything runs in the browser: zoo-focused word lists for both languages, Filipino affix
// handling, fuzzy matching, and a few grammar rules per language.

type Lang = "en" | "fil";

// ─── Word lists ──────────────────────────────────────────────────────────────

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

const EN_VOCAB = words(`
a an the and or but if so to of in on at by for from with without about into near nearest far here there this that these those
i me my mine you your we our us they them their he she it its is am are was were be been being do does did done have has had
can could will would should may might must shall not no yes ok okay please thanks thank hello hi hey good morning afternoon evening
night bye goodbye welcome sorry excuse help what where when why who whom whose which how much many some any all every each more
most less least other another way go going get got getting see seen look find found show tell know want need like love bring take
come visit walk eat drink buy pay open opens opened close closes closed closing time times hour hours today tomorrow yesterday
now later day days week weekend weekends monday tuesday wednesday thursday friday saturday sunday holiday holidays morning
zoo manila animal animals exhibit exhibits enclosure cage area section map route directions direction way path entrance exit gate
ticket tickets price prices fee fees cost costs free discount student students senior seniors child children kid kids adult adults
family pwd resident residents restroom restrooms toilet toilets bathroom comfort room cr food foods snack snacks restaurant
canteen stall stalls water drinks parking park car cars bus jeep wheelchair stroller accessible emergency first aid clinic doctor
nurse lost security guard police event events show shows feeding schedule program talk tour tours camp rule rules allowed pet pets
dog dogs cat cats smoking smoke photo photos picture pictures camera flash souvenir shop gift qr code scan guide information info
lion lions tiger tigers elephant elephants giraffe giraffes monkey monkeys macaque macaques primate primates bird birds eagle eagles
owl owls python pythons snake snakes crocodile crocodiles reptile reptiles tortoise tortoises turtle turtles bear bears sun cockatoo
cockatoos parrot parrots monitor lizard lizards deer hippo hippopotamus zebra camel ostrich peacock flamingo bat bats fish predator
predators apex aviary endemic philippine asian african reticulated saltwater celebes crested red footed common tree honey big small
long old young baby babies wild cute dangerous friendly diet habitat lifespan weight conservation status endangered species fact
facts sleep live lives feed fed born name names kind kinds type types list best favorite last next because also just only very
scientific called call color colour size tall height heavy fast speed origin native country countries extinct population male
female mammal mammals reptiles amphibian bird nocturnal carnivore herbivore omnivore tell explain describe meaning mean
capybara hyena hyenas lemur lemurs gibbon gibbons cassowary hornbill peafowl stork pigeon pigeons dove doves cobra cobras
bengal white sulcata sailfin burmese albino kite brahminy nicobar imperial green painted ring tailed double wattled japanese
indian blue eared brown fruit samar spitting elongated water history contact email address facebook refund reservation
happen happening happens museum booth shop shops gift gifts store garden gardens butterfly butterflies savana savanna savannah
playground bench benches shade picture photos selfie stroller strollers wheelchairs bag bags locker lockers wifi charge
cost costs pay paying cash card gcash online book booking buy buying sell sells sold enter entering leave leaving stay inside
outside around near next behind between front back left right straight north south east west far close closest fastest
shortest route walk walking minutes minute meter meters many much how long tall big biggest smallest oldest youngest
does doing do did go goes went going see saw seeing look looking watch watching meet feed feeding fed eat eating ate
sleep sleeping play playing swim swimming fly flying run running climb live living lived alive die died dead sick
animal kid kids family friends group school class teacher students tour guide staff keeper keepers vet doctor
give gives gave given let lets say says said ask asks asked try tried think thought make makes made use used wait start end
stop keep kept put read write wrote written hear heard feel felt become leave work works seem seems turn move hold held sit
stand lose lost add change learn understand remember allow offer provide include continue set follow create speak spend
spent grow win won send sent build expect pass require report decide pull push carry brought choose check enjoy explore
recommend suggest plan prefer arrive return reach cross wear wash touch hug ride rode throw threw climb jump hurt kill steal
poison sneak share order serve sit stood forget forgot forgive hide hit join kick laugh cry smile shout wake woke
people person thing things place places world life lives hand hands part parts number question questions answer answers
problem problems money home job word words lot lots idea ideas point case side story reason result sound line head face
new great own high different large important bad same able sure real full special easy hard clear whole nice happy sad
beautiful interesting available complete possible true wrong ready safe quiet loud hungry thirsty tired busy crowded fun
funny amazing awesome cool hot cold warm wet dry clean dirty early late quick slow cheap expensive useless stupid smart
helpful useful better worse worst bad terrible boring scary scared afraid lucky sure maybe really quite almost enough
again still even never always sometimes usually often soon tonight already yet ever else together alone
visitor guest guests worker workers sign signs entire mother father mom dad brother sister son daughter friend husband wife
lunch dinner breakfast meal meals juice coffee ice cream candy bread chips rice chicken meat fruit fruits vegetables
umbrella hat cap sunscreen phone charger wallet rain rainy sunny hot weather video videos joke jokes fire gun guns knife
year years president mayor election math homework poem code python game games song songs movie movies news
panda pandas tiger's lion's prey hunt hunts hunting attack attacks bite bites sting
one ones over under than then too fine smell giving house houses close closer larger largest smaller faster slower
player players faint fainted breathe breath hate admin restriction restrictions sort code taste bit instruction instructions
can't don't won't isn't aren't doesn't didn't wasn't weren't i'm i've i'll you're we're they're
`);

const FIL_VOCAB = words(`
ang ng nang sa si ni kay mga at o pero kasi dahil kung kapag pag para tungkol mula hanggang na pa nga din rin daw raw ba po opo oo
hindi huwag wag wala walang meron mayroon may lang lamang naman sana siguro talaga dapat kailangan gusto ayaw puwede pwede bawal sige
ako ko akin ikaw ka mo iyo siya niya kanya kami namin amin tayo natin atin kayo ninyo niyo inyo sila nila kanila
ito iyan iyon yan yon yun yung iyong dito diyan doon rito riyan roon ganito ganyan ganoon
saan nasaan ano anong sino paano bakit kailan magkano ilan alin gaano kumusta salamat maraming paalam magandang ingat tara halika
pasensya paumanhin mag nag makapag nakapag
kain inom punta kita tingin lakad takbo bili bayad bisita dalaw pasok labas balik uwi sakay baba akyat hanap tanong sagot sabi alam
gawa kuha dala iwan hintay upo higa tulog gising ligo laro larawan litrato pakain alaga hawak payag tulong sara simula tapos hinto
lapit layo lipat sunod liko kanan kaliwa diretso harap likod gilid tabi loob itaas ibaba gitna dulo daan kalye lugar bahay
kulungan hawla puno halaman tubig pagkain inumin merienda meryenda kainan tindahan banyo palikuran pasukan labasan paradahan
sasakyan kotse presyo halaga libre tiket bata matanda estudyante guro pamilya kaibigan magulang anak nanay tatay lola lolo tao
gabay mapa oras araw gabi umaga tanghali hapon ngayon bukas kahapon mamaya kanina linggo buwan taon
lunes martes miyerkules huwebes biyernes sabado
hayop ibon isda unggoy matsing ahas sawa buwaya pagong agila kuwago bayawak kalangay elepante leon tigre oso usa kabayo aso pusa
manok baboy kalabaw paniki loro
malaki maliit mahaba maikli maganda pangit mabait mabangis delikado ligtas malapit malayo mainit malamig masaya malungkot gutom
uhaw pagod mahal mura marami kaunti konti lahat iba bago luma tama mali sarado bukas ganda laki liit bait
manigarilyo sigarilyo pinakamalapit pinakamalayo pinakamalaki pinakamaliit malapit pumunta pupunta kumain kinakain
pagpapakain magdala dalhin pwedeng puwedeng labasan pasukan paradahan banyo kubeta kasama sama larawan
tigre leon buwaya agila kuwago sawa pagong usa bayawak kalaw kalapati kobra unggoy matsing elepante zebra
patay buhay lason sunog nawawala nawala anak sakit tulong saklolo baril sarili ayoko
mamatay namatay mabuhay lasunin nalason
`);

// Shorthand and common misspellings, fixed directly (lowercase keys; values may be several words)
const EN_FIXES: Record<string, string> = {
  wher: "where", whre: "where", wehre: "where", were: "where", wat: "what", wht: "what", whta: "what",
  hw: "how", hwo: "how", wen: "when", whn: "when", y: "why", u: "you", ur: "your", r: "are", pls: "please",
  plz: "please", thx: "thanks", tnx: "thanks", ty: "thank you", im: "I'm", dont: "don't", cant: "can't", wont: "won't",
  doesnt: "doesn't", isnt: "isn't", whats: "what's", wheres: "where's", hows: "how's", lets: "let's",
  waht: "what", wath: "what", hwat: "what", wahts: "what's", whast: "what's", whatss: "what's", wats: "what's",
  dos: "does", deos: "does", feding: "feeding", feeing: "feeding", feedng: "feeding", tere: "there", thre: "there",
  scientfic: "scientific", sceintific: "scientific", scienctific: "scientific", sientific: "scientific",
  tiket: "ticket", tikets: "tickets", ticekt: "ticket", tickect: "ticket", restrom: "restroom", restoom: "restroom",
  toilette: "toilet", elepant: "elephant", elefant: "elephant", giraf: "giraffe", girafe: "giraffe", lyon: "lion",
  tigre: "tiger", crocodille: "crocodile", crocodle: "crocodile", pyton: "python", tortise: "tortoise",
  tortose: "tortoise", cocatoo: "cockatoo", eagel: "eagle", monky: "monkey", monkies: "monkeys", parkng: "parking",
  oppen: "open", clse: "close", tommorow: "tomorrow", tomorow: "tomorrow", tmrw: "tomorrow", tdy: "today",
  todya: "today", wheelchare: "wheelchair", emergancy: "emergency", emergeny: "emergency", resturant: "restaurant",
  restaraunt: "restaurant", feedin: "feeding", schedual: "schedule", shedule: "schedule", nearst: "nearest",
  teh: "the", hte: "the", fnd: "find", wnt: "want", knw: "know", nd: "and", ther: "there", thier: "their",
  alot: "a lot", abt: "about", bcoz: "because", becuase: "because",
};

const FIL_FIXES: Record<string, string> = {
  sn: "saan", san: "saan", nsaan: "nasaan", nasan: "nasaan", anu: "ano", anung: "anong", pano: "paano", pno: "paano",
  pnu: "paano", panu: "paano", bkt: "bakit", bkit: "bakit", kelan: "kailan", kln: "kailan", mgkano: "magkano",
  mgkno: "magkano", magkno: "magkano", mkano: "magkano", nmn: "naman", nman: "naman", lng: "lang",
  ung: "yung", yong: "yung", pra: "para", kc: "kasi", kse: "kasi", ksi: "kasi", sna: "sana", tlga: "talaga",
  tlaga: "talaga", q: "ko", aq: "ako", xa: "siya", sya: "siya", cla: "sila", kau: "kayo", kyo: "kayo", dto: "dito",
  dun: "doon", jan: "diyan", dyan: "diyan", pde: "pwede", pwde: "pwede", hnd: "hindi", hndi: "hindi",
  hnde: "hindi", nde: "hindi", wla: "wala", wlang: "walang", mron: "meron", mern: "meron", slmt: "salamat",
  slamat: "salamat", salamt: "salamat", kmsta: "kumusta", musta: "kumusta", kamusta: "kumusta", gsto: "gusto",
  gusro: "gusto", dn: "din", rn: "rin", dw: "daw", rw: "raw", tyo: "tayo", nyo: "ninyo", mgnda: "maganda",
  mganda: "maganda", magnda: "maganda", hyop: "hayop", hayup: "hayop", pgkain: "pagkain", pagkaen: "pagkain",
  kaen: "kain", kumaen: "kumain", kinakaen: "kinakain", tubeg: "tubig", bnyo: "banyo", elepanti: "elepante",
  buaya: "buwaya", unngoy: "unggoy", ungoy: "unggoy", agla: "agila", kwago: "kuwago", 
  bng: "bang", bnag: "bang", aning: "anong", anog: "anong", anng: "anong", kao: "kayo", srado: "sarado", bkas: "bukas", ors: "oras", ngyon: "ngayon", ngaun: "ngayon", ngayn: "ngayon",
};

// "were is" is fine English elsewhere, so only treat "were" as "where" at the start of a question
const ONLY_AT_START = new Set(["were"]);

// Words that are always capitalised
const PROPER_NOUNS: Record<string, string> = Object.fromEntries(
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Manila", "Maynila", "Philippine",
   "Philippines", "Pilipinas", "Asian", "African", "Celebes", "Lunes", "Martes", "Miyerkules", "Huwebes", "Biyernes",
   "Sabado", "Linggo", "CR", "PWD", "QR"].map(w => [w.toLowerCase(), w]),
);

const QUESTION_START = /^(where|what|when|why|who|which|how|can|could|is|are|do|does|did|will|would|should|may|saan|nasaan|ano|anong|sino|paano|bakit|kailan|magkano|ilan|ilang|alin|gaano|pwede|puwede|meron|mayroon)\b/i;

// ─── Grammar rules that swap one word for another ────────────────────────────

const EN_PHRASE_FIXES: [RegExp, string][] = [
  [/\b(can I|could I|to|I want to|where to) by\b/gi, "$1 buy"],
  [/\b(their|they're) (is|are)\b/gi, "there $2"],
  [/\b(should|could|would) of\b/gi, "$1 have"],
  [/\b(is|are) their\b/gi, "$1 there"],
  // "Is tree parking?" / "What animals are tree?": a slip for "there"
  [/\b(is|are) tree\b(?!\s+(house|top|planting))/gi, "$1 there"],
  // "Were is the lion?" at the start of a question means "where"
  [/^were (is|are|can|do|does|did|should|will|to)\b/i, "Where $1"],
];

const FIL_PHRASE_FIXES: [RegExp, string][] = [
  // "pwede bag" is a slip for "pwede bang"
  [/\b(pwede|puwede) bag\b/gi, "$1 bang"],
  // "ano" before a noun links with "-ng": "ano oras" -> "anong oras"
  [/\bano (oras|araw|hayop|pagkain|klase|kulay|pangalan|gagawin|meron|mayroon|pwede|puwede|lugar|daan|event|show)\b/gi, "anong $1"],
  // Repeated action takes "nang": "kain ng kain" -> "kain nang kain"
  [/\b([\p{L}]+) ng \1\b/giu, "$1 nang $1"],
  // "nang" before a describing word: "tumakbo ng mabilis" -> "tumakbo nang mabilis"
  [/\b(\p{L}+) ng (mabilis|mabagal|maaga|malakas|mahina|maayos|mabuti|tahimik|dahan-dahan)\b/giu, "$1 nang $2"],
];

/**
 * Teaches the checker the zoo's own names (animals, map places), so they're recognised and their
 * misspellings fixed, including ones an admin adds later. Names count as English words.
 */
export function addZooNames(names: Iterable<string | null | undefined>): void {
  for (const name of names) {
    for (const w of String(name ?? "").toLowerCase().split(/[^a-zà-ÿ']+/)) {
      if (w.length >= 3 && !FIL_VOCAB.has(w)) EN_VOCAB.add(w);
    }
  }
}

// ─── Word recognition ────────────────────────────────────────────────────────

function isKnownEnglish(word: string): boolean {
  if (EN_VOCAB.has(word)) return true;
  // Regular endings of known words ("visits", "walking", "opened")
  for (const suffix of ["s", "es", "ing", "ed", "d", "'s"]) {
    if (!word.endsWith(suffix)) continue;
    const root = word.slice(0, -suffix.length);
    // "-es" only after s/x/z/ch/sh/o ("buses", "goes"; not "rulees"), "-d" only after e ("closed")
    if (suffix === "es" && !/(s|x|z|ch|sh|o)$/.test(root)) continue;
    if (suffix === "d" && !root.endsWith("e")) continue;
    if (EN_VOCAB.has(root)) return true;
  }
  return false;
}

const FIL_PREFIXES = ["pinaka", "makapag", "nakapag", "magpa", "nagpa", "pinag", "ipag", "pagka", "maka", "naka", "mag", "nag", "pag", "ma", "na", "pa", "ipa", "i", "ka"];
const FIL_SUFFIXES = ["han", "hin", "an", "in"];

/** Possible root words of a Filipino word, undoing prefixes, -um-/-in- infixes, suffixes and syllable repetition. */
function filipinoRoots(word: string): string[] {
  const seen = new Set([word]);
  let frontier = [word];
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const next: string[] = [];
    const add = (w: string) => { if (w.length >= 2 && !seen.has(w)) { seen.add(w); next.push(w); } };
    for (const w of frontier) {
      for (const p of FIL_PREFIXES) if (w.startsWith(p) && w.length - p.length >= 3) add(w.slice(p.length).replace(/^-/, ""));
      for (const s of FIL_SUFFIXES) if (w.endsWith(s) && w.length - s.length >= 3) add(w.slice(0, -s.length));
      // -um- / -in- after the first consonant: kumain -> kain, binili -> bili
      if (/^[^aeiou](um|in)/.test(w)) add(w[0] + w.slice(3));
      // -um- / -in- at the start before a vowel: umakyat -> akyat, inom stays
      if (/^(um|in)[aeiou]/.test(w)) add(w.slice(2));
      // Repeated first syllable: kakain -> kain, pupunta -> punta
      if (w.length >= 5 && w.slice(0, 2) === w.slice(2, 4)) add(w.slice(2));
      if (w.length >= 6 && w.slice(0, 3) === w.slice(3, 6)) add(w.slice(3));
    }
    frontier = next;
  }
  return [...seen];
}

function isKnownFilipino(word: string): boolean {
  if (FIL_VOCAB.has(word)) return true;
  // Linking "-ng" after a vowel: "bang", "walang", "magandang", "gustong"
  if (word.endsWith("ng") && /[aeiou]ng$/.test(word) && isKnownFilipino(word.slice(0, -2))) return true;
  // An affixed Filipino or borrowed English root: "kinakain", "nagpapakain", "magpicture"
  return filipinoRoots(word).some(r => r !== word && (FIL_VOCAB.has(r) || EN_VOCAB.has(r)));
}

const isKnown = (word: string) => isKnownEnglish(word) || isKnownFilipino(word);

/** Which language most of the message is in, falling back to the app's language setting. */
function detectLanguage(lowerWords: string[], hint: Lang): Lang {
  let en = 0, fil = 0;
  for (const w of lowerWords) {
    const e = EN_VOCAB.has(w) || w in EN_FIXES;
    const f = FIL_VOCAB.has(w) || w in FIL_FIXES || (!e && isKnownFilipino(w));
    if (e && !f) en++;
    if (f && !e) fil++;
  }
  return fil > en ? "fil" : en > fil ? "en" : hint;
}

// ─── Spelling ────────────────────────────────────────────────────────────────

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Count a swap of two neighbouring letters ("tiem") as one mistake
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j]!, before[j - 2]! + 1);
      rowMin = Math.min(rowMin, cur[j]!);
    }
    if (rowMin > max) return max + 1;
    before = prev;
    prev = cur;
  }
  return prev[b.length]!;
}

// Keys next to each other on a QWERTY keyboard (same row, and the rows above/below), for "wrong key" typos
const KEY_ROWS = [["qwertyuiop", 0], ["asdfghjkl", 0.5], ["zxcvbnm", 1.5]] as const;
const KEY_POS = new Map<string, [number, number]>();
KEY_ROWS.forEach(([row, offset], r) => [...row].forEach((c, i) => KEY_POS.set(c, [r, i + offset])));
function neighbourKeys(a: string, b: string): boolean {
  const pa = KEY_POS.get(a), pb = KEY_POS.get(b);
  return !!pa && !!pb && Math.abs(pa[0] - pb[0]) <= 1 && Math.abs(pa[1] - pb[1]) <= 1;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

// The words visitors type most, preferred when a typo is equally close to two words ("tll" -> "tell", not "tall")
const COMMON = words(`
the is are what where when how much many does do can tell me about time open food ticket tickets price near nearest
bring live there
restroom animal animals see find show eat feed feeding lion tiger zoo map exit entrance
ang saan ano anong paano magkano kailan pwede bang ba po may meron hayop pagkain tiket banyo bukas oras
`);

/** True when a word only passes as known through its affixes (not listed itself), so it may be a disguised typo. */
const onlyDerived = (word: string) => !EN_VOCAB.has(word) && !FIL_VOCAB.has(word) && !(word in EN_FIXES) && !(word in FIL_FIXES);

/**
 * Words one typing mistake away from `word`, each with how likely that mistake is (lower = likelier):
 * two letters swapped, a letter left out, a letter doubled, a neighbouring key, then any other slip.
 */
function oneSlipAway(word: string): Map<string, number> {
  const out = new Map<string, number>();
  const add = (w: string, cost: number) => { if (w.length >= 2 && w !== word && cost < (out.get(w) ?? Infinity)) out.set(w, cost); };
  for (let i = 0; i <= word.length; i++) {
    const a = word.slice(0, i), b = word.slice(i);
    if (b.length >= 2) add(a + b[1] + b[0] + b.slice(2), 0);                        // swapped: "tiem" -> "time"
    for (const c of LETTERS) add(a + c + b, 1);                                     // left out: "lon" -> "lion"
    if (b) {
      add(a + b.slice(1), b[0] === word[i - 1] || b[0] === b[1] ? 0.5 : 3);        // extra letter, usually doubled: "musseum" -> "museum"
      for (const c of LETTERS) if (c !== b[0]) add(a + c + b.slice(1), neighbourKeys(c, b[0]!) ? 1.5 : 2.5); // wrong key
    }
  }
  return out;
}

/** The likeliest known word one typing mistake away, or null. Catches affixed Filipino forms and plurals too. */
function slipFix(word: string, lang: Lang): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  const first = oneSlipAway(word);
  for (const [candidate, cost] of first) {
    const inEn = EN_VOCAB.has(candidate), inFil = FIL_VOCAB.has(candidate);
    // A listed word beats one only recognised through its endings or affixes
    const listed = inEn || inFil;
    const known = listed || isKnownEnglish(candidate) || isKnownFilipino(candidate);
    if (!known) continue;
    // Very short words only become listed words ("lon" -> "lion"), never guessed affixed forms
    if (word.length <= 3 && !listed) continue;
    const ownLang = lang === "en" ? inEn || isKnownEnglish(candidate) : inFil || isKnownFilipino(candidate);
    // Words recognised only through affixes are guesses ("pag" + "akin"), so a listed word wins ties
    const score = cost + (listed ? 0 : 1.6) + (ownLang ? 0 : 2) + (candidate[0] === word[0] ? 0 : 0.5) - (COMMON.has(candidate) ? 0.25 : 0);
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  // Two mistakes in one word ("btng" -> "bring", "muuhc" -> "much"): listed words only, and only when
  // no single-mistake word is a better guess
  if (word.length >= 4 && bestScore > 1) {
    const ownVocab = lang === "en" ? EN_VOCAB : FIL_VOCAB;
    const otherVocab = lang === "en" ? FIL_VOCAB : EN_VOCAB;
    for (const [step, cost1] of first) {
      if (cost1 > 1.5) continue;
      for (const [candidate, cost2] of oneSlipAway(step)) {
        if (candidate.length < 3 || cost2 > 1.5) continue;
        const own = ownVocab.has(candidate);
        if (!own && !otherVocab.has(candidate)) continue;
        const score = cost1 + cost2 + 0.75 + (own ? 0 : 2) + (candidate[0] === word[0] ? 0 : 0.5) - (COMMON.has(candidate) ? 0.25 : 0);
        if (score < bestScore) { best = candidate; bestScore = score; }
      }
    }
  }
  return best;
}

/** Closest known word, preferring the message's language, or null if none is close enough to be a confident fix. */
function closestWord(word: string, lang: Lang): string | null {
  if (word.length < 3) return null;
  if (isKnown(word)) {
    // Passes only through affixes ("pagakin" = pag + akin)? A listed word one swap or doubled letter
    // away is the likelier meaning ("pagkain")
    if (!onlyDerived(word)) return null;
    for (const [candidate, cost] of oneSlipAway(word)) {
      if (cost <= 0.5 && (lang === "en" ? EN_VOCAB : FIL_VOCAB).has(candidate)) return candidate;
    }
    return null;
  }
  // One typing mistake: checked against every form the word-recognition rules accept
  const slip = slipFix(word, lang);
  if (slip) return slip;
  if (word.length < 4) return null;
  // Filipino words take many affixed forms the lists can't cover, so only fix near-certain Filipino typos.
  // Long English words get more room ("sucnetific" -> "scientific"): few long words are that close.
  const max = lang !== "en" ? 1 : word.length >= 9 ? 3 : word.length >= 7 ? 2 : 1;
  const letters = [...word].sort().join("");
  // Lower is better: edit distance first, then the message's language, then the same letters reordered
  // ("tiem" -> "time", not "them"), then the same first letter; on a full tie keep the first listed
  const score = (candidate: string, d: number, sameLang: boolean) =>
    d * 4 + (sameLang ? 0 : 3) + ([...candidate].sort().join("") === letters ? 0 : 2) + (candidate[0] === word[0] ? 0 : 1);
  let best: string | null = null;
  let bestScore = Infinity;
  for (const [vocab, vocabLang] of [[EN_VOCAB, "en"], [FIL_VOCAB, "fil"]] as const) {
    for (const candidate of vocab) {
      const d = editDistance(word, candidate, max);
      if (d > max) continue;
      const s = score(candidate, d, vocabLang === lang);
      if (s < bestScore) { best = candidate; bestScore = s; }
    }
  }
  // Near-misses of the shorthand list count too ("wahts" is one swap from "whats" -> "what's")
  for (const [fixes, fixLang] of [[EN_FIXES, "en"], [FIL_FIXES, "fil"]] as const) {
    for (const [typo, fix] of Object.entries(fixes)) {
      if (typo.length < 4 || fix.includes(" ") || ONLY_AT_START.has(typo)) continue;
      const d = editDistance(word, typo, max);
      if (d > max) continue;
      const s = score(typo, d, fixLang === lang);
      if (s < bestScore) { best = fix; bestScore = s; }
    }
  }
  return best;
}

/** Shorthand/misspelling fix for a word: the message's language first, then the other one for longer words. */
function knownFix(lower: string, lang: Lang, isFirstWord: boolean): string | undefined {
  const [own, other] = lang === "fil" ? [FIL_FIXES, EN_FIXES] : [EN_FIXES, FIL_FIXES];
  const ownFix = own[lower];
  if (ownFix && (!ONLY_AT_START.has(lower) || isFirstWord)) return ownFix;
  // A word that's right in this language ("tiket" in Filipino) is left alone
  const known = lang === "fil" ? isKnownFilipino(lower) : isKnownEnglish(lower);
  if (!known && lower.length >= 4 && other[lower]) return other[lower];
  return undefined;
}

/** Keeps the original capitalisation when swapping in a correction. */
function matchCase(original: string, fix: string): string {
  if (fix === "I'm" || fix === "I") return fix;
  if (original === original.toUpperCase() && original.length > 1) return fix.toUpperCase();
  if (original[0] === original[0]!.toUpperCase()) return fix[0]!.toUpperCase() + fix.slice(1);
  return fix;
}

// ─── Suggestion ──────────────────────────────────────────────────────────────

export type CorrectionToken = { text: string; changed: boolean };
/**
 * `allSure`: every word change is a sure fix from the shorthand/misspelling lists ("wher", "teh",
 * "pano"), which sureCorrection applies by itself when the message is sent. Otherwise the suggestion
 * includes guesses ("give" could be meant), which are only used when the visitor taps them.
 */
export type Correction = { text: string; tokens: CorrectionToken[]; language: Lang; allSure: boolean };

const WORD_PATTERN = "[A-Za-zÀ-ÿ']+(?:-[A-Za-zÀ-ÿ']+)*";
const WORD = new RegExp(`^${WORD_PATTERN}$`);
const SPLIT = new RegExp(`(${WORD_PATTERN})`);
// Filipino verb prefixes that must be attached to the word after them ("mag picture" -> "mag-picture")
const DETACHED_PREFIXES = new Set(["mag", "nag", "makapag", "nakapag", "magpa", "nagpa"]);

/**
 * Suggests a corrected version of a chat message in English or Filipino, or null when it already looks fine.
 * `languageHint` is the app's language setting, used when the message itself is ambiguous.
 */
export function suggestCorrection(input: string, languageHint: string = "en"): Correction | null {
  const trimmed = input.replace(/\s+/g, " ").trim();
  if (trimmed.length < 3) return null;

  // Split into words and the spaces/punctuation between them, so punctuation is preserved
  const parts = trimmed.split(SPLIT).filter(Boolean);
  const lang = detectLanguage(parts.filter(p => WORD.test(p)).map(p => p.toLowerCase()), languageHint === "fil" ? "fil" : "en");
  const tokens: CorrectionToken[] = [];
  let wordIndex = 0;

  // The word before the current one, when only a single space separates them
  const previousWordToken = () =>
    tokens.length >= 2 && tokens[tokens.length - 1]!.text === " " && WORD.test(tokens[tokens.length - 2]!.text) ? tokens[tokens.length - 2]! : null;

  for (const part of parts) {
    if (!WORD.test(part)) { tokens.push({ text: part, changed: false }); continue; }

    const lower = part.toLowerCase();
    let fixed = part;

    if (lower === "i" && lang === "en") {
      fixed = "I";
    } else {
      const fix = knownFix(lower, lang, wordIndex === 0);
      if (fix) fixed = matchCase(part, fix);
      else if (!/[A-Z]/.test(part.slice(1)) && !part.includes("-") && !(wordIndex > 0 && /^[A-Z]/.test(part))) {
        // Leave names alone: in capitals or mixed case, or capitalised after the first word ("Jose
        // Rizal", "Avilon"); and hyphenated words ("dahan-dahan")
        const close = closestWord(lower, lang);
        if (close) fixed = matchCase(part, close);
      }
    }
    const proper = PROPER_NOUNS[fixed.toLowerCase()];
    if (proper) fixed = proper;
    const fixedLower = fixed.toLowerCase();
    const prev = previousWordToken();

    // Repeated word: "where is the the lion" (but not Filipino "kain ng kain" or "dahan dahan")
    if (prev && prev.text.toLowerCase() === fixedLower && lang === "en") {
      tokens.pop();
      tokens[tokens.length - 1] = { ...prev, changed: true };
      continue;
    }

    if (prev) {
      const p = prev.text.toLowerCase();
      // "mag picture" -> "mag-picture", "mag lakad" -> "maglakad", "nag aral" -> "nag-aral"
      if (DETACHED_PREFIXES.has(p) && isKnown(fixedLower)) {
        const borrowed = !isKnownFilipino(fixedLower) || (isKnownEnglish(fixedLower) && !FIL_VOCAB.has(fixedLower));
        const joined = prev.text + (borrowed || /^[aeiou]/.test(fixedLower) ? "-" : "") + fixedLower;
        tokens.pop();
        tokens[tokens.length - 1] = { text: joined, changed: true };
        wordIndex++;
        continue;
      }
      // English "a"/"an": "a elephant" -> "an elephant", "an lion" -> "a lion"
      if (lang === "en") {
        const startsWithVowel = /^[aeiou]/i.test(fixed) && !/^(uni|use|usu|one|eu)/i.test(fixed);
        if (p === "a" && startsWithVowel) tokens[tokens.length - 2] = { text: prev.text + "n", changed: true };
        else if (p === "an" && !startsWithVowel) tokens[tokens.length - 2] = { text: prev.text[0]!, changed: true };
      }
      // Filipino din/rin and daw/raw: "rin"/"raw" after a vowel or w/y, "din"/"daw" after a consonant
      // (and after -ra/-ri/-re/-ro/-raw/-ray, to avoid "rara" sounds)
      if (lang === "fil" && /^(din|rin|daw|raw)$/.test(fixedLower)) {
        const useR = /[aeiouwy]$/.test(p) && !/(ra|ri|re|ro|raw|ray)$/.test(p);
        const want = (useR ? "r" : "d") + fixedLower.slice(1);
        if (want !== fixedLower) fixed = matchCase(fixed, want);
      }
    }

    tokens.push({ text: fixed, changed: fixed !== part });
    wordIndex++;
  }

  // Phrase fixes swap one word for another, so tokens line up one-to-one before and after
  const phraseFixes = lang === "fil" ? FIL_PHRASE_FIXES : EN_PHRASE_FIXES;
  const joined = tokens.map(t => t.text).join("");
  const rephrased = phraseFixes.reduce((s, [re, to]) => s.replace(re, to), joined);
  if (rephrased !== joined) {
    const newParts = rephrased.split(SPLIT).filter(Boolean);
    if (newParts.length === tokens.length) {
      newParts.forEach((p, i) => { if (p !== tokens[i]!.text) tokens[i] = { text: p, changed: true }; });
    }
  }

  // Capitalise the first word
  const first = tokens.find(t => /[A-Za-zÀ-ÿ]/.test(t.text));
  if (first && first.text[0] !== first.text[0]!.toUpperCase()) {
    first.text = first.text[0]!.toUpperCase() + first.text.slice(1);
    first.changed = true;
  }

  // Questions end with a question mark; in Filipino, "ba" also marks a question
  let text = tokens.map(t => t.text).join("");
  const isQuestion = QUESTION_START.test(text) || (lang === "fil" && /\bba\b/i.test(text));
  if (isQuestion && !/[?.!]$/.test(text)) {
    tokens.push({ text: "?", changed: true });
    text += "?";
  }

  // Only a capital letter or a question mark added ("give" -> "Give"): not worth interrupting the visitor
  const words = (s: string) => s.toLowerCase().replace(/[?.!\s]+$/, "").replace(/\s+/g, " ").trim();
  if (words(text) === words(trimmed)) return null;
  // Same words as the sure fixes alone (capital letters and the question mark aside)?
  return { text, tokens, language: lang, allSure: words(text) === words(sureCorrection(trimmed, languageHint)) };
}

/**
 * The message with only the sure fixes applied: shorthand and common misspellings from the fix lists
 * ("wher" -> "where", "teh" -> "the", "pano" -> "paano"). This is what is sent when the visitor doesn't
 * tap a suggestion. Closest-word guesses are never applied by themselves, because the word lists can't
 * know every real word ("give" is not "live", "son" is not "sun", "kill" is not "will"); ZooBot's
 * server corrects misspelt zoo words ("crocodle", "tigr") on its own.
 */
export function sureCorrection(input: string, languageHint: string = "en"): string {
  const parts = input.split(SPLIT);
  const lang = detectLanguage(parts.filter(p => WORD.test(p)).map(p => p.toLowerCase()), languageHint === "fil" ? "fil" : "en");
  let wordIndex = 0;
  return parts.map(part => {
    if (!WORD.test(part)) return part;
    const fix = knownFix(part.toLowerCase(), lang, wordIndex++ === 0);
    return fix ? matchCase(part, fix) : part;
  }).join("");
}
