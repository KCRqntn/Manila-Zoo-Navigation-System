import React from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ShieldCheck, HelpCircle, MessageCircle, Mail } from "lucide-react";
import { InquiryForm } from "@/components/InquiryForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAppCtx } from "../../contexts/AppContext";
import { BackButton } from "@/components/layout/BackButton";
import { Stickers } from "@/components/fun/Stickers";
import { Zookeeper } from "@/components/fun/Zookeeper";
import Rules from "./Rules";
import Faq from "./Faq";

/** Zoo rules, FAQ and the contact form on one page; /rules, /faq and ?tab=contact open the matching tab. */
export default function Help({ initialTab }: { initialTab?: "rules" | "faq" | "contact" }) {
  const { language } = useAppCtx();
  const fil = language === "fil";
  const search = useSearch();
  const [, setLocation] = useLocation();
  const requested = new URLSearchParams(search).get("tab");
  const tab = requested === "faq" || requested === "contact" || requested === "rules" ? requested : initialTab ?? "rules";

  return (
    <div className="container py-12 max-w-3xl mx-auto">
      <BackButton className="mb-4" />
      <div className="relative text-center mb-8">
        <Stickers set="help" />
        <div className="inline-flex items-center justify-center p-3 bg-secondary rounded-full mb-4">
          <HelpCircle className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-4xl font-bold mb-2">{fil ? "Tulong" : "Help"}</h1>
        <p className="text-muted-foreground text-lg">
          {fil ? "Mga patakaran ng zoo, mga madalas itanong, at pakikipag-ugnayan." : "Zoo rules, frequently asked questions, and contact."}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setLocation(`/help?tab=${v}`, { replace: true })}>
        <TabsList className="grid w-full grid-cols-3 rounded-full h-12 p-1 mb-8">
          <TabsTrigger value="rules" className="rounded-full">
            <ShieldCheck className="w-4 h-4 mr-2" /> {fil ? "Mga Patakaran" : "Rules & Policy"}
          </TabsTrigger>
          <TabsTrigger value="faq" className="rounded-full">
            <HelpCircle className="w-4 h-4 mr-2" /> FAQ
          </TabsTrigger>
          <TabsTrigger value="contact" className="rounded-full">
            <Mail className="w-4 h-4 mr-2" /> {fil ? "Kontak" : "Contact"}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="rules"><Rules embedded /></TabsContent>
        <TabsContent value="faq"><Faq embedded /></TabsContent>
        <TabsContent value="contact"><InquiryForm fil={fil} /></TabsContent>
      </Tabs>

      <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm">
        <Zookeeper className="h-14 w-14 shrink-0" />
        <p className="flex-1 text-center sm:text-left">
          {fil ? "Hindi mo nakita ang sagot? Itanong sa aming AI Guide!" : "Can't find your answer? Ask our AI Guide!"}
        </p>
        <Button asChild className="rounded-full">
          <Link href="/chat"><MessageCircle className="w-4 h-4 mr-2" /> {fil ? "Magtanong" : "Ask now"}</Link>
        </Button>
      </div>
    </div>
  );
}
