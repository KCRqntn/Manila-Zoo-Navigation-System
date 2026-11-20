import { db, animalsTable, mapPinsTable } from "@workspace/db";

/**
 * Spelling correction for ZooBot, run on every message before intent classification and database
 * lookups, so "leoin", "elefant", "zebraaa", "restrom" and "crocadile" are understood without
 * asking the visitor what they meant.
 *
 * Words are corrected against a Manila Zoo vocabulary: the animals' and map places' names from the
 * database, plus fixed lists of animal, facility, visitor-information and question words in English
 * and Filipino (including the words for out-of-scope topics, so a misspelt "hotle" still reaches
 * the scope check as "hotel"). A word is changed only when:
 *   - it has 4+ letters and isn't already a known English or Filipino word, and
 *   - after allowing for spelling variants (repeated letters, ph/f, c/k), it is within one typo of
 *     a vocabulary word (two for words of 8+ letters), starts with the same letter, and
 *   - exactly one vocabulary word is the closest; a tie means the intent is unclear, so the word
 *     is left as typed.
 */

// Words the vocabulary should know even though no database row spells them out
const FIXED_VOCABULARY = `
lion lions tiger tigers zebra zebras elephant elephants giraffe giraffes hippo hippopotamus gorilla panda penguin
kangaroo koala monkey monkeys macaque macaques gibbon lemur primate primates snake snakes python pythons cobra cobras
crocodile crocodiles alligator turtle tortoise tortoises lizard lizards monitor eagle eagles owl parrot cockatoo
hornbill pigeon peacock peafowl ostrich cassowary stork flamingo capybara deer camel rhinoceros cheetah leopard
jaguar dolphin butterfly butterflies tarsier carabao reptile reptiles mammal mammals birds animal animals hyena
leon tigre buwaya agila kuwago sawa ahas pagong usa bayawak unggoy matsing elepante kalapati kobra ibon hayop
restroom restrooms toilet toilets bathroom comfort entrance exit parking ticket tickets clinic canteen restaurant
souvenir wheelchair stroller emergency security guard aviary savana savanna savannah exhibit exhibits enclosure endemic
reptiles predators nearest where what directions route time hello pumunta
habitat diet scientific conservation status endangered vulnerable feeding schedule location directions direction
appearance weight height lifespan herbivore carnivore omnivore classification family species
event events announcement announcements program show shows hours open close closed admission discount senior student
banyo palikuran kubeta pasukan labasan paradahan tiket presyo magkano oras bukas sarado saan nasaan makikita
kinakain pagkain tirahan pagpapakain kulungan itsura kulay
hotel hotels station stations mall malls jeepney taxi airport weather president homework restaurant restaurants
`;

// Common real words that sit one or two letters from a vocabulary word and must never be "corrected"
// ("store" is not "stork", "loin" is not "lion", "dear" is not "deer", "exist" is not "exit")
const KNOWN_WORDS = new Set(`
the and for are can you what where when how does did why who which there their they them then than that this these
those with from have has had was were will would should could about into near nearest here hello please thanks thank
tell know want need like love look looks looking see seen show find found give take make made come came going gone get
got eat eats eating ate feed fed food good goods foot fool wood door dear deer beer bear bears near need seed feel feet
store stores stork loin line lino lime lone long lung tier tiger timer time tame tile tiles diet died dies date late
gate gates game part park dark bark mark exist exits edit edits extra open opens opened opening close closes closing
closed clothes cloth price prize prices pride ride side wide tide site bite kite kit kits mite dove love move done none
nine owl own bowl town show snow slow shoe shop stop step stay star start state status stats statue sea seal sell
seat bat but bit fish wish dish four your hour hours tour tours sour our ours far fair fare farm form from foam
where's what's there's here's it's that's let's who's how's
help held hell hold home hope house mouse horse horses hose host most must mist many much more mare mane maine
male mall malls ball call tall talk walk walks wall well will fill full pull pool cool tool fool food mood room rooms
zoom boom book look cook rest test best west vest nest list last lost cost post past fast cast vast mast must
long song sing ring king wing wings thing think thin skin skins sink pink pin pine fine mine wine nice rice mice
lice ice dice twice price pricey cheap cheaper money mommy daddy baby babies kids kid child children family
little small large big bigger biggest tall taller short shorter heavy light lighter weight height eight right night
might sight fight bright white black brown green yellow orange purple color colour colors gray grey golden
enter entry entries enters exiting exit inside outside around away back front left right straight turn turns
today tomorrow tonight morning afternoon evening week weekend month year years day days
lagi lang lamang naman nang ngayon bukas sarado kain kumain kinain ito iyan iyon dito diyan doon dun yung yun
ano anong saan nasaan sino paano bakit kailan magkano ilan alin gaano pwede puwede meron mayroon wala walang
sana siya sila kami tayo kayo niya nila natin namin ninyo amin akin iyo kanila kanya
mga ang ng sa si ni kay at o pero kasi dahil kung kapag para tungkol mula hanggang na pa nga din rin ba po opo oo
hindi huwag gusto ayaw dapat kailangan salamat paalam maganda magandang mahal mura libre lugar daan tao bata
three free greet great write while whale sitting count dive drive five give live alive have gave save wave
cute cool cold cart care card case cage cages kind kinds kill kick keep kept
`.split(/\s+/).filter(Boolean));

// Everyday words inside animal and place names ("Green Imperial Pigeon", "Food Court"): recognised as
// real words, but never a correction target, so "greet" or "count" aren't turned into them
const GENERIC_NAME_WORDS = new Set(`
common tree red green imperial footed ring tailed long white eared brown fruit double wattled painted indian blue
japanese spitting elongated water crested main gate walk house center centre court plaza island area section
stall north south east west food first zoo garden loop path the and big small little albino
`.split(/\s+/).filter(Boolean));

/** Spelling-variant form of a word: lowercase, "ph" as "f", "c"/"q" as "k", repeated letters once. */
function skeleton(word: string): string {
  return word.toLowerCase().replace(/ph/g, "f").replace(/ck/g, "k").replace(/[cq]/g, "k").replace(/(\p{L})\1+/gu, "$1");
}

/** Edit distance where swapping two neighbouring letters counts as one typo (Damerau–Levenshtein, restricted). */
export function editDistance(a: string, b: string): number {
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
  return prev[b.length]!;
}

export type Vocabulary = { words: Set<string>; bySkeleton: Map<string, string> };

/** Builds a vocabulary from names (each split into words of 3+ letters) and the fixed word lists. */
export function buildVocabulary(names: Iterable<string | null | undefined>): Vocabulary {
  const words = new Set<string>();
  const split = (s: string | null | undefined) => String(s ?? "").toLowerCase().split(/[^\p{L}]+/u).filter(w => w.length >= 3);
  for (const name of names) for (const w of split(name)) words.add(w);
  const fixed = split(FIXED_VOCABULARY);
  fixed.forEach(w => words.add(w));
  // Correction targets: the zoo's distinctive words; generic name words are only recognised
  const bySkeleton = new Map<string, string>();
  for (const w of [...fixed, ...words]) {
    if (!GENERIC_NAME_WORDS.has(w) && !bySkeleton.has(skeleton(w))) bySkeleton.set(skeleton(w), w);
  }
  return { words, bySkeleton };
}

// The zoo's names change only when an admin edits them, so the vocabulary is rebuilt every 5 minutes
const VOCABULARY_MS = 5 * 60_000;
let cached: { vocabulary: Vocabulary; at: number } | null = null;

/** The Manila Zoo vocabulary: animal and map-place names from the database plus the fixed word lists. */
export async function zooVocabulary(extraTerms: Iterable<string> = []): Promise<Vocabulary> {
  if (cached && Date.now() - cached.at < VOCABULARY_MS) return cached.vocabulary;
  const [animals, pins] = await Promise.all([
    db.select({ name: animalsTable.name, commonName: animalsTable.commonName }).from(animalsTable),
    db.select({ name: mapPinsTable.name }).from(mapPinsTable),
  ]);
  const vocabulary = buildVocabulary([...animals.flatMap(a => [a.name, a.commonName]), ...pins.map(p => p.name), ...extraTerms]);
  cached = { vocabulary, at: Date.now() };
  return vocabulary;
}

// Vocabulary words that mean the same animal in Filipino and English, so a typo close to both isn't a tie
const SAME_MEANING: Record<string, string> = { tigre: "tiger", tigers: "tiger", leon: "lion", kobra: "cobra", elepante: "elephant" };

/** The vocabulary word a misspelt word stands for, or null when it's a real word or the match isn't clear. */
export function correctWord(word: string, vocabulary: Vocabulary): string | null {
  const lower = word.toLowerCase();
  if (lower.length < 4 || /['’\d]/.test(lower) || KNOWN_WORDS.has(lower) || vocabulary.words.has(lower)) return null;
  const sk = skeleton(lower);
  // A spelling variant of a vocabulary word ("zebraaa", "restrom", "elefant", "orass") is a sure match
  const variant = vocabulary.bySkeleton.get(sk);
  if (variant) return variant;
  // A plural of a known word ("lions", "stores") is a real word too
  const singular = lower.replace(/(es|s)$/, "");
  if (KNOWN_WORDS.has(singular) || vocabulary.words.has(singular)) return null;
  const max = lower.length >= 8 ? 2 : 1;
  let best: string[] = [];
  let bestDistance = Infinity;
  for (const [vsk, w] of vocabulary.bySkeleton) {
    // Same first letter as typed: "cute" is never "kite", even though c and k sound alike
    if (w[0] !== lower[0] || Math.abs(vsk.length - sk.length) > max) continue;
    const d = editDistance(sk, vsk);
    if (d > max) continue;
    if (d < bestDistance) { bestDistance = d; best = [w]; }
    else if (d === bestDistance) best.push(w);
  }
  // Several equally close words ("tigr": tiger or tigre?) mean different things unless they're just
  // singular and plural of one word, so the word is only changed when the match is unique
  // Filipino and English names of the same animal ("tigre"/"tiger") are one meaning too
  const distinct = [...new Set(best.map(w => SAME_MEANING[w] ?? w.replace(/(es|s)$/, "")))];
  return distinct.length === 1 ? best.sort((a, b) => a.length - b.length)[0]! : null;
}

export type Correction = { from: string; to: string };

/** The message with misspelt zoo words corrected, and the list of corrections made. */
export function correctSpelling(message: string, vocabulary: Vocabulary): { text: string; corrections: Correction[] } {
  const corrections: Correction[] = [];
  const text = message.replace(/[\p{L}'’]+/gu, word => {
    const fixed = correctWord(word, vocabulary);
    if (!fixed || fixed === word.toLowerCase()) return word;
    corrections.push({ from: word, to: fixed });
    return fixed;
  });
  return { text, corrections };
}
