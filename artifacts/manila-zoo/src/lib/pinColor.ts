import type { MapPin } from "@workspace/api-client-react";

/** Marker color for a pin: its own color if the admin set one, otherwise one per pin type. */
export function pinColor(pin: Pick<MapPin, "color" | "pin_type">): string {
  if (pin.color) return pin.color;
  switch (pin.pin_type) {
    case "animal": return "#22c55e";
    case "food_stall": return "#f97316";
    case "restroom": return "#3b82f6";
    case "emergency": return "#ef4444";
    case "entrance": case "exit": return "#a855f7";
    case "facility": return "#0ea5e9";
    default: return "#6b7280";
  }
}
