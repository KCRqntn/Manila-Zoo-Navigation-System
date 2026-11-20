import React from "react";
import { Accessibility, Link2, Minus, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * "Your Companions Today": the people visiting with the registered visitor on this visit, once each.
 * Each companion has an age and one age category (child under 18, adult 18–59, senior citizen 60+ as
 * in RA 9994). The registered visitor is always included from their own age, so the group size is
 * 1 + companions. PWD is chosen from those same people (the visitor or a companion), so a senior who
 * is a PWD is still one person; no disability details are asked. Used for a first visit and for every
 * later visit (each visit starts with no companions: companions never carry over).
 * A companion who has their own visitor account can be linked with their email + Visitor ID, so the
 * server counts that person once per visit day even if they also register (or are listed) elsewhere.
 * Companions without an account (babies, children, seniors without a phone) need only an age.
 */
export type Category = "child" | "adult" | "senior";
export const CATS: { key: Category; min: number; max: number; en: string; fil: string; one: [string, string]; range: [string, string] }[] = [
  { key: "child", min: 0, max: 17, en: "Children", fil: "Mga bata", one: ["Child", "Bata"], range: ["below 18", "wala pang 18"] },
  { key: "adult", min: 18, max: 59, en: "Adults", fil: "Mga adult", one: ["Adult", "Adult"], range: ["18 to 59", "18 hanggang 59"] },
  { key: "senior", min: 60, max: 120, en: "Senior citizens", fil: "Mga senior citizen", one: ["Senior citizen", "Senior citizen"], range: ["60 and above", "60 pataas"] },
];
export const categoryOf = (age: number): Category => (age < 18 ? "child" : age < 60 ? "adult" : "senior");
export const wholeNumber = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN);
/** The registrant's category, or null while their age isn't a valid 1–120 */
export const registrantCategory = (age: number): Category | null => (Number.isInteger(age) && age >= 1 && age <= 120 ? categoryOf(age) : null);

/** A companion with their own visitor account: which person (key) and their email + Visitor ID */
export type Link = { key: string; email: string; code: string };
export type Group = { others: Record<Category, string[]>; pwdPicks: string[]; pwd_consent: boolean; links: Link[] };
export const emptyGroup = (): Group => ({ others: { child: [], adult: [], senior: [] }, pwdPicks: [], pwd_consent: false, links: [] });
export type Person = { key: string; category: Category; age: string; you: boolean; label: string };
export type Member = { age: number; category: Category; is_pwd: boolean; is_registrant: boolean; link?: { email: string; code: string } };

const tr = (fil: boolean) => (en: string, tl: string) => (fil ? tl : en);

/** Everyone in the group: the registrant first, then the others by category */
export function peopleOf(group: Group, yourAge: number, fil: boolean): Person[] {
  const L = tr(fil);
  const yourCat = registrantCategory(yourAge);
  const list: Person[] = [];
  if (yourCat) list.push({ key: "you", category: yourCat, age: String(yourAge), you: true, label: L("You", "Ikaw") });
  for (const c of CATS) group.others[c.key].forEach((age, i) => list.push({ key: `${c.key}-${i}`, category: c.key, age, you: false, label: `${L(c.one[0], c.one[1])} ${i + 1}` }));
  return list;
}

export const membersOf = (group: Group, yourAge: number, fil = false): Member[] => {
  const pwd = new Set(group.pwdPicks);
  return peopleOf(group, yourAge, fil).map(p => {
    const l = group.links.find(x => x.key === p.key);
    return { age: Number(p.age), category: p.category, is_pwd: pwd.has(p.key), is_registrant: p.you, ...(l ? { link: { email: l.email.trim(), code: l.code.trim().toUpperCase() } } : {}) };
  });
};

export const companionsOf = (group: Group) => CATS.reduce((n, c) => n + group.others[c.key].length, 0);

/** Errors keyed by field id (each age box, "group", "pwd", "pwd_consent"); companions = how many the visitor said are with them */
export function validateGroup(group: Group, yourAge: number, companions: number, fil: boolean): Record<string, string> {
  const L = tr(fil);
  const e: Record<string, string> = {};
  for (const c of CATS) group.others[c.key].forEach((a, i) => {
    const n = wholeNumber(a);
    if (a.trim() === "") e[`${c.key}-${i}`] = L("Enter this person's age.", "Ilagay ang edad ng taong ito.");
    else if (!Number.isInteger(n) || n < c.min || n > c.max) e[`${c.key}-${i}`] = L(`${c.one[0]} age must be ${c.range[0]}.`, `Ang edad ng ${c.one[1].toLowerCase()} ay dapat ${c.range[1]}.`);
  });
  const people = peopleOf(group, yourAge, fil);
  const listed = companionsOf(group);
  if (Number.isInteger(companions) && companions >= 0 && listed !== companions) {
    e["group"] = L(`You said ${companions} ${companions === 1 ? "person is" : "people are"} with you, but you listed ${listed}. Adjust the age groups so they match.`,
                   `Sinabi mong ${companions} ang kasama mo, pero ${listed} ang nailista mo. Ayusin ang mga grupo ng edad para magtugma.`);
  }
  if (group.pwdPicks.some(k => !k || !people.some(p => p.key === k))) e["pwd"] = L("Choose which person each PWD is.", "Piliin kung sino ang bawat PWD.");
  if (group.pwdPicks.length > 0 && !group.pwd_consent) e["pwd_consent"] = L("Please agree to recording PWD status, or set PWD to 0.", "Sumang-ayon sa pagtala ng PWD, o gawing 0 ang PWD.");
  group.links.forEach((l, i) => {
    if (!l.key || !people.some(p => p.key === l.key && !p.you)) e[`link-${i}`] = L("Choose which companion this is.", "Piliin kung sinong kasama ito.");
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.email.trim()) || !/^MZV-[0-9A-F]{6}$/i.test(l.code.trim()))
      e[`link-${i}`] = L("Enter their email and Visitor ID (MZV-…), as shown on their phone.", "Ilagay ang email at Visitor ID (MZV-…) nila, gaya ng nasa telepono nila.");
  });
  return e;
}

/** A number with − and + buttons, easy to tap on a phone; the number can also be typed */
export function Stepper({ id, value, min, max, onChange, onAboveMax, labels }: {
  id: string; value: number; min: number; max: number; onChange: (n: number) => void;
  /** Called when + is pressed (or a bigger number typed) at the maximum, to explain why */
  onAboveMax?: () => void; labels: [string, string];
}) {
  const change = (n: number) => {
    if (n <= max) { onChange(Math.max(min, n)); return; }
    if (value !== max) onChange(max);
    onAboveMax?.();  // after the change, so the explanation stays on screen
  };
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-full" aria-label={labels[0]} aria-controls={id}
        onClick={() => change(value - 1)} disabled={value <= min}><Minus className="h-4 w-4" /></Button>
      <Input id={id} type="number" inputMode="numeric" min={min} max={max} step={1} className="h-10 w-14 px-1 text-center"
        value={String(value)} onChange={e => change(wholeNumber(e.target.value) || 0)} />
      <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-full" aria-label={labels[1]} aria-controls={id}
        onClick={() => change(value + 1)} disabled={!onAboveMax && value >= max}><Plus className="h-4 w-4" /></Button>
    </div>
  );
}

export function GroupDetails({ fil, group, setGroup, yourAge, companions, errors, clearError }: {
  fil: boolean; group: Group; setGroup: React.Dispatch<React.SetStateAction<Group>>; yourAge: number;
  /** How many companions the visitor said are with them (0 = visiting alone) */
  companions: number;
  errors: Record<string, string | undefined>; clearError: (...keys: string[]) => void;
}) {
  const L = tr(fil);
  const [pwdHint, setPwdHint] = React.useState<string | null>(null);
  const yourCat = registrantCategory(yourAge);
  const people = peopleOf(group, yourAge, fil);
  const pwdSet = new Set(group.pwdPicks);
  const listed = companionsOf(group);
  const known = Number.isInteger(companions) && companions >= 0;
  const yourCatName = CATS.find(c => c.key === yourCat);

  const setCount = (c: Category, n: number) => {
    setGroup(g => {
      const list = g.others[c].slice(0, Math.max(0, n));
      while (list.length < n) list.push("");
      // A removed person can't stay marked as a PWD or linked to an account
      const gone = (k: string) => k.startsWith(`${c}-`) && Number(k.split("-")[1]) >= n;
      const pwdPicks = g.pwdPicks.map(k => (gone(k) ? "" : k));
      const links = g.links.map(l => (gone(l.key) ? { ...l, key: "" } : l));
      return { ...g, others: { ...g.others, [c]: list }, pwdPicks, links };
    });
    clearError("group", `count-${c}`);
  };
  const setAge = (c: Category, i: number, v: string) => { setGroup(g => ({ ...g, others: { ...g.others, [c]: g.others[c].map((a, j) => (j === i ? v : a)) } })); clearError(`${c}-${i}`, "group"); };
  const setPwdCount = (n: number) => {
    setGroup(g => { const list = g.pwdPicks.slice(0, n); while (list.length < n) list.push(""); return { ...g, pwdPicks: list }; });
    setPwdHint(null); clearError("pwd", "pwd_consent");
  };
  const explainPwdLimit = () => setPwdHint(people.length === 0
    ? L("First enter your age above (and the others in your group), then choose who is a PWD.", "Ilagay muna ang iyong edad sa itaas (at ng mga kasama mo), saka piliin kung sino ang PWD.")
    : L(`Everyone listed (${people.length}) is already marked. To add a PWD, first add the person in the counts above.`, `Lahat ng nailista (${people.length}) ay naka-marka na. Para magdagdag ng PWD, idagdag muna ang tao sa itaas.`));

  const err = (k: string) => errors[k] && <p id={`vr-${k}-error`} tabIndex={-1} className="text-sm text-destructive">{errors[k]}</p>;
  const aria = (k: string) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `vr-${k}-error` : undefined });
  const companionList = people.filter(p => !p.you);
  const linkedKeys = new Set(group.links.map(l => l.key));
  const setLinkCount = (n: number) => {
    setGroup(g => { const list = g.links.slice(0, n); while (list.length < n) list.push({ key: "", email: "", code: "" }); return { ...g, links: list }; });
    group.links.forEach((_, i) => clearError(`link-${i}`));
  };
  const setLink = (i: number, part: Partial<Link>) => { setGroup(g => ({ ...g, links: g.links.map((l, j) => (j === i ? { ...l, ...part } : l)) })); clearError(`link-${i}`); };

  return (
    <section aria-labelledby="vr-group-heading" className="space-y-4 rounded-2xl border p-4">
      <div>
        <h2 id="vr-group-heading" className="flex items-center gap-2 text-base font-semibold"><Users className="h-5 w-5 text-primary" /> {companions > 0 ? L("Your Companions Today", "Mga Kasama Mo Ngayon") : L("Your Visit Today", "Ang Iyong Pagbisita Ngayon")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{!known
          ? L("First answer whether you're visiting alone or with companions.", "Sagutin muna kung mag-isa ka o may kasama.")
          : companions > 0
          ? L("What are their age groups? Count each companion once. Senior citizens are 60 and above.", "Ano ang grupo ng edad nila? Bilangin nang isang beses ang bawat kasama. Ang senior citizen ay 60 pataas.")
          : L("You're visiting alone. You can still say below if you are a PWD.", "Mag-isa kang bibisita. Maaari mo pa ring sabihin sa ibaba kung ikaw ay PWD.")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 rounded-xl bg-muted/60 px-3 py-2 text-sm" id="vr-you">
        {yourCat ? <>{L("You", "Ikaw")}: <span className="font-semibold">{L("age", "edad")} {yourAge}</span> · {L(yourCatName!.one[0], yourCatName!.one[1])} <span className="text-muted-foreground">({L("registered visitor", "rehistradong bisita")})</span></>
          : L("Enter your age above; you're included automatically.", "Ilagay ang iyong edad sa itaas; kasama ka na agad.")}
      </div>
      {companions > 0 && CATS.map(c => (
        <div key={c.key} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`vr-count-${c.key}`}>{L(`How many ${c.en.toLowerCase()} (${c.range[0]})?`, `Ilan ang ${c.fil.toLowerCase()} (${c.range[1]})?`)}</Label>
            <Stepper id={`vr-count-${c.key}`} value={group.others[c.key].length} min={0} max={499} onChange={n => setCount(c.key, n)}
              labels={[L(`One fewer ${c.one[0].toLowerCase()}`, `Bawasan ang ${c.one[1].toLowerCase()}`), L(`Add ${/^[aeiou]/i.test(c.one[0]) ? "an" : "a"} ${c.one[0].toLowerCase()}`, `Magdagdag ng ${c.one[1].toLowerCase()}`)]} />
          </div>
          {group.others[c.key].length > 0 && (
            <div className="flex flex-wrap gap-2">
              {group.others[c.key].map((a, i) => (
                <div key={i} className="space-y-1">
                  <Label htmlFor={`vr-${c.key}-${i}`} className="text-xs text-muted-foreground">{L(c.one[0], c.one[1])} {i + 1}</Label>
                  <Input id={`vr-${c.key}-${i}`} type="number" inputMode="numeric" min={c.min} max={c.max} step={1} value={a} onChange={e => setAge(c.key, i, e.target.value)}
                    placeholder={L("Age", "Edad")} className="w-24" {...aria(`${c.key}-${i}`)} />
                  {err(`${c.key}-${i}`)}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {yourCat && known && (
        <div className={`rounded-xl p-3 text-sm ${listed === companions ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200" : "bg-muted/60"}`} aria-live="polite" id="vr-group-total">
          {companions > 0 && <>{L(`Companions listed: ${listed} of ${companions}.`, `Nailistang kasama: ${listed} sa ${companions}.`)} </>}
          {L(`Total group size: ${1 + companions} (you + ${companions} companion${companions === 1 ? "" : "s"}).`, `Kabuuang bilang ng grupo: ${1 + companions} (ikaw + ${companions} kasama).`)}
        </div>
      )}
      {err("group")}

      {/* PWD: chosen from the people above, so nobody is counted twice */}
      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="vr-pwd-count" className="flex items-center gap-1.5"><Accessibility className="h-4 w-4 shrink-0 text-primary" /> {L("How many persons with disabilities (PWDs)?", "Ilan ang PWD (may kapansanan)?")}</Label>
          <Stepper id="vr-pwd-count" value={group.pwdPicks.length} min={0} max={people.length} onChange={setPwdCount} onAboveMax={explainPwdLimit}
            labels={[L("One fewer PWD", "Bawasan ang PWD"), L("Add a PWD", "Magdagdag ng PWD")]} />
        </div>
        {pwdHint && <p role="status" className="rounded-xl bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{pwdHint}</p>}
        <p className="text-xs text-muted-foreground">{L("Optional. A PWD can be a child, an adult or a senior citizen; choose who from your group. No details about the disability are asked.", "Opsyonal. Ang PWD ay maaaring bata, adult o senior citizen; piliin kung sino sa grupo. Hindi itatanong ang detalye ng kapansanan.")}</p>
        {group.pwdPicks.map((k, i) => (
          <div key={i} className="flex items-center gap-2">
            <Label htmlFor={`vr-pwd-${i}`} className="w-16 shrink-0 text-xs text-muted-foreground">PWD {i + 1}</Label>
            <select id={`vr-pwd-${i}`} value={k} onChange={e => { const v = e.target.value; setGroup(g => ({ ...g, pwdPicks: g.pwdPicks.map((x, j) => (j === i ? v : x)) })); clearError("pwd"); }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">{L("Choose a person…", "Pumili ng tao…")}</option>
              {people.filter(p => p.key === k || !pwdSet.has(p.key)).map(p => <option key={p.key} value={p.key}>{p.label} ({L("age", "edad")} {p.age || "?"})</option>)}
            </select>
          </div>
        ))}
        {err("pwd")}
        {group.pwdPicks.length > 0 && (
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox id="vr-pwd_consent" checked={group.pwd_consent} className="mt-0.5" onCheckedChange={v => { setGroup(g => ({ ...g, pwd_consent: v === true })); clearError("pwd_consent"); }} {...aria("pwd_consent")} />
            <span>{L("I agree to Manila Zoo recording that these people are PWDs, only to count visitors and plan accessible services.", "Pumapayag akong itala ng Manila Zoo na PWD ang mga taong ito, para lamang sa pagbilang ng bisita at pagpaplano ng accessible na serbisyo.")}</span>
          </label>
        )}
        {err("pwd_consent")}
      </div>

      {/* Companions with their own visitor account: linked so each person is counted once a day */}
      {companionList.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="vr-link-count" className="flex items-center gap-1.5"><Link2 className="h-4 w-4 shrink-0 text-primary" /> {L("How many of your companions have their own visitor account?", "Ilan sa mga kasama mo ang may sariling visitor account?")}</Label>
            <Stepper id="vr-link-count" value={group.links.length} min={0} max={Math.min(20, companionList.length)} onChange={setLinkCount}
              labels={[L("One fewer linked companion", "Bawasan ang naka-link"), L("Link a companion's account", "Mag-link ng account ng kasama")]} />
          </div>
          <p className="text-xs text-muted-foreground">{L("Optional. Ask them for the email and Visitor ID shown on their phone, so they're counted once even if they register too. Babies, children and others without an account need only their age.", "Opsyonal. Hingin ang email at Visitor ID na nasa telepono nila, para isang beses lang sila mabilang kahit magparehistro rin sila. Ang mga sanggol, bata at walang account ay edad lang ang kailangan.")}</p>
          {group.links.map((l, i) => (
            <div key={i} className="space-y-2 rounded-xl border p-3">
              <select id={`vr-link-${i}`} value={l.key} onChange={e => setLink(i, { key: e.target.value })} aria-label={L(`Linked companion ${i + 1}`, `Naka-link na kasama ${i + 1}`)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...aria(`link-${i}`)}>
                <option value="">{L("Choose a companion…", "Pumili ng kasama…")}</option>
                {companionList.filter(p => p.key === l.key || !linkedKeys.has(p.key)).map(p => <option key={p.key} value={p.key}>{p.label} ({L("age", "edad")} {p.age || "?"})</option>)}
              </select>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input id={`vr-link-${i}-email`} type="email" inputMode="email" autoComplete="off" placeholder={L("Their email", "Email nila")} value={l.email} onChange={e => setLink(i, { email: e.target.value })} />
                <Input id={`vr-link-${i}-code`} autoCapitalize="characters" autoComplete="off" placeholder="MZV-XXXXXX" value={l.code} onChange={e => setLink(i, { code: e.target.value.toUpperCase() })} />
              </div>
              {err(`link-${i}`)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** The group as shown on the review step */
export function GroupReview({ fil, group, yourAge }: { fil: boolean; group: Group; yourAge: number }) {
  const L = tr(fil);
  const people = peopleOf(group, yourAge, fil);
  const pwdSet = new Set(group.pwdPicks);
  const countOf = (c: Category) => people.filter(p => p.category === c).length;
  const one = (c: Category) => { const x = CATS.find(k => k.key === c)!; return L(x.one[0], x.one[1]); };
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{L("People Included in Your Visit", "Mga kasama sa pagbisita")}</h3>
      <p className="mb-2 text-sm" id="vr-review-total">{L(`You + ${people.length - 1} companion${people.length - 1 === 1 ? "" : "s"} = ${people.length} ${people.length === 1 ? "person" : "people"}`, `Ikaw + ${people.length - 1} kasama = ${people.length} tao`)}</p>
      <div className="mb-3 grid grid-cols-4 gap-2 text-center text-xs">
        {[...CATS.map(c => [L(c.en, c.fil), countOf(c.key)] as const), ["PWD", pwdSet.size] as const].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-muted/60 p-2"><div className="text-lg font-bold">{v}</div>{k}</div>
        ))}
      </div>
      <ul className="space-y-1 text-sm">
        {people.map(p => (
          <li key={p.key} className="flex justify-between rounded-lg border px-3 py-1.5">
            <span>{p.label} · {one(p.category)}</span>
            <span className="font-medium">{L("age", "edad")} {p.age}{pwdSet.has(p.key) ? " · PWD" : ""}{group.links.some(l => l.key === p.key) ? ` · ${L("account linked", "naka-link")}` : ""}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{L(`Each person is counted once: ${people.length} in total.`, `Isang beses binibilang ang bawat tao: ${people.length} lahat.`)}</p>
    </div>
  );
}
