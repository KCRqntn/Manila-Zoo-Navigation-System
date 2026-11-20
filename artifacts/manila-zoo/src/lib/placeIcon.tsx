import React from "react";

/** An icon for a map place: an emoji, or an image for animals that have no emoji (the hyena). */
export type PlaceIcon = { emoji: string } | { src: string; alt: string };

const img = (file: string, alt: string): PlaceIcon => ({ src: `${import.meta.env.BASE_URL}icons/${file}`, alt });

// Matched against the place name, most specific first
const BY_NAME: [RegExp, PlaceIcon][] = [
  [/hyena/i, img("hyena.svg", "Hyena")],
  [/capybara/i, { emoji: "🦫" }],
  [/aviary|bird|ibon/i, { emoji: "🦜" }],
  [/outdoor reptile/i, { emoji: "🐊" }],
  [/indoor reptile/i, { emoji: "🐍" }],
  [/reptile/i, { emoji: "🐊" }],
  [/butterfl/i, { emoji: "🦋" }],
  [/elephant|hippo/i, { emoji: "🐘" }],
  [/primate|monkey|unggoy/i, { emoji: "🐒" }],
  [/zebra/i, { emoji: "🦓" }],
  [/savan|giraffe/i, { emoji: "🦒" }],
  [/endemic|eagle|agila/i, { emoji: "🦅" }],
  [/predator|lion|tiger|leon/i, { emoji: "🦁" }],
  [/museum/i, { emoji: "🏛️" }],
  [/parking|paradahan/i, { emoji: "🅿️" }],
  [/souvenir|gift|shop/i, { emoji: "🛍️" }],
  [/ticket|tiket/i, { emoji: "🎟️" }],
  [/botanical|garden|hardin/i, { emoji: "🌿" }],
  [/first aid|clinic|admin/i, { emoji: "⛑️" }],
  [/food court/i, { emoji: "🍽️" }],
  [/restaurant|cafe|kainan/i, { emoji: "🍴" }],
];

// When the name doesn't say, fall back to the kind of place
const BY_TYPE: Record<string, string> = {
  animal: "🐾", building: "🏢", food_stall: "🍔", restroom: "🚻", emergency: "⛑️", entrance: "🚪", exit: "🚪", facility: "ℹ️", other: "📍",
};

export function placeIcon(place: { name: string; pin_type: string }): PlaceIcon {
  // Restrooms are named after what they're next to ("Restroom (Savannah)"), so their type wins
  if (place.pin_type === "restroom") return { emoji: "🚻" };
  if (place.pin_type === "entrance" || place.pin_type === "exit") return { emoji: "🚪" };
  return BY_NAME.find(([re]) => re.test(place.name))?.[1] ?? { emoji: BY_TYPE[place.pin_type] ?? "📍" };
}

/** The icon as React content, sized by the surrounding font size. */
export function PlaceIconView({ place, className = "" }: { place: { name: string; pin_type: string }; className?: string }) {
  const icon = placeIcon(place);
  return "emoji" in icon
    ? <span className={className} aria-hidden="true">{icon.emoji}</span>
    : <img src={icon.src} alt="" aria-hidden="true" className={`inline-block h-[1.15em] w-[1.15em] align-[-0.2em] ${className}`} />;
}

/** The icon as an HTML string, for Leaflet markers. Only our own emoji and file paths go in it. */
export function placeIconHtml(place: { name: string; pin_type: string }, sizePx: number): string {
  const icon = placeIcon(place);
  return "emoji" in icon
    ? `<span style="font-size:${sizePx}px;line-height:1">${icon.emoji}</span>`
    : `<img src="${icon.src}" alt="" style="width:${sizePx + 3}px;height:${sizePx + 3}px" />`;
}

/** The icon as an HTML element, for map markers built outside React. */
export function placeIconElement(place: { name: string; pin_type: string }, sizePx: number): HTMLElement {
  const icon = placeIcon(place);
  if ("emoji" in icon) {
    const span = document.createElement("span");
    span.textContent = icon.emoji;
    span.style.cssText = `font-size:${sizePx}px;line-height:1`;
    return span;
  }
  const image = document.createElement("img");
  image.src = icon.src;
  image.alt = "";
  image.style.cssText = `width:${sizePx + 3}px;height:${sizePx + 3}px`;
  return image;
}
