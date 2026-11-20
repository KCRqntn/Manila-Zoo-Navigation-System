import React, { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useListEvents, useListAnnouncements } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Calendar, MapPin, Clock, Info, QrCode, Trophy, Check, Megaphone, LogIn } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnimalImage } from "@/components/AnimalImage";
import { QrScannerPanel } from "@/components/QrScannerPanel";
import { Stickers } from "@/components/fun/Stickers";
import { useAppCtx } from "@/contexts/AppContext";
import { BackButton } from "@/components/layout/BackButton";
import { useAuth } from "@/contexts/AuthContext";
import { useGames, useMyProgress, useLeaderboard, levelFor, gameState, type Game } from "@/lib/games";
import { PointsHistory, RewardsShop } from "@/components/games/PointsPanels";
import { photoUrl } from "@/lib/photoUrl";

function PointsCard({ fil, onScan }: { fil: boolean; onScan: () => void }) {
  const { user } = useAuth();
  const { data: me } = useMyProgress();

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border bg-gradient-to-br from-secondary to-accent/40 p-6 text-center sm:flex-row sm:text-left">
        <span className="text-5xl" aria-hidden="true">🏆</span>
        <div className="flex-1">
          <p className="text-lg font-bold">{fil ? "Sumali at mangolekta ng puntos!" : "Join the hunt and collect points!"}</p>
          <p className="text-sm text-muted-foreground">
            {fil ? "Mag-login para ma-save ang iyong puntos at makasali sa leaderboard." : "Log in so your points are saved and you appear on the leaderboard."}
          </p>
        </div>
        <Button asChild className="rounded-full"><Link href="/login"><LogIn className="mr-2 h-4 w-4" /> {fil ? "Mag-login" : "Log in"}</Link></Button>
      </div>
    );
  }

  const points = me?.total_points ?? 0;
  const { level, next } = levelFor(points);
  const progress = next ? ((points - level.min) / (next.min - level.min)) * 100 : 100;
  return (
    <div className="rounded-3xl border bg-gradient-to-br from-secondary to-accent/40 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-card text-4xl shadow-sm" aria-hidden="true">{level.emoji}</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{fil ? level.fil : level.en}</p>
          <p className="text-3xl font-bold text-primary" style={{ fontFamily: "Fredoka, sans-serif" }}>
            {points} <span className="text-lg">{fil ? "puntos" : "points"}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            ⭐ {me?.balance ?? 0} {fil ? "magagamit" : "to spend"}
            {me?.rank ? ` · #${me.rank} ${fil ? "sa leaderboard" : "on the leaderboard"}` : ""}
          </p>
        </div>
        <Button size="lg" className="rounded-full" onClick={onScan}>
          <QrCode className="mr-2 h-5 w-5" /> {fil ? "I-scan ang QR" : "Scan a QR code"}
        </Button>
      </div>
      {next && (
        <div className="mt-4">
          <div className="h-2.5 overflow-hidden rounded-full bg-card">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {fil ? `${next.min - points} puntos pa para maging ${next.emoji} ${next.fil}` : `${next.min - points} more points to become ${next.emoji} ${next.en}`}
          </p>
        </div>
      )}
    </div>
  );
}

function GameCard({ game, found, completed, fil }: { game: Game; found: number[]; completed: boolean; fil: boolean }) {
  const state = gameState(game);
  const total = game.stops.length;
  const count = game.stops.filter(s => found.includes(s.animal_id)).length;
  const maxPoints = total * game.points_per_stop + game.completion_bonus;

  return (
    <Card className="overflow-hidden rounded-3xl">
      <CardHeader className="bg-secondary/40 pb-4">
        <div className="flex items-start gap-3">
          <span className="text-4xl" aria-hidden="true">{game.emoji}</span>
          <div className="flex-1">
            <CardTitle className="text-xl">{fil && game.title_fil ? game.title_fil : game.title}</CardTitle>
            <CardDescription className="mt-1">{fil && game.description_fil ? game.description_fil : game.description}</CardDescription>
          </div>
          {completed && <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold text-amber-900">🏆 {fil ? "Tapos!" : "Done!"}</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-card px-2.5 py-1">⭐ {game.points_per_stop} {fil ? "puntos bawat hayop" : "pts per animal"}</span>
          {game.completion_bonus > 0 && <span className="rounded-full bg-card px-2.5 py-1">🎁 +{game.completion_bonus} {fil ? "bonus kapag natapos" : "bonus for all"}</span>}
          <span className="rounded-full bg-card px-2.5 py-1">🏅 {fil ? "Hanggang" : "Up to"} {maxPoints}</span>
          {state === "upcoming" && game.start_date && (
            <span className="rounded-full bg-sky-200 px-2.5 py-1 text-sky-900">{fil ? "Magsisimula" : "Starts"} {format(new Date(game.start_date), "MMM d")}</span>
          )}
          {state === "running" && game.end_date && (
            <span className="rounded-full bg-card px-2.5 py-1">⏰ {fil ? "Hanggang" : "Until"} {format(new Date(game.end_date), "MMM d")}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-semibold">{fil ? "Hanapin ang mga hayop na ito" : "Find these animals"}</span>
          <span className="text-muted-foreground">{count}/{total}</span>
        </div>
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {game.stops.map(stop => {
            const done = found.includes(stop.animal_id);
            return (
              <li key={stop.id} className={`flex items-center gap-3 rounded-2xl border p-2 ${done ? "border-primary/40 bg-secondary/60" : ""}`}>
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {stop.image_url && <AnimalImage src={stop.image_url} alt="" className={`h-full w-full object-cover ${done ? "" : "opacity-40 grayscale"}`} iconClassName="w-6 h-6" sizes="48px" />}
                  <span className="absolute inset-0 flex items-center justify-center">
                    {done ? <Check className="h-6 w-6 rounded-full bg-primary p-1 text-primary-foreground" /> : <span className="text-lg font-bold text-foreground/70">?</span>}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  {/* The name shows once found; until then the hint is the clue */}
                  <p className="text-sm font-semibold">{done ? stop.animal_name : (fil ? "Misteryosong hayop" : "Mystery animal")}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{fil && stop.hint_fil ? stop.hint_fil : stop.hint}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function Leaderboard({ fil }: { fil: boolean }) {
  const { data: rows, isLoading } = useLeaderboard();
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="flex items-center"><Trophy className="mr-2 h-5 w-5 text-amber-500" /> {fil ? "Nangunguna" : "Leaderboard"}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40 w-full" /> : !rows?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{fil ? "Ikaw na ang mauna! 🐾" : "Be the first on the board! 🐾"}</p>
        ) : (
          <ol className="space-y-1.5">
            {rows.map(r => (
              <li key={r.rank} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.rank <= 3 ? "bg-secondary/60" : ""}`}>
                <span className="w-7 text-center font-bold">{medal[r.rank - 1] ?? r.rank}</span>
                <span className="flex-1 truncate font-medium">{r.name}</span>
                <span className="text-xs text-muted-foreground">{r.finds} 🐾</span>
                <span className="font-bold tabular-nums text-primary">{r.points}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function GamesTab({ fil }: { fil: boolean }) {
  const { data: games, isLoading } = useGames();
  const { data: me } = useMyProgress();
  const [scanOpen, setScanOpen] = useState(false);

  return (
    <div className="space-y-8">
      <PointsCard fil={fil} onScan={() => setScanOpen(true)} />

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <h2 className="text-2xl font-bold">{fil ? "Mga Laro" : "Scavenger hunts"}</h2>
          <ol className="grid gap-3 text-sm sm:grid-cols-3">
            {(fil
              ? ["🔎 Hanapin ang hayop gamit ang clue", "📱 I-scan ang QR sign sa kulungan", "⭐ Kumuha ng puntos at umakyat sa leaderboard"]
              : ["🔎 Use the clue to find the animal", "📱 Scan the QR sign at its exhibit", "⭐ Earn points and climb the leaderboard"]
            ).map(step => <li key={step} className="rounded-2xl bg-muted/60 p-3">{step}</li>)}
          </ol>
          {isLoading ? <Skeleton className="h-64 w-full rounded-3xl" /> : !games?.length ? (
            <div className="rounded-3xl border-2 border-dashed py-12 text-center text-muted-foreground">
              <div className="mb-2 text-4xl" aria-hidden="true">🧭</div>
              {fil ? "Wala pang laro ngayon. Bumalik ka mamaya!" : "No games right now. Check back soon!"}
            </div>
          ) : (
            games.map(g => (
              <GameCard key={g.id} game={g} fil={fil} found={me?.found[g.id] ?? []} completed={me?.completed.includes(g.id) ?? false} />
            ))
          )}
        </div>
        <div className="space-y-6">
          <RewardsShop fil={fil} />
          <PointsHistory fil={fil} />
          <Leaderboard fil={fil} />
        </div>
      </div>

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>{fil ? "I-scan para sa puntos" : "Scan for points"}</DialogTitle>
            <DialogDescription>{fil ? "I-scan ang QR sign sa kulungan ng hayop." : "Scan the QR sign at an animal's exhibit."}</DialogDescription>
          </DialogHeader>
          <QrScannerPanel mode="game" onDone={() => setScanOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewsTab({ fil }: { fil: boolean }) {
  const { data: events, isLoading } = useListEvents();
  const { data: announcementsData } = useListAnnouncements();
  const announcements = (Array.isArray(announcementsData) ? announcementsData : [])
    .filter(a => a.is_active !== false && (!a.expires_at || new Date(a.expires_at) >= new Date()));
  const list = Array.isArray(events) ? events.filter(e => e.is_active !== false) : [];
  const upcoming = list.filter(e => new Date(e.end_date || e.start_date) >= new Date());
  const past = list.filter(e => new Date(e.end_date || e.start_date) < new Date());

  return (
    <div className="space-y-10">
      {announcements.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center text-2xl font-bold"><Megaphone className="mr-2 h-6 w-6 text-primary" /> {fil ? "Mga Anunsyo" : "Announcements"}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {announcements.map(a => (
              <div key={a.id} className="flex gap-3 rounded-2xl border bg-card p-4 shadow-sm">
                <span className="text-2xl" aria-hidden="true">{({ advisory: "⚠️", warning: "⚠️", closure: "🚧", safety: "🚨", alert: "🚨", event: "🎉" } as Record<string, string>)[a.type ?? ""] ?? "📢"}</span>
                <div>
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-sm text-muted-foreground">{a.message}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-6 flex items-center text-2xl font-bold"><Calendar className="mr-2 h-6 w-6 text-primary" /> {fil ? "Mga Paparating" : "Upcoming events"}</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-3xl" />)
          ) : upcoming.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-dashed bg-muted/20 py-12 text-center text-muted-foreground">
              <Info className="mx-auto mb-4 h-12 w-12 opacity-20" />
              <p>{fil ? "Walang nakatakdang kaganapan." : "No upcoming events currently scheduled."}</p>
            </div>
          ) : (
            upcoming.map(event => {
              const ev = event as typeof event & { status?: string; pin_id?: number | null; pin_name?: string | null };
              const cancelled = ev.status === "cancelled";
              return (
              <Card key={event.id} className={`overflow-hidden rounded-3xl transition-all hover:shadow-md ${cancelled ? "opacity-75" : ""}`}>
                {event.image_url && (
                  <div className="h-44 overflow-hidden bg-muted">
                    <img src={photoUrl(event.image_url, 960)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover"
                      onError={e => { if (event.image_url && e.currentTarget.src !== event.image_url) e.currentTarget.src = event.image_url; }} />
                  </div>
                )}
                <CardHeader>
                  {cancelled && (
                    <span className="mb-1 w-fit rounded-full bg-destructive px-2.5 py-0.5 text-xs font-bold uppercase text-destructive-foreground">{fil ? "Kanselado" : "Cancelled"}</span>
                  )}
                  <CardTitle className={`text-xl ${cancelled ? "line-through" : ""}`}>{event.title}</CardTitle>
                  <div className="mt-2 flex flex-col gap-1.5">
                    <CardDescription className="flex items-center font-medium text-primary">
                      <Clock className="mr-2 h-4 w-4" />
                      {format(new Date(event.start_date), "MMM d, yyyy h:mm a")}
                      {event.end_date && ` – ${format(new Date(event.end_date), "h:mm a")}`}
                    </CardDescription>
                    {(ev.pin_name || event.location) && (
                      <CardDescription className="flex items-center">
                        <MapPin className="mr-2 h-4 w-4" /> {ev.pin_name ?? event.location}
                        {ev.pin_id && !cancelled && (
                          <Link href={`/map?from=me&to=${ev.pin_id}`} className="ml-2 text-xs font-medium text-primary underline">{fil ? "Tingnan sa mapa" : "See on map"}</Link>
                        )}
                      </CardDescription>
                    )}
                  </div>
                </CardHeader>
                <CardContent><p className="line-clamp-3 text-sm text-muted-foreground">{event.description}</p></CardContent>
              </Card>
              );
            })
          )}
        </div>
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold text-muted-foreground">{fil ? "Mga Nakaraan" : "Past events"}</h2>
          <div className="grid gap-4 opacity-70 md:grid-cols-2 lg:grid-cols-4">
            {past.slice(0, 4).map(event => (
              <Card key={event.id} className="rounded-2xl bg-muted/50">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">{event.title}</CardTitle>
                  <CardDescription>{format(new Date(event.start_date), "MMM d, yyyy")}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Two kinds of events: games that earn points, and regular events with announcements. */
export default function Events() {
  const { language } = useAppCtx();
  const fil = language === "fil";
  const search = useSearch();
  const [, setLocation] = useLocation();
  const tab = new URLSearchParams(search).get("tab") === "news" ? "news" : "games";

  return (
    <div className="container py-10 max-w-screen-xl">
      <BackButton className="mb-4" />
      <div className="relative mb-8 text-center">
        <Stickers set="events" />
        <h1 className="relative mb-2 text-4xl font-bold text-primary">{fil ? "Mga Kaganapan at Laro" : "Events & Games"}</h1>
        <p className="relative mx-auto max-w-2xl text-lg text-muted-foreground">
          {fil ? "Maglaro, mangolekta ng puntos, at alamin ang mga espesyal na kaganapan." : "Play scavenger hunts, collect points, and catch special events."}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setLocation(v === "news" ? "/events?tab=news" : "/events", { replace: true })}>
        <TabsList className="mx-auto mb-8 grid h-12 w-full max-w-md grid-cols-2 rounded-full p-1">
          <TabsTrigger value="games" className="rounded-full">🎮 {fil ? "Mga Laro" : "Games"}</TabsTrigger>
          <TabsTrigger value="news" className="rounded-full">📢 {fil ? "Kaganapan at Balita" : "Events & News"}</TabsTrigger>
        </TabsList>
        <TabsContent value="games"><GamesTab fil={fil} /></TabsContent>
        <TabsContent value="news"><NewsTab fil={fil} /></TabsContent>
      </Tabs>
    </div>
  );
}
