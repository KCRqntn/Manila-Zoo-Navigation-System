import React from "react";
import { AnimalImage, photoZoom } from "@/components/AnimalImage";
import { useListFavorites, useRemoveFavorite } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, Leaf, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Favorites() {
  const { data: favorites, isLoading } = useListFavorites();
  const removeFavorite = useRemoveFavorite();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleRemove = async (id: number, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigating to animal profile
    try {
      await removeFavorite.mutateAsync({ id });
      toast({ title: "Removed from favorites" });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    } catch (error) {
      toast({ title: "Error", description: "Failed to remove favorite", variant: "destructive" });
    }
  };

  return (
    <div className="container py-12 max-w-screen-xl">
      <div className="flex items-center gap-3 mb-8">
        <Heart className="w-8 h-8 text-red-500 fill-red-500" />
        <h1 className="text-3xl font-bold text-foreground">My Saved Animals</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-48 w-full" />
              <CardHeader>
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
            </Card>
          ))
        ) : !favorites || favorites.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed rounded-2xl bg-muted/20">
            <Heart className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
            <h2 className="text-xl font-semibold mb-2">No favorites yet</h2>
            <p className="text-muted-foreground mb-6">Explore the directory and save the animals you love.</p>
            <Button asChild>
              <Link href="/animals">Browse Animals</Link>
            </Button>
          </div>
        ) : (
          favorites.map((favorite) => {
            const animal = favorite.animal;
            if (!animal) return null;
            
            return (
              <Link key={favorite.id} href={`/animals/${animal.id}`}>
                <Card className="overflow-hidden h-full hover:shadow-md transition-all border-border/50 bg-card/60 backdrop-blur cursor-pointer group relative">
                  <div className="aspect-[4/3] overflow-hidden bg-muted">
                    {animal.image_url ? (
                      <AnimalImage
                        src={animal.image_url}
                        alt={animal.name}
                        fit="whole" zoom={photoZoom(animal.name)}
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Leaf className="w-12 h-12 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity rounded-full h-8 w-8 shadow-sm"
                    onClick={(e) => handleRemove(favorite.id, e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <CardHeader className="p-4">
                    <CardTitle className="text-lg">{animal.name}</CardTitle>
                    <CardDescription className="italic">{animal.scientific_name}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
