import React from "react";
import { Link } from "wouter";
import { Facebook, Mail, MapPin } from "lucide-react";
import { useAppCtx } from "@/contexts/AppContext";

export function Footer() {
  const { language } = useAppCtx();
  const fil = language === "fil";

  return (
    <footer className="border-t bg-muted/40 text-muted-foreground py-12">
      <div className="container max-w-screen-2xl grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-4">
          <h3 className="font-bold text-foreground text-lg">Manila Zoo</h3>
          <p className="text-sm">
            {fil
              ? "Maranasan ang kalikasan sa gitna ng lungsod. Tuklasin ang mga hayop at matuto tungkol sa pangangalaga sa kanila."
              : "Experience nature in the heart of the city. A living portal to explore wildlife and learn about conservation."}
          </p>
        </div>
        <div>
          <h4 className="font-semibold text-foreground mb-4">{fil ? "Tuklasin" : "Explore"}</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/map" className="hover:text-primary transition-colors">{fil ? "Interactive na Mapa" : "Interactive Map"}</Link></li>
            <li><Link href="/animals" className="hover:text-primary transition-colors">{fil ? "Listahan ng mga Hayop" : "Animal Directory"}</Link></li>
            <li><Link href="/events" className="hover:text-primary transition-colors">{fil ? "Mga Kaganapan at Laro" : "Events & Games"}</Link></li>
            <li><Link href="/qr-scan" className="hover:text-primary transition-colors">{fil ? "QR Scanner" : "QR Scanner"}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-foreground mb-4">{fil ? "Impormasyon" : "Information"}</h4>
          <ul className="space-y-2 text-sm">
            <li><Link href="/visit" className="hover:text-primary transition-colors">{fil ? "Oras at Tiket" : "Hours & Tickets"}</Link></li>
            <li><Link href="/help?tab=rules" className="hover:text-primary transition-colors">{fil ? "Mga Patakaran" : "Zoo Rules"}</Link></li>
            <li><Link href="/help?tab=faq" className="hover:text-primary transition-colors">{fil ? "Mga Madalas Itanong" : "FAQ"}</Link></li>
            <li><Link href="/chat" className="hover:text-primary transition-colors">{fil ? "AI na Gabay" : "AI Guide"}</Link></li>
            <li><Link href="/visitor-registration" className="hover:text-primary transition-colors">{fil ? "Mag-sign in / Mag-sign up" : "Login / Register"}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-foreground mb-4">{fil ? "Makipag-ugnayan" : "Contact"}</h4>
          <address className="not-italic text-sm space-y-2">
            <a href="https://goo.gl/maps/Ly7am5fp9Q9RMDKp9" target="_blank" rel="noopener noreferrer" className="block hover:text-primary transition-colors">
              <MapPin className="inline h-4 w-4 mr-1.5 align-[-0.2em]" aria-hidden="true" />
              M. Adriatico St, Malate, Manila 1004, Metro Manila
            </a>
            <a href="mailto:manilazoo@manila.gov.ph" className="block hover:text-primary transition-colors break-all">
              <Mail className="inline h-4 w-4 mr-1.5 align-[-0.2em]" aria-hidden="true" />
              manilazoo@manila.gov.ph
            </a>
            <a href="https://www.facebook.com/ManilaZooPH.OfficialPage" target="_blank" rel="noopener noreferrer" className="block hover:text-primary transition-colors">
              <Facebook className="inline h-4 w-4 mr-1.5 align-[-0.2em]" aria-hidden="true" />
              Manila Zoo Official
            </a>
          </address>
        </div>
      </div>
      <div className="container max-w-screen-2xl mt-12 pt-8 border-t text-center text-sm">
        <p>&copy; {new Date().getFullYear()} {fil ? "Manila Zoo Navigation and Information System. Nakalaan ang lahat ng karapatan." : "Manila Zoo Navigation and Information System. All rights reserved."}</p>
      </div>
    </footer>
  );
}
