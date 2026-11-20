import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/adminApi";
import type { TreeShape } from "@/lib/treeSurvey";

/**
 * Facilities and Park Areas (planting zones and their trees): types, labels and data hooks shared
 * by the admin pages (Facilities, Park Areas) and the 3D map. Data comes from the API
 * (routes/parkAreas.ts); the map polls it so admin changes show up within 30 seconds.
 */

export type FacilityType = "enclosure" | "building" | "water_feature" | "landscape" | "parking" | "security" | "restroom" | "medical" | "utility" | "other";
export type FacilityStatus = "open" | "maintenance" | "closed";
export type TreeStatus = "healthy" | "needs_care" | "dead" | "unidentified";

export type Facility = {
  id: number; name: string; type: FacilityType; description: string | null; status: FacilityStatus;
  photo_url: string | null; lat: number; lng: number; created_at: string; updated_at: string;
  /** Published: drafts are only listed for staff (visitors' maps never get them) */
  is_active?: boolean;
};
export type ZoneTree = {
  id: number; zone_id: number; species: string | null; status: TreeStatus; notes: string | null;
  lat: number; lng: number; source: "site_plan" | "manual"; created_at: string; updated_at: string;
};
export type ParkZone = {
  id: number; name: string; marker_shape: TreeShape; marker_color: string; description: string | null;
  legend_species: string[]; sort_order: number; trees: ZoneTree[];
};

export const FACILITY_TYPES: { value: FacilityType; label: string; emoji: string }[] = [
  { value: "enclosure", label: "Enclosure", emoji: "🦒" },
  { value: "building", label: "Building", emoji: "🏛️" },
  { value: "water_feature", label: "Water feature", emoji: "⛲" },
  { value: "landscape", label: "Landscape", emoji: "🌴" },
  { value: "parking", label: "Parking", emoji: "🅿️" },
  { value: "security", label: "Security", emoji: "🛡️" },
  { value: "restroom", label: "Restroom", emoji: "🚻" },
  { value: "medical", label: "Medical", emoji: "⚕️" },
  { value: "utility", label: "Utility", emoji: "♻️" },
  { value: "other", label: "Other", emoji: "📍" },
];
export const facilityType = (t: string) => FACILITY_TYPES.find(x => x.value === t) ?? FACILITY_TYPES[FACILITY_TYPES.length - 1]!;

export const FACILITY_STATUSES: { value: FacilityStatus; label: string; color: string; badge: string }[] = [
  { value: "open", label: "Open", color: "#16a34a", badge: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  { value: "maintenance", label: "Under Maintenance", color: "#d97706", badge: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  { value: "closed", label: "Closed", color: "#dc2626", badge: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
];
export const facilityStatus = (s: string) => FACILITY_STATUSES.find(x => x.value === s) ?? FACILITY_STATUSES[0]!;

export const TREE_STATUSES: { value: TreeStatus; label: string; badge: string }[] = [
  { value: "healthy", label: "Healthy", badge: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  { value: "needs_care", label: "Needs Care", badge: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  { value: "dead", label: "Dead", badge: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  { value: "unidentified", label: "Cannot be Identified", badge: "bg-muted text-muted-foreground" },
];
export const treeStatus = (s: string) => TREE_STATUSES.find(x => x.value === s) ?? TREE_STATUSES[3]!;

export const MARKER_SHAPE_OPTIONS: { value: TreeShape; label: string }[] = [
  { value: "star", label: "Star" }, { value: "circle", label: "Circle" }, { value: "triangle", label: "Triangle" },
  { value: "diamond", label: "Diamond" }, { value: "square", label: "Square" }, { value: "pentagon", label: "Pentagon" },
  { value: "heart", label: "Heart" }, { value: "ring", label: "Double circle" }, { value: "asterisk", label: "Asterisk" },
];

export const FACILITIES_KEY = ["/api/facilities"] as const;
export const PARK_AREAS_KEY = ["/api/park-areas"] as const;

/** Facilities for the map and the admin page (refreshed every 30 s on the map) */
export function useFacilities(pollMs?: number) {
  return useQuery({ queryKey: FACILITIES_KEY, queryFn: () => api<Facility[]>("/api/facilities"), refetchInterval: pollMs, staleTime: 15_000 });
}
/** Park areas with their trees */
export function useParkAreas(pollMs?: number) {
  return useQuery({ queryKey: PARK_AREAS_KEY, queryFn: () => api<ParkZone[]>("/api/park-areas"), refetchInterval: pollMs, staleTime: 15_000 });
}
