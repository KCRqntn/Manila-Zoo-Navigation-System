import React, { useEffect, useRef, useState } from "react";
import { AnimalImage, photoZoom } from "@/components/AnimalImage";
import { useSearchAnimals, useListCategories, type Animal } from "@workspace/api-client-react";
import MOCK_CATEGORIES from "@/mocks/categories";
import MOCK_ANIMALS from "@/mocks/animals";
import { Link, useSearch } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Search, QrCode, Heart, Leaf, Utensils, Trees, ArrowRight, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useAppCtx } from "@/contexts/AppContext";
import { useAnimalLikes } from "@/lib/likes";
import { HeartButton } from "@/components/HeartButton";
import { QrScannerPanel } from "@/components/QrScannerPanel";
import { Stickers } from "@/components/fun/Stickers";
import { BackButton } from "@/components/layout/BackButton";
import { usePageState } from "@/lib/navHistory";

// Emoji for each animal category, matched by name
const CATEGORY_EMOJI: Record<string, string> = {
  mammals: "🦁", reptiles: "🐊", birds: "🦜", amphibians: "🐸", fish: "🐟", insects: "🐞",
};
const categoryEmoji = (name?: string | null) => CATEGORY_EMOJI[name?.toLowerCase() ?? ""] ?? "🐾";

// Pastel badge colours for conservation status
const STATUS_STYLE: Record<string, string> = {
  "critically endangered": "bg-red-200 text-red-900",
  "endangered": "bg-orange-200 text-orange-900",
  "vulnerable": "bg-amber-200 text-amber-900",
  "near threatened": "bg-sky-200 text-sky-900",
  "least concern": "bg-emerald-200 text-emerald-900",
};

function AnimalCard({ animal, liked, likes, onLike, fil }: {
  animal: Animal; liked: boolean; likes: number; onLike: () => void; fil: boolean;
}) {
  const status = animal.conservation_status;
  return (
    <div className="group relative rounded-3xl border bg-card p-2 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg focus-within:ring-2 focus-within:ring-ring">
    <Link href={`/animals/${animal.id}`} className="block focus-visible:outline-none">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
        {animal.image_url ? (
          <AnimalImage src={animal.image_url} alt={animal.name} fit="whole" zoom={photoZoom(animal.name)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl">{categoryEmoji(animal.category_name)}</div>
        )}

        {status && (
          <span className={`absolute left-2 top-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status.toLowerCase()] ?? "bg-muted text-foreground"}`}>
            {status}
          </span>
        )}

        {/* Basic info slides up on hover or keyboard focus; the full profile opens on click */}
        <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/85 via-black/70 to-transparent p-4 pt-10 text-white transition-transform duration-300 group-hover:translate-y-0 group-focus-within:translate-y-0">
          {animal.description && <p className="mb-2 line-clamp-2 text-sm">{animal.description}</p>}
          <dl className="space-y-1 text-xs text-white/90">
            {animal.habitat && <div className="flex items-center gap-1.5"><Trees className="h-3.5 w-3.5" /><dt className="sr-only">Habitat</dt><dd className="line-clamp-1">{animal.habitat}</dd></div>}
            {animal.diet && <div className="flex items-center gap-1.5"><Utensils className="h-3.5 w-3.5" /><dt className="sr-only">Diet</dt><dd>{animal.diet}</dd></div>}
          </dl>
          <span className="mt-2 inline-flex items-center text-xs font-semibold text-white">
            {fil ? "I-click para sa buong impormasyon" : "Click for full info"} <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </span>
        </div>
      </div>

      <div className="px-2 pb-1 pt-3">
        <h3 className="text-lg font-semibold leading-tight">{animal.name}</h3>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="truncate text-sm italic text-muted-foreground">{animal.scientific_name}</p>
          {animal.category_name && (
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              {categoryEmoji(animal.category_name)} {animal.category_name}
            </span>
          )}
        </div>
      </div>
    </Link>
    {/* Outside the link so it's its own control, not a button inside a link */}
    <div className="absolute right-4 top-4">
      <HeartButton liked={liked} count={likes} onToggle={onLike} label={`${liked ? (fil ? "Alisin sa paborito" : "Unlike") : (fil ? "Gustuhin" : "Like")} ${animal.name}`} />
    </div>
    </div>
  );
}

export default function Animals() {
  const { language } = useAppCtx();
  const fil = language === "fil";
  const searchString = useSearch();
  // Kept in the history entry, so Back from an animal's profile returns to the same search and filters
  const [search, setSearch] = usePageState("search", "");
  const [category, setCategory] = usePageState<string>("category", "all");
  const [favoritesOnly, setFavoritesOnly] = usePageState("favoritesOnly", () => new URLSearchParams(searchString).get("favorites") === "1");
  const [scanOpen, setScanOpen] = useState(false);
  const likes = useAnimalLikes();

  const { data: categories } = useListCategories();
  const categoriesList = Array.isArray(categories) ? categories.filter(c => (c.animal_count ?? 1) > 0) : MOCK_CATEGORIES;

  const { data: animals, isLoading } = useSearchAnimals({
    search: search || undefined,
    category_id: category !== "all" ? parseInt(category) : undefined,
  });
  const animalsList = (Array.isArray(animals) ? animals : MOCK_ANIMALS as Animal[])
    .filter(a => !favoritesOnly || likes.likedIds.has(a.id));

  // Pagination: 12 animals per page (3 full rows on a laptop, 4 per row)
  const PAGE_SIZE = 12;
  const [page, setPage] = usePageState("page", 1);
  const pageCount = Math.max(1, Math.ceil(animalsList.length / PAGE_SIZE));
  // While the list is still loading, keep the saved page (the clamp would otherwise drop it to 1)
  const currentPage = isLoading ? page : Math.min(page, pageCount);
  const pageAnimals = animalsList.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstShown = animalsList.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(currentPage * PAGE_SIZE, animalsList.length);
  // A new search or filter starts again from page 1 (not on arrival, which may restore a saved page)
  const filterKey = `${search}|${category}|${favoritesOnly}`;
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    setPage(1);
  }, [filterKey, setPage]);
  const gridRef = useRef<HTMLDivElement>(null);
  const goToPage = (n: number) => {
    setPage(Math.min(Math.max(1, n), pageCount));
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/70 text-muted-foreground hover:bg-secondary hover:text-foreground"}`;

  return (
    <div className="container py-10 max-w-screen-xl">
      <BackButton className="mb-4" />
      <div className="relative mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Stickers set="animals" />
        <div className="relative">
          <h1 className="text-4xl font-bold text-primary mb-1">{fil ? "Mga Hayop" : "Animal Directory"}</h1>
          <p className="text-muted-foreground text-lg">{fil ? "Kilalanin ang mga residente ng Manila Zoo." : "Meet the wonderful residents of Manila Zoo."}</p>
        </div>
        <Dialog open={scanOpen} onOpenChange={setScanOpen}>
          <DialogTrigger asChild>
            <Button size="lg" variant="secondary" className="relative rounded-full shadow-sm">
              <QrCode className="mr-2 h-5 w-5" /> {fil ? "I-scan ang QR" : "Scan QR"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md rounded-3xl">
            <DialogHeader>
              <DialogTitle>{fil ? "I-scan ang QR ng hayop" : "Scan an animal's QR code"}</DialogTitle>
              <DialogDescription>{fil ? "Makikita ang QR sign sa bawat kulungan." : "You'll find a QR sign at every exhibit."}</DialogDescription>
            </DialogHeader>
            <QrScannerPanel onDone={() => setScanOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Search bar with category chips */}
      <div className="mb-8 rounded-3xl border bg-card/80 p-3 shadow-sm backdrop-blur">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={fil ? "Maghanap ng hayop..." : "Search animals by name or species..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 rounded-full border-0 bg-muted/60 pl-11 pr-10 text-base shadow-none focus-visible:ring-2"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label={fil ? "Burahin" : "Clear search"} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label={fil ? "Mga kategorya" : "Categories"}>
          <button type="button" className={chip(category === "all" && !favoritesOnly)} aria-pressed={category === "all" && !favoritesOnly}
            onClick={() => { setCategory("all"); setFavoritesOnly(false); }}>
            🌏 {fil ? "Lahat" : "All"}
          </button>
          {categoriesList.map(cat => (
            <button key={cat.id} type="button" className={chip(category === String(cat.id))} aria-pressed={category === String(cat.id)}
              onClick={() => setCategory(category === String(cat.id) ? "all" : String(cat.id))}>
              {categoryEmoji(cat.name)} {cat.name}
            </button>
          ))}
          <button type="button" className={chip(favoritesOnly)} aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)}>
            <Heart className={`mr-1 inline h-3.5 w-3.5 ${favoritesOnly ? "fill-current" : ""}`} /> {fil ? "Aking mga paborito" : "My favorites"}
          </button>
        </div>
      </div>

      <div ref={gridRef} className="grid scroll-mt-24 grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-3xl border bg-card p-2">
              <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
              <Skeleton className="mx-2 mt-3 h-5 w-2/3" />
              <Skeleton className="mx-2 mt-2 mb-2 h-4 w-1/2" />
            </div>
          ))
        ) : animalsList.length === 0 ? (
          <div className="col-span-full rounded-3xl border-2 border-dashed py-16 text-center text-muted-foreground">
            <div className="mb-3 text-5xl" aria-hidden="true">{favoritesOnly ? "💚" : "🔍"}</div>
            {favoritesOnly ? (
              <p>{likes.isLoggedIn
                ? (fil ? "Wala ka pang paborito. Pindutin ang ♥ sa isang hayop!" : "No favorites yet. Tap the ♥ on an animal you love!")
                : (fil ? "Mag-login para makita ang iyong mga paborito." : "Log in to see your favorites.")}</p>
            ) : (
              <p>{fil ? "Walang nakitang hayop." : "No animals found matching your search."}</p>
            )}
          </div>
        ) : (
          pageAnimals.map(animal => (
            <AnimalCard
              key={animal.id}
              animal={animal}
              fil={fil}
              liked={likes.isLiked(animal.id)}
              likes={likes.likeCount(animal.id)}
              onLike={() => likes.toggleLike(animal.id)}
            />
          ))
        )}
      </div>

      {!isLoading && animalsList.length > 0 && (
        <div className="mt-8 flex flex-col items-center gap-3">
          {pageCount > 1 && (
            <nav aria-label={fil ? "Mga pahina" : "Pages"} className="flex flex-wrap items-center justify-center gap-1.5">
              <Button variant="outline" size="sm" className="rounded-full" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> {fil ? "Nakaraan" : "Previous"}
              </Button>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map(n => (
                <Button key={n} size="sm" variant={n === currentPage ? "default" : "ghost"} className="h-9 w-9 rounded-full p-0"
                  aria-label={fil ? `Pahina ${n}` : `Page ${n}`} aria-current={n === currentPage ? "page" : undefined} onClick={() => goToPage(n)}>
                  {n}
                </Button>
              ))}
              <Button variant="outline" size="sm" className="rounded-full" disabled={currentPage >= pageCount} onClick={() => goToPage(currentPage + 1)}>
                {fil ? "Susunod" : "Next"} <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </nav>
          )}
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Leaf className="h-4 w-4" />
            {fil ? `Ipinapakita ang ${firstShown}–${lastShown} sa ${animalsList.length} hayop` : `Showing ${firstShown}–${lastShown} of ${animalsList.length} animals`}
          </p>
        </div>
      )}
    </div>
  );
}
