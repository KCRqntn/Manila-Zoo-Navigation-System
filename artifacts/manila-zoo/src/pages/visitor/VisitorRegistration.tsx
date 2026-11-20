import React, { useEffect, useRef, useState } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, CheckCircle2, Loader2, LogIn, Map as MapIcon, Pencil, ShieldCheck, UserPlus } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAppCtx } from "@/contexts/AppContext";
import { BackButton } from "@/components/layout/BackButton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { errorMessage, isStaffRole } from "@/lib/adminApi";
import { PasswordInput } from "@/components/PasswordInput";
import { GroupDetails, GroupReview, Stepper, emptyGroup, membersOf, registrantCategory, validateGroup, wholeNumber, type Group } from "@/components/visitor/GroupDetails";

/**
 * The page the website QR code opens. It starts with the visitor login; "Don't have an account? Sign up"
 * opens the complete registration form (?view=signup) and "Back to Login" returns to the login.
 *  - First visit (sign up): create a visitor account and register this visit (alone, or with companions).
 *  - Returning visitor: log in (no new account, no profile form), then "Register Your New Visit" with
 *    today's companions (previous companions never carry over; every visit is saved separately).
 * The group size is always the registered visitor + their companions.
 * A returning visitor stays logged in on their phone (closing the tab, refreshing or rescanning keeps
 * the login), so the QR code takes them straight to "Register Your New Visit". If the saved login has
 * ended (expired or idle too long), the login form says so; the email used last on this phone is
 * filled in (never the password). Logging in goes through the API so it is recorded in the audit log.
 * A visit is counted only when the server has saved it with all its people; opening this page,
 * scanning the code or logging in counts nobody. Each form has one visit id, kept for this tab until
 * it is saved, so retries, refreshes and repeated taps save it once.
 */
const VISIT_ID_KEY = "mz-visit-id";
const ENTRY_SEEN_KEY = "mz-entry-seen";
/** The email last used on this phone, to fill in the login (not a secret; never the password) */
const LAST_EMAIL_KEY = "mz-last-visitor-email";

/** A random UUID v4 (crypto.randomUUID isn't available on older iPhones) */
function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const store = {
  get: (s: Storage, k: string) => { try { return s.getItem(k); } catch { return null; } },
  set: (s: Storage, k: string, v: string) => { try { s.setItem(k, v); } catch { /* kept in memory only */ } },
  del: (s: Storage, k: string) => { try { s.removeItem(k); } catch { /* nothing to remove */ } },
};
const currentVisitId = () => { const v = store.get(sessionStorage, VISIT_ID_KEY); if (v) return v; const id = newId(); store.set(sessionStorage, VISIT_ID_KEY, id); return id; };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const phPhone = (s: string) => /^(?:\+?63|0)?9\d{9}$/.test(s.replace(/[\s().-]/g, ""));

type Me = { email: string | null; profile: { full_name: string; email: string; phone: string; age: number; sex: string; visitor_code: string } | null; visits: { visit_no: number; party_size: number; visit_date: string }[]; full_name_hint: string | null };
type Saved = { visit_no: number | null; party_size: number; first: boolean };
type Fields = { full_name: string; email: string; phone: string; age: string; sex: "" | "male" | "female"; password: string; password2: string;
  /** Visiting alone or with companions today, and how many companions */
  alone: "" | "yes" | "no"; companions: string; consent: boolean; website: string };
const emptyFields = (): Fields => ({ full_name: "", email: "", phone: "", age: "", sex: "", password: "", password2: "", alone: "", companions: "1", consent: false, website: "" });

export default function VisitorRegistration() {
  const { language } = useAppCtx();
  const fil = language === "fil";
  const L = (en: string, tl: string) => (fil ? tl : en);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { user, loading: authLoading, sessionExpired, clearSessionExpired, signOut } = useAuth();

  // Not signed in: the login (default), or the registration form (?view=signup). Kept in the address,
  // so the phone's Back button moves between them; other query parameters are kept as they are.
  const search = useSearch();
  const tab: "first" | "login" = new URLSearchParams(search).get("view") === "signup" ? "first" : "login";
  const goTo = (view: "first" | "login") => {
    const q = new URLSearchParams(search);
    if (view === "first") q.set("view", "signup"); else q.delete("view");
    setServerError(null); setStep("edit");
    setLocation(`/visitor-registration${q.size ? `?${q}` : ""}`);
    window.scrollTo({ top: 0 });
  };
  // Zoo staff (admin, director, …) never register visits: their account has no visitor profile, so this
  // page would otherwise take them for a visitor who still has to fill in the registration form
  const isStaff = !!user && isStaffRole(user.role);
  const me = useQuery({ queryKey: ["/api/visitor/me", user?.id], queryFn: () => customFetch<Me>("/api/visitor/me"), enabled: !!user && !isStaff });

  const [f, setF] = useState<Fields>(emptyFields);
  const [group, setGroup] = useState<Group>(emptyGroup);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [visitId, setVisitId] = useState(currentVisitId);
  const inFlight = useRef(false);

  // A returning visitor's age is filled in from their profile (they can change it)
  const profile = me.data?.profile ?? null;
  useEffect(() => { if (profile) setF(x => (x.age ? x : { ...x, age: String(profile.age) })); }, [profile]);

  // After saving, continue to the zoo map
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setLocation("/map"), 5000);
    return () => clearTimeout(t);
  }, [saved, setLocation]);

  const clearError = (...keys: string[]) => setErrors(x => { const y = { ...x }; for (const k of keys) delete y[k]; return y; });
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => { setF(x => ({ ...x, [k]: e.target.value })); clearError(k, "group"); };

  const yourAge = wholeNumber(f.age);
  // Companions today (0 when alone); NaN until the visitor answers
  const companions = f.alone === "yes" ? 0 : f.alone === "no" ? wholeNumber(f.companions) : NaN;
  const partySize = 1 + companions;
  const mode: "first" | "complete" | "visit" = !user ? "first" : profile ? "visit" : "complete";

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (mode !== "visit") {
      if (f.full_name.trim().length < 2 || !/\p{L}/u.test(f.full_name)) e.full_name = L("Enter your full name.", "Ilagay ang iyong buong pangalan.");
      if (!phPhone(f.phone)) e.phone = L("Enter a valid Philippine mobile number, e.g. 0917 123 4567.", "Maglagay ng tamang numero ng mobile sa Pilipinas, hal. 0917 123 4567.");
      if (!f.sex) e.sex = L("Choose Male or Female.", "Pumili ng Lalaki o Babae.");
    }
    if (mode === "first") {
      if (!EMAIL.test(f.email.trim())) e.email = L("Enter a valid email address.", "Maglagay ng tamang email address.");
      if (f.password.length < 8) e.password = L("Choose a password of at least 8 characters.", "Gumamit ng password na hindi bababa sa 8 character.");
      else if (f.password !== f.password2) e.password2 = L("The passwords don't match.", "Hindi magkapareho ang mga password.");
    }
    if (!registrantCategory(yourAge)) e.age = L("Enter an age from 1 to 120.", "Maglagay ng edad mula 1 hanggang 120.");
    if (!f.alone) e.alone = L("Tell us if you're visiting alone or with companions.", "Sabihin kung mag-isa ka o may kasama.");
    else if (f.alone === "no" && (!Number.isInteger(companions) || companions < 1 || companions > 499)) e.companions = L("Enter how many people are with you (1 to 499).", "Ilagay kung ilan ang kasama mo (1 hanggang 499).");
    Object.assign(e, validateGroup(group, yourAge, Number.isInteger(companions) ? companions : NaN, fil));
    if (!f.consent) e.consent = L("Please agree to the privacy notice to register.", "Kailangan mong sumang-ayon sa abiso sa privacy.");
    return e;
  };

  const review = (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e); setServerError(null);
    if (Object.keys(e).length) {
      const first = Object.keys(e)[0]!;
      const el = document.getElementById(`vr-${first}`) ?? document.getElementById(`vr-${first}-error`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.focus();
      return;
    }
    setStep("review"); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    if (inFlight.current) return;  // repeated taps while sending
    inFlight.current = true; setSubmitting(true); setServerError(null);
    const visit = { visit_id: visitId, party_size: partySize, members: membersOf(group, yourAge), consent: f.consent, pwd_consent: group.pwd_consent && group.pwdPicks.length > 0 };
    try {
      let res: { visit_no: number | null; party_size: number };
      if (mode === "first") {
        res = await customFetch("/api/visitor/first-visit", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...visit, full_name: f.full_name, email: f.email.trim(), phone: f.phone, age: yourAge, sex: f.sex, password: f.password, website: f.website }) });
        // Signed in straight away, so the next visit only needs a login
        await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password }).catch(() => {});
      } else {
        res = await customFetch("/api/visitor/visits", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...visit, age: yourAge, ...(mode === "complete" ? { full_name: f.full_name, phone: f.phone, sex: f.sex } : {}) }) });
      }
      // Saved with all its people: only now is this visit counted
      if (mode === "first") store.set(localStorage, LAST_EMAIL_KEY, f.email.trim());
      store.del(sessionStorage, VISIT_ID_KEY);
      store.set(sessionStorage, ENTRY_SEEN_KEY, "1");
      setSaved({ visit_no: res.visit_no ?? null, party_size: res.party_size ?? partySize, first: mode === "first" });
      qc.invalidateQueries({ queryKey: ["/api/visitor/me"] });
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      if (code === "account_exists") { goTo("login"); setLoginEmail(f.email.trim()); }
      // Not saved, so not counted; the same visit id is kept so trying again can't count twice
      // Already counted today (by themselves or someone in their group): not an error to retry
      const counted = code === "included_by_other" || code === "already_registered_today" || code === "companion_already_counted" || code === "counted_twice" || code === "link_not_found";
      setServerError(counted ? errorMessage(err)
        : `${L("Your visit wasn't saved.", "Hindi na-save ang iyong pagbisita.")} ${errorMessage(err)}${code === "account_exists" ? "" : ` ${L("Please try again.", "Pakisubukang muli.")}`}`);
    } finally {
      inFlight.current = false; setSubmitting(false);
    }
  };

  const startNewVisit = () => {
    const id = newId(); store.set(sessionStorage, VISIT_ID_KEY, id); setVisitId(id);
    setGroup(emptyGroup()); setF(x => ({ ...emptyFields(), age: x.age })); setErrors({}); setServerError(null); setStep("edit"); setSaved(null);
  };

  // ─── Log in (returning visitor) ───
  const [loginEmail, setLoginEmail] = useState(() => store.get(localStorage, LAST_EMAIL_KEY) ?? "");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const logIn = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setLoggingIn(true); setLoginError(null);
    try {
      // Through the API, so every login (and failed attempt) is recorded and repeated guessing is slowed
      const session = await customFetch<{ access_token: string; refresh_token: string; role?: string }>("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }) });
      const { error } = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      if (error) throw error;
      // Staff credentials typed here go straight to the Admin Dashboard, never to the visit form
      if (isStaffRole(session.role)) { clearSessionExpired(); setLoginPassword(""); setLoggingIn(false); setLocation("/admin"); return; }
    } catch (err) {
      setLoggingIn(false);
      const status = (err as { status?: number }).status;
      setLoginError(status === 401 ? L("Wrong email or password.", "Mali ang email o password.") : errorMessage(err));
      return;
    }
    setLoggingIn(false);
    store.set(localStorage, LAST_EMAIL_KEY, loginEmail.trim());
    clearSessionExpired(); setLoginPassword("");
    // A fresh form for this visit; nothing from earlier visits is carried over
    startNewVisit(); setF(emptyFields());
  };

  const header = (title: string, sub: string) => (
    <div className="mb-6 text-center">
      <span className="text-5xl" aria-hidden="true">🦒</span>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{title}</h1>
      <p className="mt-1 text-muted-foreground">{sub}</p>
    </div>
  );
  const err = (k: string) => errors[k] && <p id={`vr-${k}-error`} tabIndex={-1} className="text-sm text-destructive">{errors[k]}</p>;
  const aria = (k: string) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `vr-${k}-error` : undefined });

  // ─── Saved ───
  if (saved) {
    return (
      <div className="container max-w-lg py-10">
        <div className="rounded-3xl border bg-card p-8 text-center shadow-sm" role="status">
          <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-green-600" />
          <h1 className="text-2xl font-bold">{L("Your visit is registered!", "Rehistrado na ang iyong pagbisita!")}</h1>
          <p className="mt-2 text-muted-foreground">
            {fil ? `${saved.party_size} bisita ang naitala${saved.visit_no ? ` (pagbisita #${saved.visit_no})` : ""}.`
                 : `${saved.party_size} ${saved.party_size === 1 ? "visitor is" : "visitors are"} recorded${saved.visit_no ? ` (visit #${saved.visit_no})` : ""}.`}
          </p>
          {me.data?.profile?.visitor_code && <div className="mt-4 text-left"><VisitorId code={me.data.profile.visitor_code} email={me.data.profile.email} fil={fil} /></div>}
          {saved.first && <p className="mt-1 text-sm text-muted-foreground">{L("Next time, scan the QR code and log in with your email and password.", "Sa susunod, i-scan ang QR code at mag-log in gamit ang iyong email at password.")}</p>}
          <p className="mt-1 text-sm text-muted-foreground">{L("Opening the zoo map…", "Binubuksan ang mapa ng zoo…")}</p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Button asChild className="rounded-full"><Link href="/map"><MapIcon className="mr-2 h-4 w-4" />{L("Zoo map", "Mapa ng zoo")}</Link></Button>
            <Button asChild variant="outline" className="rounded-full"><Link href="/">{L("Home", "Home")}</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  // A signed-in staff member who opens the visitor QR link belongs in the admin portal
  if (!authLoading && isStaff) return <Redirect to="/admin" replace />;

  if (authLoading || (user && me.isLoading)) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  // ─── Not signed in: the registration form offers a way back to the login ───
  const tabs = !user && (
    <p className="mb-4 text-center text-sm text-muted-foreground">
      {L("Already have an account?", "May account na?")}{" "}
      <button type="button" id="vr-back-to-login" onClick={() => goTo("login")} className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> {L("Back to Login", "Bumalik sa Login")}
      </button>
    </p>
  );

  if (!user && tab === "login") {
    return (
      <div className="container max-w-lg py-8 sm:py-10">
        <BackButton className="mb-4" />
        {header(L("Visitor Login", "Pag-login ng Bisita"), L("Welcome! Log in to register today's visit.", "Maligayang pagdating! Mag-log in para irehistro ang pagbisita ngayon."))}
        <form onSubmit={logIn} className="space-y-4 rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
          {sessionExpired && (
            <p role="status" id="vl-expired" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {L("Your session has ended, so please log in again. Your account and earlier visits are saved; you don't need to register again.",
                 "Natapos na ang iyong session, kaya mag-log in muli. Naka-save ang iyong account at mga nakaraang pagbisita; hindi mo kailangang magparehistro ulit.")}
            </p>
          )}
          {serverError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{serverError}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="vl-email">Email</Label>
            <Input id="vl-email" type="email" inputMode="email" autoComplete="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vl-password">{L("Password", "Password")}</Label>
            <PasswordInput id="vl-password" autoComplete="current-password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
          </div>
          {loginError && <p role="alert" className="text-sm text-destructive">{loginError}</p>}
          <Button type="submit" size="lg" className="h-12 w-full rounded-full text-base" disabled={loggingIn}>
            {loggingIn ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />} {L("Log in", "Mag-log in")}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {L("Don't have an account?", "Wala pang account?")}{" "}
            <button type="button" id="vl-signup" onClick={() => goTo("first")} className="font-medium text-primary underline-offset-4 hover:underline">{L("Sign up", "Mag-sign up")}</button>
          </p>
          <p className="text-center text-sm text-muted-foreground">{L("Forgot your password? Ask zoo staff at the entrance; they can give you a temporary one.", "Nakalimutan ang password? Lumapit sa staff ng zoo sa pasukan; mabibigyan ka nila ng pansamantalang password.")}</p>
          <p className="text-center text-xs text-muted-foreground">{L("Logging in doesn't register a visit; you'll add today's group next.", "Hindi pa naitatala ang pagbisita sa pag-log in; idadagdag mo ang grupo ngayon sa susunod.")}</p>
        </form>
      </div>
    );
  }

  const title = mode === "visit" ? L("Register Your New Visit", "Irehistro ang Bagong Pagbisita") : mode === "complete" ? L("Complete Your Visitor Profile", "Kumpletuhin ang Iyong Profile") : "Manila Zoo Visitor Registration";
  const subtitle = mode === "visit"
    ? (fil ? `Maligayang pagbabalik, ${profile!.full_name.split(" ")[0]}! ${me.data!.visits.length} na nakaraang pagbisita.` : `Welcome back, ${profile!.full_name.split(" ")[0]}! ${me.data!.visits.length} previous ${me.data!.visits.length === 1 ? "visit" : "visits"}.`)
    : mode === "complete" ? L("Your account needs a few details once, then add today's group.", "Ilang detalye lang minsan, saka idagdag ang grupo ngayon.")
    : L("First visit: create your visitor account and register your whole group.", "Unang pagbisita: gumawa ng visitor account at irehistro ang buong grupo.");
  const signedInAs = user && (
    <p className="mb-4 text-center text-sm text-muted-foreground">
      {L("Signed in as", "Naka-sign in bilang")} <span className="font-medium text-foreground">{me.data?.email ?? user.email}</span> ·{" "}
      <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={async () => { await signOut(); goTo("login"); startNewVisit(); setF(emptyFields()); }}>{L("Not you? Log out", "Hindi ikaw? Mag-log out")}</button>
    </p>
  );

  // ─── Review before saving ───
  if (step === "review") {
    const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 py-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;
    const name = mode === "visit" ? profile!.full_name : f.full_name.trim();
    return (
      <div className="container max-w-lg py-8 sm:py-10">
        {header(title, subtitle)}
        <div className="space-y-4 rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold">{L("Review your visit", "Suriin ang iyong pagbisita")}</h2>
          <dl className="divide-y text-sm">
            {row(L("Full Name", "Buong pangalan"), name)}
            {row("Email", mode === "first" ? f.email.trim() : (me.data?.email ?? user?.email))}
            {mode !== "visit" && row(L("Phone Number", "Telepono"), f.phone.trim())}
            {row(L("Your age", "Iyong edad"), yourAge)}
            {mode !== "visit" && row(L("Sex", "Kasarian"), f.sex === "male" ? L("Male", "Lalaki") : L("Female", "Babae"))}
            {row(L("Companions", "Mga kasama"), companions)}
            {row(L("Total group size", "Kabuuang bilang ng grupo"), partySize)}
          </dl>
          <GroupReview fil={fil} group={group} yourAge={yourAge} />
          {serverError && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{serverError}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="h-12 rounded-full" onClick={() => setStep("edit")} disabled={submitting}><Pencil className="mr-2 h-4 w-4" /> {L("Edit", "Baguhin")}</Button>
            <Button type="button" className="h-12 rounded-full text-base" onClick={submit} disabled={submitting} id="vr-confirm">
              {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UserPlus className="mr-2 h-5 w-5" />}
              {submitting ? L("Saving…", "Sine-save…") : L("Confirm & Register", "Kumpirmahin at magparehistro")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── The form (first visit, complete profile, or new visit) ───
  return (
    <div className="container max-w-lg py-8 sm:py-10">
      <BackButton className="mb-4" />
      {header(title, subtitle)}
      {tabs}
      {signedInAs}
      {profile?.visitor_code && <VisitorId code={profile.visitor_code} email={profile.email} fil={fil} />}
      <form onSubmit={review} noValidate className="space-y-4 rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        {serverError && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{serverError}</p>}
        {mode !== "visit" && (
          <div className="space-y-1.5">
            <Label htmlFor="vr-full_name">{L("Full Name", "Buong pangalan")}</Label>
            <Input id="vr-full_name" value={f.full_name} onChange={set("full_name")} maxLength={120} autoComplete="name" {...aria("full_name")} />
            {err("full_name")}
          </div>
        )}
        {mode === "first" && (
          <div className="space-y-1.5">
            <Label htmlFor="vr-email">{L("Email Address", "Email address")}</Label>
            <Input id="vr-email" type="email" inputMode="email" value={f.email} onChange={set("email")} maxLength={200} autoComplete="email" placeholder="juan@example.com" {...aria("email")} />
            {err("email")}
          </div>
        )}
        {mode !== "visit" && (
          <div className="space-y-1.5">
            <Label htmlFor="vr-phone">{L("Phone Number", "Numero ng telepono")}</Label>
            <Input id="vr-phone" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} maxLength={20} autoComplete="tel" placeholder="0917 123 4567" {...aria("phone")} />
            {err("phone")}
          </div>
        )}
        {mode === "first" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vr-password">{L("Create a password", "Gumawa ng password")}</Label>
              <PasswordInput id="vr-password" autoComplete="new-password" value={f.password} onChange={set("password")} {...aria("password")} />
              <p className="text-xs text-muted-foreground">{L("At least 8 characters. You'll use it to log in on your next visit.", "Hindi bababa sa 8 character. Gagamitin mo ito sa susunod na pagbisita.")}</p>
              {err("password")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vr-password2">{L("Repeat the password", "Ulitin ang password")}</Label>
              <PasswordInput id="vr-password2" autoComplete="new-password" value={f.password2} onChange={set("password2")} {...aria("password2")} />
              {err("password2")}
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vr-age">{mode === "visit" ? L("Your age today", "Iyong edad ngayon") : L("Age", "Edad")}</Label>
            <Input id="vr-age" type="number" inputMode="numeric" min={1} max={120} step={1} value={f.age} onChange={set("age")} {...aria("age")} />
            {err("age")}
          </div>
        </div>
        {mode !== "visit" && (
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{L("Sex", "Kasarian")}</legend>
            <RadioGroup id="vr-sex" value={f.sex} onValueChange={v => { setF(x => ({ ...x, sex: v as Fields["sex"] })); clearError("sex"); }} className="flex gap-6 pt-1" {...aria("sex")}>
              <label className="flex cursor-pointer items-center gap-2"><RadioGroupItem value="male" id="vr-sex-male" /> {L("Male", "Lalaki")}</label>
              <label className="flex cursor-pointer items-center gap-2"><RadioGroupItem value="female" id="vr-sex-female" /> {L("Female", "Babae")}</label>
            </RadioGroup>
            {err("sex")}
          </fieldset>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{L("Are you visiting alone today, or with companions?", "Mag-isa ka bang bibisita ngayon, o may kasama?")}</legend>
          <RadioGroup id="vr-alone" value={f.alone} onValueChange={v => { setF(x => ({ ...x, alone: v as Fields["alone"] })); if (v === "yes") setGroup(g => ({ ...emptyGroup(), pwdPicks: g.pwdPicks.filter(k => k === "you"), pwd_consent: g.pwd_consent })); clearError("alone", "companions", "group"); }}
            className="grid gap-2 pt-1 sm:grid-cols-2" {...aria("alone")}>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border p-3"><RadioGroupItem value="yes" id="vr-alone-yes" /> {L("Just me", "Ako lang")}</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border p-3"><RadioGroupItem value="no" id="vr-alone-no" /> {L("With companions (family, friends…)", "May kasama (pamilya, kaibigan…)")}</label>
          </RadioGroup>
          {err("alone")}
          {f.alone === "no" && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <Label htmlFor="vr-companions">{L("How many people are accompanying you today?", "Ilan ang kasama mo ngayon?")}</Label>
              <Stepper id="vr-companions" value={Number.isInteger(companions) ? companions : 0} min={1} max={499}
                onChange={n => { setF(x => ({ ...x, companions: String(n) })); clearError("companions", "group"); }}
                labels={[L("One fewer companion", "Bawasan ang kasama"), L("Add a companion", "Magdagdag ng kasama")]} />
            </div>
          )}
          {err("companions")}
        </fieldset>

        <GroupDetails fil={fil} group={group} setGroup={setGroup} yourAge={yourAge} companions={Number.isInteger(companions) ? companions : NaN} errors={errors} clearError={clearError} />

        {/* Hidden from people; bots fill it in */}
        <input type="text" name="website" value={f.website} onChange={e => setF(x => ({ ...x, website: e.target.value }))} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

        <div className="rounded-2xl bg-muted/60 p-4 text-sm">
          <p className="mb-1 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> {L("Privacy notice", "Abiso sa privacy")}</p>
          <p className="text-muted-foreground">
            {L("Manila Zoo keeps a visitor account with your name, email, phone number, age and sex, and for each visit the ages of the people in your group (and whether any are PWDs, only if you choose to say so). It is used to count visitors, produce summary visit statistics, and contact you about your visits if needed. Only authorised zoo staff can see these details; they are not sold or shared except as required by law. Under the Data Privacy Act of 2012 (RA 10173), you may ask to access, correct or delete your information at manilazoo@manila.gov.ph.",
               "Nagtatago ang Manila Zoo ng visitor account na may iyong pangalan, email, numero ng telepono, edad at kasarian, at sa bawat pagbisita ang edad ng mga kasama mo (at kung may PWD, kung pipiliin mong sabihin). Ginagamit ito para mabilang ang mga bisita, makagawa ng buod na estadistika, at makipag-ugnayan sa iyo kung kinakailangan. Ang awtorisadong staff lamang ng zoo ang makakakita nito, at hindi ito ibinebenta o ibinabahagi maliban kung hinihingi ng batas. Alinsunod sa Data Privacy Act of 2012 (RA 10173), maaari mong hilingin na makita, itama o burahin ang iyong impormasyon sa manilazoo@manila.gov.ph.")}
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-2">
            <Checkbox id="vr-consent" checked={f.consent} className="mt-0.5" onCheckedChange={v => { setF(x => ({ ...x, consent: v === true })); clearError("consent"); }} {...aria("consent")} />
            <span>{L("I have read the privacy notice and agree to Manila Zoo processing my group's information for these purposes.", "Nabasa ko ang abiso sa privacy at pumapayag akong iproseso ng Manila Zoo ang impormasyon ng aking grupo para sa mga layuning ito.")}</span>
          </label>
          {err("consent")}
        </div>

        {Object.keys(errors).length > 0 && <p role="alert" className="text-sm font-medium text-destructive">{L("Please fix the highlighted items.", "Pakiayos ang mga may markang item.")}</p>}
        <Button type="submit" size="lg" className="h-12 w-full rounded-full text-base">{L("Review my visit", "Suriin ang aking pagbisita")}</Button>
      </form>
    </div>
  );
}

/** The visitor's own Visitor ID: friends who register a group can link this person with it */
function VisitorId({ code, email, fil }: { code: string; email: string; fil: boolean }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border bg-secondary/40 p-3 text-sm" id="vr-visitor-id">
      <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <p>
        {fil ? "Ang iyong Visitor ID: " : "Your Visitor ID: "}<span className="select-all font-mono font-semibold tracking-wider">{code}</span>
        <span className="block text-xs text-muted-foreground">
          {fil ? `Kung isasama ka ng kaibigan sa grupo nila, ibigay ang ${email} at ang ID na ito para isang beses ka lang mabilang.`
               : `If a friend registers you in their group, give them ${email} and this ID so you're counted only once.`}
        </span>
      </p>
    </div>
  );
}
