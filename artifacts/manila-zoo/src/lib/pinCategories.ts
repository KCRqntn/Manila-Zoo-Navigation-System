/**
 * The categories admins sort map pins into. Each pin stores one type (pin_type); a category groups
 * one or more types, and a category with several asks which one ("Entrance and Exit": entrance or
 * exit). The visitor map reads the same types for its icons and filters, so a pin's category shows
 * there too. The server accepts exactly these types.
 */
export type PinCategory = {
  id: string;
  label: string;
  emoji: string;
  types: { value: string; label: string }[];
  /** Whether an animal can be linked (exhibits) */
  animal?: boolean;
};

export const PIN_CATEGORIES: PinCategory[] = [
  { id: "animals", label: "Animal Exhibits", emoji: "🦁", types: [{ value: "animal", label: "Animal exhibit" }], animal: true },
  { id: "restrooms", label: "Restrooms", emoji: "🚻", types: [{ value: "restroom", label: "Restroom" }] },
  { id: "buildings", label: "Buildings", emoji: "🏛️", types: [{ value: "building", label: "Building" }] },
  { id: "food", label: "Food and Dining Areas", emoji: "🍔", types: [{ value: "food_stall", label: "Food and dining" }] },
  { id: "gates", label: "Entrance and Exit", emoji: "🚪", types: [{ value: "entrance", label: "Entrance" }, { value: "exit", label: "Exit" }] },
  { id: "facilities", label: "Facilities", emoji: "⛑️", types: [{ value: "emergency", label: "First aid / medical" }, { value: "facility", label: "Other facility (info desk, lockers, souvenirs…)" }] },
  { id: "other", label: "Other Visitor Locations", emoji: "📍", types: [{ value: "other", label: "Other visitor location" }] },
];

export const categoryOf = (pinType: string): PinCategory =>
  PIN_CATEGORIES.find(c => c.types.some(t => t.value === pinType)) ?? PIN_CATEGORIES[PIN_CATEGORIES.length - 1]!;

export const typeLabel = (pinType: string) => categoryOf(pinType).types.find(t => t.value === pinType)?.label ?? pinType;
