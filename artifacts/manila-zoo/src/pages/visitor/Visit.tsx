import React from "react";
import { Link } from "wouter";
import { Clock, Ticket, IdCard, HeartHandshake, ShieldCheck, ArrowRight } from "lucide-react";
import { useAppCtx } from "../../contexts/AppContext";
import { BackButton } from "@/components/layout/BackButton";
import { HOURS, LAST_ENTRY, SENIOR_WEDNESDAY, ID_REMINDER } from "@/lib/visitInfo";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Loader2, ShieldCheck as Verified, TriangleAlert } from "lucide-react";

export default function Visit() {
  const { language } = useAppCtx();
  const fil = language === "fil";
  const t = (text: { en: string; fil: string }) => (fil ? text.fil : text.en);

  return (
    <div className="container py-12 max-w-3xl mx-auto">
      <BackButton className="mb-4" />
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
          <Ticket className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-4xl font-bold text-foreground mb-4 text-balance">
          {fil ? "Oras at Presyo ng Ticket" : "Hours & Tickets"}
        </h1>
        <p className="text-muted-foreground text-lg">
          {fil ? "Bukas ang Manila Zoo araw-araw." : "Manila Zoo is open every day of the week."}
        </p>
      </div>

      <div className="space-y-8">
        {/* Operating hours */}
        <section aria-labelledby="hours-title" className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 id="hours-title" className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Clock className="h-5 w-5 text-primary" /> {fil ? "Oras ng Operasyon" : "Operating Hours"}
          </h2>
          <dl className="divide-y">
            {HOURS.map(h => (
              <div key={h.days.en} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <dt className="font-medium">{t(h.days)}</dt>
                <dd className="tabular-nums text-muted-foreground">{h.time}</dd>
              </div>
            ))}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <dt className="font-semibold text-primary">{fil ? "Huling pagpasok ng mga bisita" : "Last entry of visitors"}</dt>
              <dd className="font-semibold tabular-nums text-primary">{LAST_ENTRY}</dd>
            </div>
          </dl>
        </section>

        {/* Ticket rates: published, verified prices from the Ticket Prices dataset */}
        <LiveRates fil={fil} />

        {/* Free Wednesdays for Manila seniors */}
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="font-medium">{t(SENIOR_WEDNESDAY)}</p>
        </div>

        {/* ID reminder */}
        <section aria-labelledby="ids-title" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
          <h2 id="ids-title" className="mb-2 flex items-center gap-2 font-bold">
            <IdCard className="h-5 w-5 text-amber-700 dark:text-amber-400" /> {fil ? "Paalala" : "Reminder"}
          </h2>
          <p>{t(ID_REMINDER.lead)}</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {ID_REMINDER.items.map(item => <li key={item.en}>{t(item)}</li>)}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">{t(ID_REMINDER.thanks)}</p>
        </section>

        <Link
          href="/rules"
          className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/50"
        >
          <span className="flex items-center gap-3 font-medium">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {fil ? "Bago bumisita, basahin ang mga patakaran ng zoo" : "Before you go, read the zoo rules"}
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}

type Price = { id: number; category: string; visitor_type: string; price: string | null; is_free: boolean; notes: string | null; source_reference: string | null; verified_at: string | null };

/**
 * Admission rates from the Ticket Prices dataset. Only prices an administrator verified (with a
 * source and date) and published are shown; without any, visitors are told to confirm with the zoo.
 */
function LiveRates({ fil }: { fil: boolean }) {
  const q = useQuery({
    queryKey: ["/api/ticket-prices"],
    queryFn: () => customFetch<{ prices: Price[]; last_verified: string | null; sources: string[]; needs_verification: boolean }>("/api/ticket-prices"),
  });
  const peso = (p?: Price) => (!p ? "—" : p.is_free ? (fil ? "Libre" : "Free") : `₱${Number(p.price).toLocaleString("en-PH")}`);
  const groups = new Map<string, Price[]>();
  for (const p of q.data?.prices ?? []) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);

  return (
    <section aria-labelledby="rates-title" className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rates-title" className="flex items-center gap-2 text-xl font-bold">
          <Ticket className="h-5 w-5 text-primary" /> {fil ? "Presyo ng Pagpasok" : "Admission Rates"}
        </h2>
        {q.data?.last_verified && (
          <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
            <Verified className="h-3.5 w-3.5" /> {fil ? "Beripikado noong" : "Verified"} {q.data.last_verified}
          </span>
        )}
      </div>
      {q.isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /> : q.isError || q.data?.needs_verification ? (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          {fil ? "Kailangan pang beripikahin ang mga presyo ng tiket. Kumpirmahin sa Manila Zoo (manilazoo@manila.gov.ph o sa Info Desk)."
               : "Ticket prices still need verification. Please confirm them with Manila Zoo (manilazoo@manila.gov.ph or the Info Desk)."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-semibold">{fil ? "Bisita" : "Visitor"}</th>
                  <th scope="col" className="py-2 px-2 text-right font-semibold">{fil ? "Residente ng Maynila" : "Manila residents"}</th>
                  <th scope="col" className="py-2 pl-2 text-right font-semibold">{fil ? "Hindi residente" : "Non-Manila residents"}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...groups.entries()].map(([category, ps]) => {
                  const all = ps.find(p => p.visitor_type === "All visitors");
                  const manila = ps.find(p => p.visitor_type === "Manila resident");
                  const other = ps.find(p => p.visitor_type === "Non-Manila resident");
                  const note = ps.find(p => p.notes)?.notes;
                  return (
                    <tr key={category}>
                      <th scope="row" className="py-3 pr-3 text-left align-top font-medium">
                        {category}
                        {note && <span className="block text-xs font-normal text-muted-foreground">{note}</span>}
                      </th>
                      {all || (manila && !other) ? (
                        <td colSpan={2} className="py-3 pl-2 text-right align-top font-semibold tabular-nums">
                          {peso(all ?? manila)}
                          <span className="block text-xs font-normal text-muted-foreground">
                            {all ? (fil ? "para sa lahat" : "for everyone") : (fil ? "residente ng Maynila lamang" : "Manila residents only")}
                          </span>
                        </td>
                      ) : (
                        <>
                          <td className="py-3 px-2 text-right align-top font-semibold tabular-nums">{peso(manila)}</td>
                          <td className="py-3 pl-2 text-right align-top font-semibold tabular-nums">{peso(other)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {q.data!.sources.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">{fil ? "Pinagmulan" : "Source"}: {q.data!.sources.join("; ")}</p>
          )}
        </>
      )}
    </section>
  );
}
