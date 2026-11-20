import { useQuery, type QueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

export type GameStop = {
  id: number; animal_id: number; animal_name: string; image_url: string | null;
  hint: string | null; hint_fil: string | null; has_qr: boolean;
};
export type Game = {
  id: number; title: string; title_fil: string | null; description: string | null; description_fil: string | null;
  emoji: string; points_per_stop: number; completion_bonus: number; start_date: string | null; end_date: string | null;
  status: "draft" | "published"; stops: GameStop[]; players?: number;
};
/** total_points: everything earned (sets the level and rank); balance: what's left to spend on rewards */
export type MyProgress = { total_points: number; balance: number; exhibits_scanned: number; rank: number | null; found: Record<string, number[]>; completed: number[] };
export type PointsEntry = { id: number; kind: "scan" | "game" | "game_bonus" | "redeem" | "refund"; points: number; label: string; created_at: string; animal_id: number | null; image_url: string | null };
export type Reward = { id: number; name: string; name_fil: string | null; description: string | null; emoji: string; cost: number; stock: number | null };
export type Redemption = { id: number; reward_id: number; reward_name: string; cost: number; code: string; status: "pending" | "claimed" | "cancelled"; created_at: string; claimed_at: string | null; emoji: string | null };
export type ScanClaim = {
  label: string; earned: number; balance?: number; awards: GameAward[];
  exhibit: { points: number; already: boolean; once: boolean } | null;
  needs_visit?: boolean; needs_camera?: boolean;
};
export type LeaderboardRow = { rank: number; name: string; points: number; finds: number };
export type GameAward = {
  game_id: number; title: string; title_fil: string | null; emoji: string;
  points: number; already_found: boolean; bonus: number; found: number; total: number;
};

export const GAMES_KEY = ["/api/games"] as const;
export const MY_PROGRESS_KEY = ["/api/games/me"] as const;
export const LEADERBOARD_KEY = ["/api/games/leaderboard"] as const;

export const useGames = () =>
  useQuery({ queryKey: GAMES_KEY, queryFn: () => customFetch<Game[]>("/api/games") });

export function useMyProgress() {
  const { user } = useAuth();
  return useQuery({ queryKey: MY_PROGRESS_KEY, queryFn: () => customFetch<MyProgress>("/api/games/me"), enabled: !!user });
}

export const useLeaderboard = () =>
  useQuery({ queryKey: LEADERBOARD_KEY, queryFn: () => customFetch<LeaderboardRow[]>("/api/games/leaderboard"), staleTime: 30_000 });

export const HISTORY_KEY = ["/api/points/history"] as const;
export const REWARDS_KEY = ["/api/rewards"] as const;
export const MY_REWARDS_KEY = ["/api/rewards/mine"] as const;

export function usePointsHistory() {
  const { user } = useAuth();
  return useQuery({ queryKey: HISTORY_KEY, queryFn: () => customFetch<PointsEntry[]>("/api/points/history"), enabled: !!user });
}
export const useRewards = () => useQuery({ queryKey: REWARDS_KEY, queryFn: () => customFetch<Reward[]>("/api/rewards") });
export function useMyRedemptions() {
  const { user } = useAuth();
  return useQuery({ queryKey: MY_REWARDS_KEY, queryFn: () => customFetch<Redemption[]>("/api/rewards/mine"), enabled: !!user });
}

/** Everything that shows points: refreshed after a scan or a redemption */
export function refreshPoints(queryClient: QueryClient) {
  for (const key of [MY_PROGRESS_KEY, LEADERBOARD_KEY, HISTORY_KEY, REWARDS_KEY, MY_REWARDS_KEY]) queryClient.invalidateQueries({ queryKey: key });
}

/**
 * Claims the points for a scanned QR code. Only a code read by the app's own camera (`source:
 * "camera"`) earns points; opening a code's link or typing it shows the animal only. The server
 * decides the points, needs a visit registered today, and never gives the same claim twice.
 */
export async function claimScanPoints(code: string, source: "camera" | "link" | "typed", queryClient: QueryClient): Promise<ScanClaim> {
  const result = await customFetch<ScanClaim>("/api/points/scan", { method: "POST", body: JSON.stringify({ code, source }) });
  refreshPoints(queryClient);
  return { ...result, awards: result.awards ?? [] };
}

/** Redeems a reward. `requestId` is made once per confirmation, so a retry or double tap redeems only once. */
export async function redeemReward(rewardId: number, requestId: string, queryClient: QueryClient): Promise<Redemption> {
  const result = await customFetch<{ redemption: Redemption }>(`/api/rewards/${rewardId}/redeem`, {
    method: "POST", body: JSON.stringify({ request_id: requestId }),
  });
  refreshPoints(queryClient);
  return result.redemption;
}

/** A random id for one redeem confirmation (randomUUID needs https; getRandomValues works everywhere) */
export function newRequestId(): string {
  if (typeof crypto.randomUUID === "function" && window.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Levels visitors reach as their points grow
export const LEVELS = [
  { min: 0, emoji: "🥚", en: "Hatchling", fil: "Bagong Pisa" },
  { min: 30, emoji: "🌱", en: "Junior Ranger", fil: "Batang Ranger" },
  { min: 100, emoji: "🦜", en: "Wildlife Ranger", fil: "Ranger ng Kalikasan" },
  { min: 250, emoji: "🦁", en: "Zoo Hero", fil: "Bayani ng Zoo" },
];
export function levelFor(points: number) {
  const index = LEVELS.reduce((best, l, i) => (points >= l.min ? i : best), 0);
  return { level: LEVELS[index]!, next: LEVELS[index + 1] ?? null };
}

/** A game is playable when it's published and inside its dates. */
export function gameState(g: Game): "upcoming" | "running" | "ended" {
  const now = Date.now();
  if (g.start_date && new Date(g.start_date).getTime() > now) return "upcoming";
  if (g.end_date && new Date(g.end_date).getTime() < now) return "ended";
  return "running";
}
