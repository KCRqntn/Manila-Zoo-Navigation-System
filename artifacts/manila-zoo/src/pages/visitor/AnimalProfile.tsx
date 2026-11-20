import React from "react";
import { AnimalImage, photoZoom } from "@/components/AnimalImage";
import { useRoute } from "wouter";
import { 
  useGetAnimal, 
  getGetAnimalQueryKey,
  useGetAnimalGallery,
  getGetAnimalGalleryQueryKey,
  useFetchNearbyAnimals,
  getFetchNearbyAnimalsQueryKey,
} from "@workspace/api-client-react";
import { useAnimalLikes } from "@/lib/likes";
import { HeartButton } from "@/components/HeartButton";
import { AnimalFeedbackForm } from "@/components/AnimalFeedbackForm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, Info, Image as ImageIcon, Link as LinkIcon, Leaf } from "lucide-react";
import { Link } from "wouter";
import { useAppCtx } from "@/contexts/AppContext";
import { BackButton } from "@/components/layout/BackButton";

type NearbyAnimal = {
  id: number;
  name: string;
  scientific_name?: string | null;
  image_url?: string | null;
};

const getConservationColor = (status?: string | null) => {
  switch (status?.toLowerCase()) {
    case 'extinct': return 'bg-black text-white';
    case 'critically endangered': return 'bg-red-600 text-white';
    case 'endangered': return 'bg-orange-500 text-white';
    case 'vulnerable': return 'bg-yellow-500 text-black';
    case 'near threatened': return 'bg-blue-500 text-white';
    case 'least concern': return 'bg-green-600 text-white';
    default: return 'bg-gray-200 text-black';
  }
};

const isNearbyAnimal = (value: unknown): value is NearbyAnimal => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'number' && typeof candidate.name === 'string';
};

const normalizeNearbyAnimals = (value: unknown): NearbyAnimal[] => {
  if (Array.isArray(value)) {
    return value.filter(isNearbyAnimal);
  }

  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    const nested = candidate.nearby_animals;
    if (Array.isArray(nested)) {
      return nested.filter(isNearbyAnimal);
    }
  }

  return [];
};

export default function AnimalProfile() {
  const [, params] = useRoute("/animals/:id");
  const animalId = params?.id ? parseInt(params.id) : 0;
  const likes = useAnimalLikes();
  const { language } = useAppCtx();
  const fil = language === "fil";

  const { data: animal, isLoading } = useGetAnimal(animalId, {
    query: { enabled: !!animalId, queryKey: getGetAnimalQueryKey(animalId) }
  });

  const { data: gallery } = useGetAnimalGallery(animalId, {
    query: { enabled: !!animalId, queryKey: getGetAnimalGalleryQueryKey(animalId) }
  });

  const { data: nearbyAnimals } = useFetchNearbyAnimals(animalId, {
    query: { enabled: !!animalId, queryKey: getFetchNearbyAnimalsQueryKey(animalId) }
  });

  const nearbyAnimalList = normalizeNearbyAnimals(nearbyAnimals);

  if (isLoading) {
    return (
      <div className="container py-8 max-w-screen-xl">
        <Skeleton className="h-[40vh] w-full rounded-xl mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-4">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-32 w-full mt-8" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!animal) {
    return (
      <div className="container py-8">
        <BackButton fallback="/animals" />
        <p className="py-12 text-center">{fil ? "Hindi nahanap ang hayop." : "Animal not found."}</p>
      </div>
    );
  }

  return (
    <div className="pb-12">
      {/* Hero Section */}
      <div className="relative h-[50vh] min-h-[400px] w-full bg-muted overflow-hidden">
        {/* Over the photo, so it stays at the top-left like on the other pages */}
        <div className="absolute inset-x-0 top-0 z-10">
          <div className="container max-w-screen-xl pt-4">
            <BackButton fallback="/animals" className="ml-0 bg-black/40 text-white backdrop-blur hover:bg-black/55 hover:text-white" />
          </div>
        </div>
        {animal.image_url ? (
          <AnimalImage
            src={animal.image_url}
            alt={animal.name}
            fit="whole" zoom={photoZoom(animal.name)}
            className="w-full h-full object-cover"
            iconClassName="w-24 h-24"
            sizes="100vw" maxWidth={1600}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary/10">
            <Leaf className="w-24 h-24 text-primary/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 w-full p-8 text-white">
          <div className="container max-w-screen-xl">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <Badge className={`mb-3 ${getConservationColor(animal.conservation_status)}`}>
                  {animal.conservation_status || (fil ? 'Hindi alam ang status' : 'Unknown Status')}
                </Badge>
                <h1 className="text-4xl md:text-6xl font-bold mb-2">{animal.name}</h1>
                <p className="text-xl md:text-2xl text-white/80 italic">{animal.scientific_name}</p>
              </div>
              <div className="flex gap-3">
                <HeartButton
                  size="lg"
                  liked={likes.isLiked(animal.id)}
                  count={likes.likeCount(animal.id)}
                  onToggle={() => likes.toggleLike(animal.id)}
                  label={likes.isLiked(animal.id) ? (fil ? `Alisin ang like sa ${animal.name}` : `Unlike ${animal.name}`) : (fil ? `I-like ang ${animal.name}` : `Like ${animal.name}`)}
                />
                {animal.location_name && (
                  <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground" asChild>
                    <Link href={`/map?animal=${animal.id}`}>
                      <MapPin className="mr-2 h-5 w-5" /> {fil ? "Tingnan sa Mapa" : "View on Map"}
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8 max-w-screen-xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-8">
            <Tabs defaultValue="about" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1">
                <TabsTrigger value="about"><Info className="w-4 h-4 mr-2" /> {fil ? "Tungkol" : "About"}</TabsTrigger>
                <TabsTrigger value="gallery"><ImageIcon className="w-4 h-4 mr-2" /> {fil ? "Mga Larawan" : "Gallery"}</TabsTrigger>
                <TabsTrigger value="taxonomy"><LinkIcon className="w-4 h-4 mr-2" /> {fil ? "Klasipikasyon" : "Taxonomy"}</TabsTrigger>
              </TabsList>
              
              <TabsContent value="about" className="space-y-6 mt-6">
                <section>
                  <h2 className="text-2xl font-bold mb-4 text-primary">{fil ? "Paglalarawan" : "Description"}</h2>
                  <p className="text-lg leading-relaxed text-muted-foreground">
                    {animal.description || (fil ? "Wala pang paglalarawan." : "No description available.")}
                  </p>
                </section>
                
                {animal.interesting_facts && (
                  <section className="bg-primary/5 p-6 rounded-2xl border border-primary/10">
                    <h2 className="text-xl font-bold mb-3 text-primary flex items-center">
                      <Leaf className="w-5 h-5 mr-2" /> {fil ? "Mga Kawili-wiling Kaalaman" : "Interesting Facts"}
                    </h2>
                    {/* Stored as a list (one fact each); older records may hold a single text */}
                    {Array.isArray(animal.interesting_facts) ? (
                      <ul className="list-disc space-y-1 pl-5 text-muted-foreground leading-relaxed">
                        {(animal.interesting_facts as string[]).map((fact, i) => <li key={i}>{fact}</li>)}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground leading-relaxed">{animal.interesting_facts}</p>
                    )}
                  </section>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="bg-card/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">{fil ? "Tirahan" : "Habitat"}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium text-lg">{animal.habitat || (fil ? "Hindi alam" : "Unknown")}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-card/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">{fil ? "Pagkain" : "Diet"}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium text-lg">{animal.diet || (fil ? "Hindi alam" : "Unknown")}</p>
                    </CardContent>
                  </Card>
                </div>

                <AnimalFeedbackForm animalId={animal.id} animalName={animal.name} />
              </TabsContent>

              <TabsContent value="gallery" className="mt-6">
                {Array.isArray(gallery) && gallery.length > 0 ? (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    {gallery.map((img) => (
                      <div key={img.id} className="rounded-xl overflow-hidden aspect-[4/3] bg-muted relative group">
                        <AnimalImage
                          src={img.image_url}
                          alt={img.caption || animal.name}
                          fit="whole" zoom={photoZoom(animal.name)}
                          sizes="(min-width: 640px) 50vw, 100vw"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                        {img.caption && (
                          <div className="absolute bottom-0 inset-x-0 bg-black/60 p-3 text-white text-sm sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            {img.caption}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-2xl">
                    <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>{fil ? "Wala pang larawan para sa hayop na ito." : "No gallery images available for this animal."}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="taxonomy" className="mt-6">
                <Card>
                  <CardContent className="p-0">
                    <dl className="divide-y divide-border">
                      <div className="px-6 py-4 grid grid-cols-3 gap-4">
                        <dt className="text-sm font-medium text-muted-foreground">{fil ? "Kaharian" : "Kingdom"}</dt>
                        <dd className="text-sm col-span-2">{animal.kingdom || "-"}</dd>
                      </div>
                      <div className="px-6 py-4 grid grid-cols-3 gap-4 bg-muted/20">
                        <dt className="text-sm font-medium text-muted-foreground">{fil ? "Kalapian" : "Phylum"}</dt>
                        <dd className="text-sm col-span-2">{animal.phylum || "-"}</dd>
                      </div>
                      <div className="px-6 py-4 grid grid-cols-3 gap-4">
                        <dt className="text-sm font-medium text-muted-foreground">{fil ? "Klase" : "Class"}</dt>
                        <dd className="text-sm col-span-2">{animal.class || "-"}</dd>
                      </div>
                      <div className="px-6 py-4 grid grid-cols-3 gap-4 bg-muted/20">
                        <dt className="text-sm font-medium text-muted-foreground">{fil ? "Orden" : "Order"}</dt>
                        <dd className="text-sm col-span-2">{animal.order || "-"}</dd>
                      </div>
                      <div className="px-6 py-4 grid grid-cols-3 gap-4">
                        <dt className="text-sm font-medium text-muted-foreground">{fil ? "Pamilya" : "Family"}</dt>
                        <dd className="text-sm col-span-2">{animal.family || "-"}</dd>
                      </div>
                      <div className="px-6 py-4 grid grid-cols-3 gap-4 bg-muted/20">
                        <dt className="text-sm font-medium text-muted-foreground">{fil ? "Sari" : "Genus"}</dt>
                        <dd className="text-sm col-span-2 italic">{animal.genus || "-"}</dd>
                      </div>
                      <div className="px-6 py-4 grid grid-cols-3 gap-4">
                        <dt className="text-sm font-medium text-muted-foreground">{fil ? "Uri" : "Species"}</dt>
                        <dd className="text-sm col-span-2 italic">{animal.species || "-"}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="bg-card/60 backdrop-blur border-primary/20">
              <CardHeader>
                <CardTitle className="text-primary">{fil ? "Mabilis na Impormasyon" : "Quick Stats"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">{fil ? "Timbang" : "Weight"}</p>
                  <p className="font-medium">{animal.weight_kg ? `${animal.weight_kg} kg` : "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">{fil ? "Taas / Haba" : "Height / Length"}</p>
                  <p className="font-medium">{animal.height_cm ? `${animal.height_cm} cm` : "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">{fil ? "Haba ng Buhay" : "Lifespan"}</p>
                  <p className="font-medium">{animal.lifespan_years ? `${animal.lifespan_years} ${fil ? "taon" : "years"}` : "-"}</p>
                </div>
                {animal.feeding_schedule && (
                  <div className="pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">{fil ? "Oras ng Pagpapakain" : "Feeding Schedule"}</p>
                    <Badge variant="secondary" className="text-sm bg-accent/20 text-accent-foreground">
                      {animal.feeding_schedule}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {nearbyAnimalList.length > 0 && (
              <div>
                <h3 className="text-lg font-bold mb-4">{fil ? "Mga Kalapit na Hayop" : "Nearby Animals"}</h3>
                <div className="space-y-3">
                  {nearbyAnimalList.slice(0, 3).map(nearby => (
                    <Link key={nearby.id} href={`/animals/${nearby.id}`}>
                      <Card className="hover:bg-muted/50 cursor-pointer transition-colors border-border/50">
                        <div className="flex items-center p-3 gap-3">
                          <div className="w-16 h-16 rounded-md bg-muted overflow-hidden shrink-0">
                            {nearby.image_url ? (
                              <AnimalImage src={nearby.image_url} alt={nearby.name} className="w-full h-full object-cover" iconClassName="w-8 h-8" sizes="64px" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Leaf className="w-6 h-6 text-muted-foreground/30" />
                              </div>
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium text-sm line-clamp-1">{nearby.name}</h4>
                            <p className="text-xs text-muted-foreground line-clamp-1">{nearby.scientific_name}</p>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
