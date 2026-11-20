import React from "react";
import { AnimalImage, photoZoom } from "@/components/AnimalImage";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useGetFeaturedAnimals, useListAnnouncements } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Leaf, Map as MapIcon, ScanLine, MessageCircle, Megaphone, Newspaper, TriangleAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Stickers } from "@/components/fun/Stickers";
import { useAppCtx } from "@/contexts/AppContext";

export default function Home() {
  const { language } = useAppCtx();
  const fil = language === "fil";
  const { data: featuredAnimalsData, isLoading: animalsLoading } = useGetFeaturedAnimals();
  const { data: announcementsData, isLoading: announcementsLoading } = useListAnnouncements();

  const announcements = Array.isArray(announcementsData)
    ? announcementsData
    : [];

  const featuredAnimals = Array.isArray(featuredAnimalsData)
    ? featuredAnimalsData
    : [];
  // Official updates from the Zoo Updates dataset (published only)
  const { data: updatesData } = useQuery({
    queryKey: ["/api/zoo-updates"],
    queryFn: () => customFetch<{ id: number; title: string; description: string; category: string; published_at: string | null }[]>("/api/zoo-updates"),
  });
  const updates = Array.isArray(updatesData) ? updatesData.slice(0, 6) : [];
  type Ann = (typeof announcements)[number] & { priority?: string; type?: string | null };
  const urgent = (announcements as Ann[]).filter(a => a.priority === "urgent");

  return (
    <div className="flex flex-col min-h-screen">
      {/* Urgent announcements stay on top of everything */}
      {urgent.map(a => (
        <div key={a.id} role="alert" className="flex items-start gap-3 bg-destructive px-4 py-3 text-destructive-foreground sm:px-6">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm"><span className="font-bold">{a.title}:</span> {a.message}</p>
        </div>
      ))}
      {/* Hero Section */}
      <section className="relative w-full h-[80vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm z-10" />
        <div 
          className="absolute inset-0 bg-cover bg-center z-0" 
          // Shown under a blur, so a phone-sized copy is plenty on phones (was 2000 px for every screen)
          style={{ backgroundImage: `url("https://images.unsplash.com/photo-1541414779316-956a5084c0d4?auto=format&fit=crop&q=70&w=${window.innerWidth >= 1024 ? 1600 : 900}")` }}
        />
        
        <div className="absolute inset-0 z-20"><Stickers set="home" /></div>
        <div className="relative z-20 container text-center space-y-6">
          <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight drop-shadow-lg">
            {fil ? "Tuklasin ang Mailap na Puso ng Maynila" : "Discover the Wild Heart of Manila"}
          </h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto drop-shadow-md">
            {fil ? "Tuklasin ang iba't ibang tirahan, kilalanin ang mga hayop, at libutin ang zoo gamit ang aming interactive na digital na gabay." : "Explore diverse habitats, meet exotic animals, and navigate the zoo with our interactive digital guide."}
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" asChild>
              <Link href="/map">
                <MapIcon className="mr-2 h-5 w-5" /> {fil ? "Buksan ang Mapa" : "Open Interactive Map"}
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/30 backdrop-blur-md" asChild>
              <Link href="/chat">
                <MessageCircle className="mr-2 h-5 w-5" /> {fil ? "Kausapin ang Gabay" : "Chat with Guide"}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="container py-16 space-y-16">
        {/* Quick Actions */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-card/50 backdrop-blur border-primary/10 hover:border-primary/30 transition-colors">
            <CardHeader>
              <MapIcon className="w-10 h-10 text-primary mb-2" />
              <CardTitle>{fil ? "Libutin ang Zoo" : "Navigate the Zoo"}</CardTitle>
              <CardDescription>{fil ? "Hanapin ang daan gamit ang interactive na mapa at pagtukoy ng lokasyon." : "Find your way around with our interactive map and location tracking."}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="ghost" className="w-full justify-between" asChild>
                <Link href="/map">{fil ? "Tingnan ang Mapa" : "Explore Map"} <ArrowRight className="w-4 h-4 ml-2" /></Link>
              </Button>
            </CardFooter>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-primary/10 hover:border-primary/30 transition-colors">
            <CardHeader>
              <ScanLine className="w-10 h-10 text-primary mb-2" />
              <CardTitle>{fil ? "I-scan at Matuto" : "Scan & Learn"}</CardTitle>
              <CardDescription>{fil ? "I-scan ang QR code sa mga kulungan para malaman ang mga kawili-wiling impormasyon." : "Scan QR codes at animal enclosures to learn fascinating facts."}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="ghost" className="w-full justify-between" asChild>
                <Link href="/qr-scan">{fil ? "Buksan ang Scanner" : "Open Scanner"} <ArrowRight className="w-4 h-4 ml-2" /></Link>
              </Button>
            </CardFooter>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-primary/10 hover:border-primary/30 transition-colors">
            <CardHeader>
              <Leaf className="w-10 h-10 text-primary mb-2" />
              <CardTitle>{fil ? "Kilalanin ang mga Hayop" : "Meet the Animals"}</CardTitle>
              <CardDescription>{fil ? "Tingnan ang listahan ng mga hayop sa zoo." : "Browse our extensive directory of wildlife residents."}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="ghost" className="w-full justify-between" asChild>
                <Link href="/animals">{fil ? "Tingnan ang Listahan" : "View Directory"} <ArrowRight className="w-4 h-4 ml-2" /></Link>
              </Button>
            </CardFooter>
          </Card>
        </section>

        {/* Featured Animals */}
        <section>
          <div className="flex justify-between items-end mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">{fil ? "Mga Tampok na Hayop" : "Featured Residents"}</h2>
            <Button variant="link" asChild>
              <Link href="/animals">{fil ? "Tingnan lahat" : "View all"}</Link>
            </Button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {animalsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="h-48 w-full" />
                  <CardHeader>
                    <Skeleton className="h-6 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                </Card>
              ))
            ) : featuredAnimals.map((animal) => (
              <Link key={animal.id} href={`/animals/${animal.id}`}>
                <Card className="overflow-hidden h-full hover:shadow-md transition-all border-border/50 bg-card/60 backdrop-blur cursor-pointer group">
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
                  <CardHeader className="p-4">
                    <CardTitle className="text-lg">{animal.name}</CardTitle>
                    <CardDescription className="italic">{animal.scientific_name}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* Announcements (active ones, most urgent first) */}
        {announcements && announcements.length > 0 && (
          <section className="bg-primary/5 rounded-3xl p-5 sm:p-8 border border-primary/10">
            <h2 className="text-2xl font-bold tracking-tight mb-6 text-foreground flex items-center gap-2"><Megaphone className="h-6 w-6 text-primary" /> {fil ? "Mga Anunsyo" : "Announcements"}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {(announcements as Ann[]).map((announcement) => (
                <Card key={announcement.id} className={`bg-card ${announcement.priority === "urgent" ? "border-destructive" : announcement.priority === "high" ? "border-orange-400" : ""}`}>
                  <CardHeader>
                    <div className="flex justify-between items-start gap-2">
                      <CardTitle className="text-xl">
                        {(announcement.priority === "urgent" || announcement.priority === "high") && (
                          <span className={`mr-2 rounded-full px-2 py-0.5 align-middle text-xs font-semibold uppercase ${announcement.priority === "urgent" ? "bg-destructive text-destructive-foreground" : "bg-orange-100 text-orange-800"}`}>
                            {announcement.priority === "urgent" ? (fil ? "Mahalaga" : "Urgent") : (fil ? "Paalala" : "Important")}
                          </span>
                        )}
                        {announcement.title}
                      </CardTitle>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                        {new Date(announcement.created_at).toLocaleDateString(fil ? "fil-PH" : "en-PH")}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{announcement.message}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Official zoo updates */}
        {updates.length > 0 && (
          <section>
            <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground"><Newspaper className="h-6 w-6 text-primary" /> {fil ? "Mga Balita ng Zoo" : "Zoo Updates"}</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {updates.map(u => (
                <Card key={u.id} className="bg-card">
                  <CardHeader className="pb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">{u.category}</p>
                    <CardTitle className="text-lg leading-snug">{u.title}</CardTitle>
                    {u.published_at && <CardDescription>{new Date(u.published_at).toLocaleDateString(fil ? "fil-PH" : "en-PH", { dateStyle: "medium" })}</CardDescription>}
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-sm text-muted-foreground">{u.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
