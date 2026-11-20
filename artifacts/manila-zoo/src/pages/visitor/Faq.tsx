import React, { useState } from "react";
import { LinkifiedText } from "@/components/LinkifiedText";
import { useSearchFaqs } from "@workspace/api-client-react";
import { useAppCtx } from "../../contexts/AppContext";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { HelpCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Faq({ embedded = false }: { embedded?: boolean }) {
  const { language } = useAppCtx();
  const fil = language === "fil";
  const [category, setCategory] = useState<string>("all");

  const { data: faqs, isLoading } = useSearchFaqs({
    language,
    category: category !== "all" ? category : undefined
  });

  // Visitor-friendly names for the FAQ categories stored in the database
  const CATEGORY_LABELS: Record<string, [string, string]> = {
    all: ["All", "Lahat"], general: ["General", "Pangkalahatan"], tickets: ["Tickets", "Tiket"],
    facilities: ["Facilities", "Pasilidad"], rules: ["Rules", "Patakaran"], animals: ["Animals", "Hayop"],
  };
  const categoryLabel = (c: string) => CATEGORY_LABELS[c]?.[fil ? 1 : 0] ?? c;

  const categories = ["all", ...Array.from(new Set(faqs?.map(f => f.category).filter(Boolean) as string[]))];

  return (
    <div className={embedded ? "" : "container py-12 max-w-3xl mx-auto"}>
      <div className={embedded ? "hidden" : "text-center mb-10"}>
        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
          <HelpCircle className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-4xl font-bold text-foreground mb-4">{fil ? "Mga Madalas Itanong" : "Frequently Asked Questions"}</h1>
        <p className="text-muted-foreground text-lg">
          {fil ? "Mga sagot sa mga karaniwang tanong tungkol sa pagbisita sa Manila Zoo." : "Find answers to common questions about visiting Manila Zoo."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-8 justify-center">
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={category === cat ? "default" : "outline"}
            onClick={() => setCategory(cat)}
            className="capitalize rounded-full"
          >
            {categoryLabel(cat)}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : faqs?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {fil ? "Walang nahanap na tanong para sa kategoryang ito." : "No FAQs found for this category or language."}
        </div>
      ) : (
        <Accordion type="single" collapsible className="w-full bg-card rounded-xl border px-6 py-2 shadow-sm">
          {faqs?.map((faq) => (
            <AccordionItem key={faq.id} value={faq.id.toString()}>
              <AccordionTrigger className="text-left font-medium text-base hover:text-primary transition-colors">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed whitespace-pre-line">
                <LinkifiedText text={faq.answer} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
