import React from "react";

type Sticker = { emoji: string; className: string; tilt?: number; delay?: number };

// Ready-made sticker sets for page headers; positions are relative to a `relative` parent
export const STICKER_SETS: Record<string, Sticker[]> = {
  animals: [
    { emoji: "🦁", className: "top-0 right-[22%] text-5xl hidden sm:block", tilt: 8 },
    { emoji: "🐘", className: "top-12 right-[34%] text-4xl hidden md:block", tilt: -6, delay: 1.2 },
    { emoji: "🦜", className: "-top-2 right-[46%] text-3xl hidden lg:block", tilt: 12, delay: 0.6 },
  ],
  chat: [
    { emoji: "🌿", className: "top-0 right-[18%] text-3xl hidden sm:block", tilt: -10 },
    { emoji: "🐒", className: "top-6 right-[30%] text-3xl hidden md:block", tilt: 6, delay: 0.8 },
  ],
  help: [
    { emoji: "🐢", className: "top-4 left-[6%] text-4xl hidden sm:block", tilt: -8 },
    { emoji: "🦉", className: "top-2 right-[6%] text-4xl hidden sm:block", tilt: 8, delay: 1 },
  ],
  home: [
    { emoji: "🦒", className: "top-[12%] right-[6%] text-6xl hidden md:block", tilt: 6 },
    { emoji: "🐊", className: "bottom-[14%] right-[14%] text-5xl hidden md:block", tilt: -6, delay: 1.4 },
    { emoji: "🦅", className: "top-[8%] right-[26%] text-4xl hidden lg:block", tilt: 10, delay: 0.7 },
  ],
  events: [
    { emoji: "🎮", className: "top-2 left-[8%] text-4xl hidden md:block", tilt: -10 },
    { emoji: "🏆", className: "top-0 right-[8%] text-5xl hidden sm:block", tilt: 8, delay: 0.8 },
    { emoji: "🎈", className: "top-16 right-[18%] text-3xl hidden lg:block", tilt: -6, delay: 1.5 },
  ],
  qr: [
    { emoji: "🔍", className: "top-0 right-[10%] text-3xl hidden sm:block", tilt: 10 },
    { emoji: "🐾", className: "top-10 left-[8%] text-3xl hidden sm:block", tilt: -12, delay: 0.9 },
  ],
};

/** Decorative floating emoji stickers. Purely visual: hidden from screen readers and clicks. */
export function Stickers({ set }: { set: keyof typeof STICKER_SETS }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible select-none">
      {STICKER_SETS[set]!.map((s, i) => (
        <span
          key={i}
          className={`sticker absolute ${s.className}`}
          style={{ ["--tilt" as string]: `${s.tilt ?? 0}deg`, animationDelay: `${s.delay ?? 0}s` }}
        >
          {s.emoji}
        </span>
      ))}
    </div>
  );
}
