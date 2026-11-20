import React from "react";
import { Link, useLocation } from "wouter";
import { useAppCtx } from "@/contexts/AppContext";
import { Zookeeper } from "./Zookeeper";

/** Floating zookeeper button that opens the AI Guide from any visitor page. */
export function AiGuideButton() {
  const [location] = useLocation();
  const { language } = useAppCtx();
  if (location.startsWith("/chat")) return null;
  const label = language === "fil" ? "Magtanong sa AI Guide" : "Ask the AI Guide";
  // On phones the map's place details slide up from the bottom, so the button steps aside there
  const onMap = location.startsWith("/map");

  return (
    <Link
      href="/chat"
      aria-label={label}
      className={`group fixed bottom-5 right-5 z-40 items-center ${onMap ? "hidden md:flex" : "flex"} gap-2 rounded-full border-2 border-primary/30 bg-card/95 p-1.5 pr-1.5 shadow-lg backdrop-blur transition-all hover:pr-4 hover:shadow-xl focus-visible:pr-4`}
    >
      <span className="hover-wiggle flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
        <Zookeeper className="h-12 w-12" />
      </span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold text-primary transition-all duration-300 group-hover:max-w-[12rem] group-focus-visible:max-w-[12rem]">
        {label}
      </span>
    </Link>
  );
}
