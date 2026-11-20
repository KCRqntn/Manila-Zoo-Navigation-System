import React from "react";
import { ShieldCheck } from "lucide-react";
import { useAppCtx } from "../../contexts/AppContext";
import { ZOO_RULES, ZOO_TERMS } from "@/lib/zooRules";

export default function Rules({ embedded = false }: { embedded?: boolean }) {
  const { language } = useAppCtx();
  const fil = language === "fil";

  return (
    <div className={embedded ? "" : "container py-12 max-w-3xl mx-auto"}>
      <div className={embedded ? "mb-6 text-center" : "text-center mb-10"}>
        {!embedded && (
          <>
            <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold text-foreground mb-4 text-balance">
              {fil ? "Mga Patakaran ng Zoo" : "Zoo Rules"}
            </h1>
          </>
        )}
        <p className="text-muted-foreground text-lg leading-relaxed">
          {fil
            ? "Ang Manila Zoo, sa ilalim ng Public Recreations Bureau (PRB), ay may mga patakaran para sa kaligtasan at kapakanan ng mga bisita at ng mga hayop. Sundin ang lahat ng patakaran, alituntunin at nakapaskil na karatula sa loob ng zoo."
            : "The Manila Zoo, under the Public Recreations Bureau (PRB), has set these rules for the safety and welfare of both guests and animals. Please obey all rules, guidelines and posted signs throughout the zoo premises."}
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {ZOO_RULES.map(rule => {
          const Icon = rule.icon;
          return (
            <li key={rule.id} className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <span className="font-medium leading-snug">{fil ? rule.fil : rule.en}</span>
            </li>
          );
        })}
      </ul>

      <section className="mt-10">
        <h2 className="mb-3 text-xl font-bold">{fil ? "Mga Tuntunin at Kundisyon" : "Terms and Conditions"}</h2>
        <ul className="space-y-2 rounded-xl border bg-card p-5 shadow-sm">
          {ZOO_TERMS.map(term => (
            <li key={term.en} className="flex gap-2 leading-relaxed">
              <span className="text-primary" aria-hidden="true">•</span>
              <span>{fil ? term.fil : term.en}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 text-center text-lg font-semibold text-primary">
        {fil ? "Salamat sa pagbisita sa Manila Zoo!" : "Thank you for visiting Manila Zoo!"}
      </p>
    </div>
  );
}
