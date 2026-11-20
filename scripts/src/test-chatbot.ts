/**
 * ZooBot regression tests: sends every case in chatbot-test-cases.ts to the running API and checks the
 * answers, then checks that every emergency sentence in the AI training and test data still gets the
 * emergency answer. Run it after any change to the chatbot or a retrained model.
 *
 *   pnpm test:chatbot                    run everything (the AI service, API and database must be running)
 *   pnpm test:chatbot -- --report        also write chatbot-test-report.md in the project folder
 *   pnpm test:chatbot -- --verbose       print every case, not only failures
 *   pnpm test:chatbot -- --no-dataset    skip the training-data emergency check
 *   pnpm test:chatbot -- --as-typed      send messages exactly as written, without the chat box's corrections
 *
 * CHATBOT_API_URL changes the endpoint (default http://127.0.0.1:5000/api/chat).
 * Exits with code 1 when any case fails (known issues don't count). Test messages are saved in the
 * chat history like real ones, under session ids starting with "test-".
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { GROUPS, type ChatCase } from "./chatbot-test-cases";

const API = process.env.CHATBOT_API_URL ?? "http://127.0.0.1:5000/api/chat";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = new Set(process.argv.slice(2));
const verbose = args.has("--verbose");
const writeReport = args.has("--report");
const withDataset = !args.has("--no-dataset");
const RUN = randomUUID().slice(0, 8);

const color = process.stdout.isTTY
  ? { green: (s: string) => `\x1b[32m${s}\x1b[0m`, red: (s: string) => `\x1b[31m${s}\x1b[0m`, yellow: (s: string) => `\x1b[33m${s}\x1b[0m`, dim: (s: string) => `\x1b[2m${s}\x1b[0m`, bold: (s: string) => `\x1b[1m${s}\x1b[0m` }
  : { green: (s: string) => s, red: (s: string) => s, yellow: (s: string) => s, dim: (s: string) => s, bold: (s: string) => s };

type Answer = { reply: string; intent: string; sent: string; location: string | null };

// The AI Guide page corrects some words in the chat box before sending (artifacts/manila-zoo/src/lib/
// chatCorrect.ts); the tests send what the page would, so a bad correction there fails them too.
// --as-typed skips this and sends the messages exactly as written.
type ChatBoxCorrection = (text: string, language?: string) => string;
let chatBox: ChatBoxCorrection = text => text;
async function loadChatBox() {
  if (args.has("--as-typed")) return;
  const file = path.join(ROOT, "artifacts", "manila-zoo", "src", "lib", "chatCorrect.ts");
  const mod = (await import(pathToFileURL(file).href)) as { sureCorrection?: ChatBoxCorrection };
  if (!mod.sureCorrection) throw new Error(`sureCorrection not found in ${file}`);
  chatBox = mod.sureCorrection;
}

async function ask(typed: string, session: string): Promise<Answer> {
  const message = chatBox(typed, "en");
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, language: "en", session_id: `test-${RUN}-${session}` }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { reply?: string; intent?: string | null; location?: { name?: string } | null };
  return { reply: body.reply ?? "", intent: body.intent ?? "", sent: message, location: body.location?.name ?? null };
}

/** What's wrong with an answer, or an empty list when it meets the case's expectations */
function problems(c: ChatCase, a: Answer): string[] {
  const out: string[] = [];
  const intents = c.intent == null ? [] : Array.isArray(c.intent) ? c.intent : [c.intent];
  if (intents.length && !intents.includes(a.intent)) out.push(`intent "${a.intent}", expected ${intents.map(i => `"${i}"`).join(" or ")}`);
  const reply = a.reply.toLowerCase();
  for (const text of c.includes ?? []) if (!reply.includes(text.toLowerCase())) out.push(`reply lacks "${text}"`);
  for (const text of c.excludes ?? []) if (reply.includes(text.toLowerCase())) out.push(`reply contains "${text}"`);
  if (c.location !== undefined && a.location !== c.location) out.push(`"Show on map" place is ${a.location == null ? "missing" : `"${a.location}"`}, expected ${c.location == null ? "none" : `"${c.location}"`}`);
  return out;
}

const short = (s: string, n = 90) => { const one = s.replace(/\s+/g, " ").trim(); return one.length > n ? `${one.slice(0, n - 1)}…` : one; };

/** Rows of a CSV file with a header (handles quoted fields with commas and doubled quotes) */
function readCsv(file: string): Record<string, string>[] {
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(f => f !== "")) rows.push(row);
  const [header, ...data] = rows;
  return data.map(r => Object.fromEntries(header!.map((h, i) => [h.trim(), r[i] ?? ""])));
}

type Result = { group: string; c: ChatCase; answer?: Answer; issues: string[] };

async function main() {
  await loadChatBox();
  // The API must be up before anything else is worth trying
  try { await ask("hello", "ping"); }
  catch (error) {
    console.error(color.red(`Can't reach the chatbot API at ${API}: ${(error as Error).message}`));
    console.error("Start the system first (start-zoo.cmd), wait about a minute, then run this again.");
    process.exit(2);
  }

  const started = Date.now();
  const results: Result[] = [];
  console.log(color.bold(`ZooBot tests against ${API}${args.has("--as-typed") ? " (as typed)" : " (through the chat box's corrections)"}\n`));

  for (const group of GROUPS) {
    const groupResults: Result[] = [];
    for (const [i, c] of group.cases.entries()) {
      // Cases without a session each get their own conversation, so earlier ones can't affect them
      const session = c.session ? `${group.name}-${c.session}` : `${group.name}-${i}`;
      let answer: Answer | undefined, issues: string[];
      try { answer = await ask(c.message, session.replace(/\W+/g, "-")); issues = problems(c, answer); }
      catch (error) { issues = [`request failed: ${(error as Error).message}`]; }
      groupResults.push({ group: group.name, c, answer, issues });
    }
    results.push(...groupResults);

    const failed = groupResults.filter(r => r.issues.length && !r.c.known).length;
    const total = groupResults.length;
    const mark = failed ? color.red("✗") : color.green("✓");
    console.log(`${mark} ${group.name} ${color.dim(`(${total - failed}/${total})`)}`);
    for (const r of groupResults) {
      const ok = r.issues.length === 0;
      if (ok && !r.c.known && !verbose) continue;
      const label = ok ? (r.c.known ? color.yellow("FIXED?") : color.green("pass")) : r.c.known ? color.yellow("known") : color.red("FAIL");
      console.log(`    ${label}  ${short(r.c.message, 70)}`);
      if (!ok && r.answer && r.answer.sent !== r.c.message) console.log(color.dim(`           chat box sent: "${short(r.answer.sent, 80)}"`));
      if (!ok) console.log(color.dim(`           ${r.issues.join("; ")}\n           got [${r.answer?.intent ?? "-"}] ${short(r.answer?.reply ?? "", 100)}`));
      if (ok && r.c.known) console.log(color.dim(`           known issue "${r.c.known}" now passes: remove the "known" flag from this case`));
      if (!ok && r.c.known) console.log(color.dim(`           ${r.c.known}`));
    }
  }

  // Every emergency sentence the model was trained or evaluated on must still get the emergency answer
  let datasetLine = "";
  const datasetMisses: { text: string; got: string }[] = [];
  if (withDataset) {
    const files = ["ai-training/data/train.csv", "ai-training/data/test.csv"].map(f => path.join(ROOT, f)).filter(existsSync);
    const sentences = files.flatMap(readCsv).filter(r => r.intent === "emergency").map(r => r.text!).filter(Boolean);
    for (const [i, text] of sentences.entries()) {
      try {
        const a = await ask(text, `dataset-${i}`);
        // "Nasaan ang clinic?" asks where a facility is; the first-aid answer as a facility is fine
        if (a.intent !== "emergency" && !(a.intent === "facilities" && /clinic/i.test(text))) datasetMisses.push({ text, got: a.intent });
      } catch (error) { datasetMisses.push({ text, got: `error: ${(error as Error).message}` }); }
    }
    const ok = sentences.length - datasetMisses.length;
    datasetLine = `Emergency sentences from the training data: ${ok}/${sentences.length}`;
    console.log(`${datasetMisses.length ? color.red("✗") : color.green("✓")} ${datasetLine.replace(/: /, " ")}`);
    for (const m of datasetMisses) console.log(`    ${color.red("FAIL")}  ${short(m.text, 70)} ${color.dim(`→ ${m.got}`)}`);
  }

  const failures = results.filter(r => r.issues.length && !r.c.known);
  const known = results.filter(r => r.c.known);
  const knownStill = known.filter(r => r.issues.length);
  const passed = results.length - failures.length - known.length;
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const allOk = failures.length === 0 && datasetMisses.length === 0;

  console.log(`\n${allOk ? color.green(color.bold("ALL PASSED")) : color.red(color.bold(`${failures.length + datasetMisses.length} FAILED`))}  ` +
    `${passed}/${results.length - known.length} cases passed` +
    (known.length ? `, ${knownStill.length} known issue${knownStill.length === 1 ? "" : "s"} still open${known.length > knownStill.length ? `, ${known.length - knownStill.length} known issue(s) now pass` : ""}` : "") +
    (datasetLine ? `; ${datasetLine.toLowerCase()}` : "") + color.dim(`  (${seconds}s)`));

  if (writeReport) {
    const when = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const lines = [
      "# ZooBot Test Report",
      "",
      `Run on ${when} against \`${API}\` (${seconds}s). Generated by \`pnpm test:chatbot -- --report\`.`,
      "",
      `**Result: ${allOk ? "all passed" : `${failures.length + datasetMisses.length} failed`}.** ${passed} of ${results.length - known.length} test cases passed` +
        (known.length ? `; ${knownStill.length} known issue(s) still open.` : "."),
      "",
      "| Group | Passed | Failed | Known issues |",
      "|---|---|---|---|",
      ...GROUPS.map(g => {
        const rs = results.filter(r => r.group === g.name);
        const k = rs.filter(r => r.c.known).length;
        const f = rs.filter(r => r.issues.length && !r.c.known).length;
        return `| ${g.name} | ${rs.length - f - k} | ${f} | ${k || ""} |`;
      }),
      ...(datasetLine ? [`| Emergency sentences from the training data | ${datasetLine.split(": ")[1]!.split("/")[0]} | ${datasetMisses.length} | |`] : []),
      "",
    ];
    if (failures.length || datasetMisses.length) {
      lines.push("## Failures", "", "| Question | Problem | Answer |", "|---|---|---|");
      for (const r of failures) lines.push(`| ${md(r.c.message)} | ${md(r.issues.join("; "))} | [${r.answer?.intent ?? "-"}] ${md(short(r.answer?.reply ?? "", 120))} |`);
      for (const m of datasetMisses) lines.push(`| ${md(m.text)} | not answered as an emergency | [${m.got}] |`);
      lines.push("");
    }
    if (known.length) {
      lines.push("## Known issues", "", "| Question | Issue | Status |", "|---|---|---|");
      for (const r of known) lines.push(`| ${md(r.c.message)} | ${md(r.c.known!)} | ${r.issues.length ? "open" : "now passes"} |`);
      lines.push("");
    }
    lines.push("## All answers", "");
    for (const g of GROUPS) {
      lines.push(`### ${g.name}`, "", "| | Question | Intent | Answer |", "|---|---|---|---|");
      for (const r of results.filter(x => x.group === g.name)) {
        const mark = r.issues.length ? (r.c.known ? "⚠️" : "❌") : "✅";
        lines.push(`| ${mark} | ${md(short(r.c.message, 80))} | ${r.answer?.intent ?? "-"} | ${md(short(r.answer?.reply ?? r.issues.join("; "), 160))} |`);
      }
      lines.push("");
    }
    const file = path.join(ROOT, "chatbot-test-report.md");
    writeFileSync(file, lines.join("\n"), "utf8");
    console.log(`Report written to ${file}`);
  }

  process.exit(allOk ? 0 : 1);
}

const md = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ");

main().catch(error => { console.error(error); process.exit(2); });
