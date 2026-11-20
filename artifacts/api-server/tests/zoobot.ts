/**
 * ZooBot behaviour test against the RUNNING API and AI service. Read-only apart from the chat
 * history rows the conversations create (session ids start with "zoobot-test-").
 *
 *   npx tsx ./tests/zoobot.ts                       (API at http://127.0.0.1:5000)
 *   set ZOOBOT_API=http://127.0.0.1:5099&& npx tsx ./tests/zoobot.ts
 *
 * Each case is a conversation (follow-ups share a session). Expectations come from the zoo's
 * database as of 2026-10-30: e.g. the Zebra has no habitat or conservation status recorded, so
 * those answers must say the information is not available.
 */
const API = `${process.env["ZOOBOT_API"] ?? "http://127.0.0.1:5000"}/api`;

const OUT_OF_SCOPE = "Sorry, I can only assist with questions related to Manila Zoo. You can ask me about animals, exhibits, facilities, navigation, and visitor information.";
const MISSING = "Sorry, that information is not currently available in the Manila Zoo database.";
// A spot inside the zoo, on the walkway near the Aviary (lat, lng)
const INSIDE: [number, number] = [14.56505, 120.98845];

type Reply = { reply: string; intent: string; route?: { from_name: string; to_name: string }; location?: { name: string } };
type Check = { says?: RegExp; notSays?: RegExp; is?: string; intent?: string | string[]; route?: boolean; routeTo?: RegExp; routeFrom?: RegExp; location?: RegExp };
type Step = { ask: string; at?: [number, number]; expect: Check };
type Case = { group: string; name: string; steps: Step[] };

const one = (group: string, ask: string, expect: Check, at?: [number, number]): Case => ({ group, name: ask, steps: [{ ask, expect, at }] });

const CASES: Case[] = [
  // ── One specific question = one specific answer ──
  one("Specific answers", "What does the zebra eat?", { intent: "animal_info", says: /herbivore/i, notSays: /stripes|Equus|scientific|family|Savannah|horse/i }),
  one("Specific answers", "What's does the zebra eat?", { intent: "animal_info", says: /grass/i, notSays: /stripes|Equus|horse/i }),
  one("Specific answers", "What does the lion eat?", { intent: "animal_info", says: /carnivore/i, notSays: /Panthera|Savanna|Vulnerable|pride/i }),
  one("Specific answers", "What is the habitat of the lion?", { intent: "animal_info", says: /savanna and grassland/i, notSays: /carnivore|Panthera|Apex/i }),
  one("Specific answers", "What is the scientific name of the lion?", { intent: "animal_info", says: /Panthera leo/, notSays: /carnivore|savanna|Vulnerable/i }),
  one("Specific answers", "How does the lion look?", { intent: "animal_info", says: /190 kg|largest wild cat/i, notSays: /Panthera leo|carnivore|roar|pride/i }),
  one("Specific answers", "What does the zebra look like?", { intent: "animal_info", says: /stripes/i, notSays: /herbivore|grass|Equus/i }),
  one("Specific answers", "What is the conservation status of the lion?", { intent: "animal_info", says: /Vulnerable/, notSays: /carnivore|Panthera/i }),
  one("Specific answers", "When is the lion fed?", { intent: "animal_info", says: /10:00 AM/ }),
  one("Specific answers", "What is the scientific name of the saltwater crocodile?", { says: /Crocodylus porosus/, notSays: /Least Concern|Outdoor/i }),

  // ── Missing information is reported, never filled in ──
  one("Missing info", "What is the conservation status of the zebra?", { is: MISSING }),
  one("Missing info", "What is the habitat of the zebra?", { is: MISSING }),
  one("Missing info", "When is the zebra fed?", { is: MISSING }),
  one("Missing info", "How heavy is the zebra?", { is: MISSING }),

  // ── Location vs navigation ──
  one("Location vs navigation", "Where is the lion?", { intent: "animal_location", says: /Apex Predators/, route: false, notSays: /Walk \d+ m|Start at/i, location: /Apex Predators/ }),
  one("Location vs navigation", "Where can I find the zebra?", { intent: "animal_location", says: /Zebra is in the Zebra exhibit/, route: false }),
  one("Location vs navigation", "Saan makikita ang leon?", { intent: "animal_location", says: /Apex Predators/, route: false }),
  one("Location vs navigation", "Which exhibit is the white tiger in?", { intent: "animal_location", says: /Apex Predators/, route: false }),
  one("Location vs navigation", "Where is the Aviary?", { intent: "animal_location", says: /Aviary/, route: false }),
  // The Elephant & Hippopotamus exhibit became the Zebra exhibit (2026-11-13): elephants are not found
  one("Location vs navigation", "Where is the elephant?", { says: /couldn't find "elephant"/i, notSays: /Elephant & Hippopotamus/, route: false }),
  one("Location vs navigation", "Where is the hyena?", { says: /couldn't find "hyena"/i, route: false }),
  one("Location vs navigation", "Where is the ostrich?", { intent: "animal_location", says: /Savannah/, route: false }),
  one("Location vs navigation", "Where is the Savannah?", { intent: "animal_location", says: /Savannah/, route: false }),
  one("Location vs navigation", "Where is the unicorn?", { says: /couldn't find "unicorn"/i, route: false }),
  one("Location vs navigation", "How do I get to the lion exhibit?", { intent: "navigation", route: true, routeTo: /Apex Predators/, routeFrom: /Main Entrance/, says: /Main Entrance because I don't know where you are/ }),
  one("Location vs navigation", "How do I get to the lion exhibit?", { intent: "navigation", route: true, routeTo: /Apex Predators/, routeFrom: /your location/, notSays: /because I don't know where you are/ }, INSIDE),
  one("Location vs navigation", "Paano pumunta sa Savannah?", { intent: "navigation", route: true, routeTo: /Savannah/ }, INSIDE),
  one("Location vs navigation", "Where is the nearest restroom?", { intent: "facilities", says: /nearest restroom to you is Restroom/i, route: false }, INSIDE),

  // ── Typos are corrected automatically ──
  one("Typos", "leoin habitat", { intent: "animal_info", says: /savanna and grassland/i }),
  one("Typos", "what does the elefant eat", { notSays: /herbivore|carnivore|grass|Hippopotamus/i }),
  one("Typos", "zebraaa diet", { intent: "animal_info", says: /herbivore/i }),
  one("Typos", "where is the restrom", { intent: "facilities", says: /Restroom/ , route: false }),
  one("Typos", "crocadile scientific name", { says: /Crocodylus porosus/ }),
  one("Typos", "wher can i fnd the capybra?", { intent: "animal_location", says: /Capybara/, route: false }),
  one("Typos", "magkanu ang entrnce fee", { intent: "tickets", says: /₱|Libre|Free/ }),

  // ── Follow-up questions keep the animal ──
  { group: "Follow-ups", name: "zebra: diet → habitat → location → directions", steps: [
    { ask: "What does the zebra eat?", expect: { says: /herbivore/i } },
    { ask: "What about its habitat?", expect: { intent: "animal_info", is: MISSING } },
    { ask: "Where can I find it?", expect: { intent: "animal_location", says: /Zebra is in the Zebra exhibit/, route: false } },
    { ask: "How do I get there?", expect: { intent: "navigation", route: true, routeTo: /Zebra/ } },
  ] },
  { group: "Follow-ups", name: "lion: diet → habitat → scientific name → location", steps: [
    { ask: "What does the lion eat?", expect: { says: /carnivore/i } },
    { ask: "What about its habitat?", expect: { says: /savanna and grassland/i, notSays: /carnivore/i } },
    { ask: "And its scientific name?", expect: { says: /Panthera leo/ } },
    { ask: "Where can I find it?", expect: { says: /Apex Predators/, route: false } },
  ] },
  { group: "Follow-ups", name: "Filipino: tigre diet → saan siya", steps: [
    { ask: "Ano ang kinakain ng tigre?", expect: { says: /White Bengal Tiger/ } },
    { ask: "Saan siya makikita?", expect: { says: /Apex Predators/, route: false } },
  ] },

  // ── Strict Manila Zoo scope ──
  ...["What is the nearest LRT station?", "Any good restaurants near Manila Zoo?", "Best hotels near Manila Zoo", "Tell me about Avilon Zoo",
    "Who is the president of the Philippines?", "What is the capital of Japan?", "Saan may mall malapit dito?", "Recommend a good movie",
    "What is 25 times 4?", "How do I get to Manila Zoo from Cubao?", "What's the largest animal in the world?"]
    // Filipino questions get the same reply in Filipino
    .map(q => one("Out of scope", q, /\b(saan|may|malapit|dito)\b/i.test(q) ? { intent: "out_of_scope", says: /makakatulong lamang ako sa mga tanong tungkol sa Manila Zoo/, route: false } : { is: OUT_OF_SCOPE, route: false })),
  one("Out of scope", "Is there a restaurant inside the zoo?", { notSays: /can only assist/ }),
  one("Out of scope", "Where can I eat?", { notSays: /can only assist/ }),

  // ── English, Filipino and Taglish ──
  one("Languages", "Ano ang diet ng lion?", { says: /carnivore/i }),
  one("Languages", "Anong scientific name ng tigre?", { says: /Panthera tigris/ }),
  one("Languages", "Ano ang tirahan ng leon?", { says: /savanna/i }),
  one("Languages", "Saan ang CR?", { intent: "facilities", says: /Restroom/ }),

  // ── Existing features still work ──
  one("Existing features", "Hello", { intent: "greeting", says: /ZooBot/ }),
  one("Existing features", "What time does the zoo open?", { intent: "zoo_hours", says: /9:00/ }),
  one("Existing features", "How much is the ticket?", { intent: "tickets", says: /₱|Free/ }),
  one("Existing features", "My child is lost", { intent: "emergency", says: /security/i }),
  one("Existing features", "Where is the first aid station?", { intent: "emergency", says: /security/i, route: true }),
  one("Existing features", "Are there any events this weekend?", { intent: "events" }),
  one("Existing features", "Where can I park?", { intent: "parking", says: /Adriatico/ }),
  one("Existing features", "Can I bring my dog?", { says: /pet|not allowed|bawal/i }),
  one("Existing features", "Thank you", { says: /welcome/i }),
  one("Existing features", "What animals are there?", { says: /African Lion/ }),
  one("Existing features", "Tell me about the capybara", { says: /rodent/i }),
];

function check(r: Reply, e: Check): string[] {
  const problems: string[] = [];
  const intents = e.intent ? [e.intent].flat() : null;
  if (intents && !intents.includes(r.intent)) problems.push(`intent ${r.intent}, expected ${intents.join("/")}`);
  if (e.is && r.reply !== e.is) problems.push("reply is not the exact expected text");
  if (e.says && !e.says.test(r.reply)) problems.push(`reply lacks ${e.says}`);
  if (e.notSays && e.notSays.test(r.reply)) problems.push(`reply has unrelated ${e.notSays}`);
  if (e.route === true && !r.route) problems.push("no route");
  if (e.route === false && r.route) problems.push("unexpected walking route");
  if (e.routeTo && !e.routeTo.test(r.route?.to_name ?? "")) problems.push(`route to ${r.route?.to_name}`);
  if (e.routeFrom && !e.routeFrom.test(r.route?.from_name ?? "")) problems.push(`route from ${r.route?.from_name}`);
  if (e.location && !e.location.test(r.location?.name ?? "")) problems.push(`location ${r.location?.name}`);
  return problems;
}

let pass = 0, fail = 0;
const byGroup = new Map<string, { pass: number; total: number }>();
for (const c of CASES) {
  const session_id = `zoobot-test-${Math.random().toString(36).slice(2, 10)}`;
  const problems: string[] = [];
  const transcript: string[] = [];
  for (const step of c.steps) {
    const res = await fetch(`${API}/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: step.ask, session_id, language: "en", ...(step.at ? { context_lat: step.at[0], context_lng: step.at[1] } : {}) }),
    });
    const r = (await res.json()) as Reply;
    transcript.push(`    > ${step.ask}${step.at ? "  [visitor located inside the zoo]" : ""}\n      [${r.intent}${r.route ? `, route ${r.route.from_name} → ${r.route.to_name}` : ""}] ${r.reply.replace(/\n/g, "\n      ")}`);
    problems.push(...check(r, step.expect).map(p => `"${step.ask}": ${p}`));
  }
  const ok = problems.length === 0;
  ok ? pass++ : fail++;
  const g = byGroup.get(c.group) ?? { pass: 0, total: 0 };
  byGroup.set(c.group, { pass: g.pass + (ok ? 1 : 0), total: g.total + 1 });
  console.log(`${ok ? "PASS" : "FAIL"} [${c.group}] ${c.name}${ok ? "" : `\n    ${problems.join("\n    ")}`}\n${transcript.join("\n")}\n`);
}
console.log("Summary by group:");
for (const [g, s] of byGroup) console.log(`  ${g.padEnd(24)} ${s.pass}/${s.total}`);
console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} cases`);
process.exit(fail ? 1 : 0);
