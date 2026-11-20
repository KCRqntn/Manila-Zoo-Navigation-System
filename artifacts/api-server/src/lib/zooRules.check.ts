import { answerRuleQuestion } from "./zooRules";

// Quick check of which questions trigger a rule answer: tsx src/lib/zooRules.check.ts
const cases: [string, boolean][] = [
  ["Pwede ba magdala ng baon?", true],
  ["can I bring my dog?", true],
  ["are pets allowed", true],
  ["bawal ba manigarilyo dito?", true],
  ["Is there a smoking area?", true],
  ["can we bring balloons", true],
  ["What are the zoo rules?", true],
  ["ano ang mga bawal sa zoo", true],
  ["can I feed the elephant?", true],
  ["pwede bang pakainin ang mga hayop?", true],
  ["pwede ba tumapak sa damo", true],
  ["pwede ba pumitas ng bulaklak", true],
  // must NOT trigger
  ["Where are the big cats?", false],
  ["When do they feed the crocodiles?", false],
  ["where can I eat", false],
  ["saan ang banyo", false],
  ["Where is the Butterfly Garden?", false],
  ["What time do you open?", false],
];
let failed = 0;
for (const [q, expected] of cases) {
  const got = answerRuleQuestion(q, "en") != null;
  if (got !== expected) failed++;
  console.log(`${got === expected ? "ok  " : "FAIL"} ${expected ? "rule   " : "no rule"}  ${q}`);
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
