import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  useListFavorites,
  useAddFavorite,
  useRemoveFavorite,
  getListFavoritesQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppCtx } from "@/contexts/AppContext";
import { useToast } from "@/hooks/use-toast";

const LIKE_COUNTS_KEY = ["/api/favorites/counts"] as const;

/**
 * Hearts on animals: a heart is a saved favorite, and an animal's like count is how many
 * visitors saved it. Liking needs an account so each visitor counts once.
 */
export function useAnimalLikes() {
  const { user } = useAuth();
  const { language } = useAppCtx();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: counts } = useQuery({
    queryKey: LIKE_COUNTS_KEY,
    queryFn: () => customFetch<Record<string, number>>("/api/favorites/counts"),
    staleTime: 30_000,
  });
  const { data: favorites } = useListFavorites({
    query: { enabled: !!user, queryKey: getListFavoritesQueryKey() },
  });
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();

  const favoriteFor = (animalId: number) =>
    Array.isArray(favorites) ? favorites.find(f => f.animal_id === animalId) : undefined;

  const toggleLike = async (animalId: number) => {
    if (!user) {
      toast({
        title: language === "fil" ? "Mag-login muna 💚" : "Log in to like animals 💚",
        description: language === "fil" ? "Kailangan ng account para mag-save ng paborito." : "An account keeps your favorites saved.",
      });
      return;
    }
    const existing = favoriteFor(animalId);
    try {
      if (existing) await removeFavorite.mutateAsync({ id: existing.id });
      else await addFavorite.mutateAsync({ data: { animal_id: animalId } });
    } catch {
      toast({ title: language === "fil" ? "May mali" : "Something went wrong", variant: "destructive" });
    }
    queryClient.invalidateQueries({ queryKey: getListFavoritesQueryKey() });
    queryClient.invalidateQueries({ queryKey: LIKE_COUNTS_KEY });
  };

  return {
    isLiked: (animalId: number) => !!favoriteFor(animalId),
    likeCount: (animalId: number) => counts?.[animalId] ?? 0,
    likedIds: new Set((Array.isArray(favorites) ? favorites : []).map(f => f.animal_id)),
    toggleLike,
    isLoggedIn: !!user,
  };
}
