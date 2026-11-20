import React, { useState, useRef, useEffect } from "react";
import { useSendChatMessage, useFetchChatHistory, useSearchAnimals, useListMapPins, type MapRoute } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { getRecentScannedAnimal, getVisitorLocation, isInsideZoo } from "@/lib/visitorLocation";
import { useOnlineStatus } from "@/lib/offline";
import { answerOffline, warmOfflineChat } from "@/lib/offlineChat";
import { useAppCtx } from "../../contexts/AppContext";
import { BackButton } from "@/components/layout/BackButton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LinkifiedText } from "@/components/LinkifiedText";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Send, User, Loader2, Map as MapIcon, SpellCheck, X, Trash2, Lightbulb, WifiOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { suggestCorrection, sureCorrection, addZooNames, type Correction } from "@/lib/chatCorrect";
import { Zookeeper } from "@/components/fun/Zookeeper";
import { Stickers } from "@/components/fun/Stickers";

// Ready-made questions for the suggestions button
const QUICK_QUESTIONS = {
  en: [
    { emoji: "🦁", text: "Where is the lion?" },
    { emoji: "🕘", text: "What time does the zoo open?" },
    { emoji: "🎟️", text: "How much are the tickets?" },
    { emoji: "🚻", text: "Where is the nearest restroom?" },
    { emoji: "🍔", text: "Where can I buy food?" },
    { emoji: "🎉", text: "Are there any events today?" },
    { emoji: "🐕", text: "Can I bring my pet?" },
    { emoji: "🐾", text: "What animals are there?" },
  ],
  fil: [
    { emoji: "🦁", text: "Saan ang leon?" },
    { emoji: "🕘", text: "Anong oras bukas ang zoo?" },
    { emoji: "🎟️", text: "Magkano ang tiket?" },
    { emoji: "🚻", text: "Saan ang pinakamalapit na CR?" },
    { emoji: "🍔", text: "Saan puwedeng bumili ng pagkain?" },
    { emoji: "🎉", text: "May mga kaganapan ba ngayon?" },
    { emoji: "🐕", text: "Puwede bang magdala ng alagang hayop?" },
    { emoji: "🐾", text: "Anong mga hayop ang meron?" },
  ],
};

// The conversation survives moving between pages in this tab; "New chat" starts a fresh one
const SESSION_KEY = "zoo-chat-session";
const newSessionId = () => Math.random().toString(36).slice(2, 10);
const loadSessionId = () => {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;
    const id = newSessionId();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return newSessionId();
  }
};

// Messages answered in offline mode live only on this phone (per chat session, for this tab)
type ChatLine = { id: string | number; role: string; message: string; created_at?: string; offline?: boolean };
const offlineKey = (sessionId: string) => `zoo-chat-offline:${sessionId}`;
const loadOfflineLines = (sessionId: string): ChatLine[] => {
  try { return JSON.parse(sessionStorage.getItem(offlineKey(sessionId)) ?? "[]") as ChatLine[]; } catch { return []; }
};
const saveOfflineLines = (sessionId: string, lines: ChatLine[]) => {
  try { sessionStorage.setItem(offlineKey(sessionId), JSON.stringify(lines)); } catch { /* not kept after reload */ }
};

function BotAvatar() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
      <Zookeeper className="h-9 w-9" />
    </div>
  );
}

export default function Chat() {
  const [message, setMessage] = useState("");
  const [sessionId, setSessionId] = useState(loadSessionId);
  const { language } = useAppCtx();
  const fil = language === "fil";
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  // Directions from the most recent reply, offered as a "Show route on map" button
  const [lastRoute, setLastRoute] = useState<MapRoute | null>(null);
  // The place the most recent reply is about ("The lion is in Apex Predators"), offered as "Show on map"
  const [lastPlace, setLastPlace] = useState<{ id: number; name: string } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const online = useOnlineStatus();
  // Spelling/grammar suggestion shown above the input once the visitor pauses typing
  const [suggestion, setSuggestion] = useState<Correction | null>(null);
  const [dismissedFor, setDismissedFor] = useState("");

  // The spelling checker learns the zoo's animal and place names from the live data
  const { data: zooAnimals } = useSearchAnimals({});
  const { data: zooPins } = useListMapPins();
  useEffect(() => {
    if (Array.isArray(zooAnimals)) addZooNames(zooAnimals.flatMap(a => [a.name, a.common_name]));
    if (Array.isArray(zooPins)) addZooNames(zooPins.map(p => p.name));
  }, [zooAnimals, zooPins]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSuggestion(message.trim() && message !== dismissedFor ? suggestCorrection(message, language) : null);
    }, 400);
    return () => clearTimeout(timer);
  }, [message, dismissedFor, language]);

  // Sure fixes of shorthand and common misspellings ("wher", "teh", "pano") are applied when sent, even
  // if the visitor sends before the suggestion appears; guesses only when the visitor taps the
  // suggestion. Dismissing the suggestion keeps the wording.
  const autoCorrect = (text: string) =>
    text === dismissedFor ? text : sureCorrection(text, language);

  const applySuggestion = () => {
    if (!suggestion) return;
    setMessage(suggestion.text);
    setSuggestion(null);
  };

  const { data: history, refetch } = useFetchChatHistory({ session_id: sessionId, limit: 50 });
  const sendMessage = useSendChatMessage();
  const [offlineLines, setOfflineLines] = useState<ChatLine[]>(() => loadOfflineLines(sessionId));
  const [answeringOffline, setAnsweringOffline] = useState(false);
  const busy = sendMessage.isPending || answeringOffline;
  // Server messages and offline answers, in the order they were written
  const safeHistory: ChatLine[] = [...(Array.isArray(history) ? history : []) as ChatLine[], ...offlineLines]
    .map((m, i) => ({ m, i, t: m.created_at ? Date.parse(m.created_at) : 0 }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map(x => x.m);
  const lastAssistantIndex = safeHistory.map(m => m.role).lastIndexOf('assistant');
  const isEmpty = safeHistory.length === 0;

  useEffect(() => { setOfflineLines(loadOfflineLines(sessionId)); }, [sessionId]);
  // While online, keep a copy of what offline mode needs (animals, places, walkways, FAQs)
  useEffect(() => { if (online) warmOfflineChat(); }, [online]);

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") ?? scrollRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [safeHistory.length, busy]);

  /** Offline mode: answered on the phone from saved zoo data (keyword rules, no AI model, nothing sent). */
  const sendOffline = async (text: string) => {
    setAnsweringOffline(true);
    try {
      const answer = await answerOffline(text, language);
      const now = Date.now();
      const lines: ChatLine[] = [
        ...offlineLines,
        { id: `offline-${now}-q`, role: "user", message: text, created_at: new Date(now).toISOString(), offline: true },
        { id: `offline-${now}-a`, role: "assistant", message: answer.reply, created_at: new Date(now + 1).toISOString(), offline: true },
      ];
      setOfflineLines(lines);
      saveOfflineLines(sessionId, lines);
      // The map can show a saved place offline, but drawing a route on it needs the server
      setLastRoute(null);
      setLastPlace(answer.place ?? null);
      setMessage("");
      setSuggestion(null);
    } finally {
      setAnsweringOffline(false);
    }
  };

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    setShowSuggestions(false);
    if (!navigator.onLine) { void sendOffline(text); return; }
    // Directions start where the visitor is (GPS, a spot picked on the map, or a scanned QR code),
    // else the exhibit whose QR code was scanned last; the server says so when it knows neither
    const here = getVisitorLocation();
    const position = here && isInsideZoo(here) ? { context_lat: here.lat, context_lng: here.lng } : {};
    sendMessage.mutate({
      data: {
        message: text,
        session_id: sessionId,
        language,
        context_animal_id: getRecentScannedAnimal(),
        // Not in the generated request type; the server reads it from the body
        ...(position as object),
      }
    }, {
      onSuccess: (data) => {
        setLastRoute(data.route ?? null);
        // Not in the generated response type; the server adds it for location answers
        setLastPlace((data as { location?: { id: number; name: string } }).location ?? null);
        setMessage("");
        setSuggestion(null);
        refetch();
      },
      onError: (err) => {
        // No signal, or the zoo server can't be reached: answer in offline mode instead
        const status = (err as { status?: number } | null)?.status;
        if (!navigator.onLine || !status || status >= 500) { void sendOffline(text); return; }
        toast({
          title: fil ? "Hindi naipadala" : "Message failed",
          description: fil ? "Hindi maipadala ang mensahe. Subukan ulit." : "Could not send message. Please try again.",
          variant: "destructive"
        });
      }
    });
  };

  const startNewChat = () => {
    const id = newSessionId();
    try { sessionStorage.setItem(SESSION_KEY, id); } catch { /* not saved */ }
    setSessionId(id);
    setLastRoute(null);
    setLastPlace(null);
    setMessage("");
    inputRef.current?.focus();
  };

  const questions = QUICK_QUESTIONS[fil ? "fil" : "en"];

  return (
    <div className="container max-w-3xl py-8 h-[calc(100vh-4rem)] flex flex-col">
      <BackButton className="mb-3 self-start" />
      <div className="relative mb-6 flex items-center justify-between gap-3">
        <Stickers set="chat" />
        <div className="relative flex items-center gap-3">
          <div className="hover-wiggle flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-secondary shadow-sm">
            <Zookeeper className="h-14 w-14" title="ZooBot" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-primary">AI Guide</h1>
            <p className="text-muted-foreground">{fil ? "Ako si ZooBot! Magtanong tungkol sa zoo." : "I'm ZooBot! Ask me anything about the zoo."}</p>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="relative rounded-full" disabled={isEmpty}>
              <Trash2 className="mr-1.5 h-4 w-4" /> {fil ? "Bagong chat" : "New chat"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle>{fil ? "Burahin ang usapan?" : "Clear this conversation?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {fil ? "Mawawala sa screen ang mga mensahe at magsisimula ka ng bagong chat." : "Your messages will be cleared from the screen and a new chat will start."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-full">{fil ? "Huwag" : "Cancel"}</AlertDialogCancel>
              <AlertDialogAction className="rounded-full" onClick={startNewChat}>{fil ? "Burahin" : "Clear chat"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden rounded-3xl border-primary/20 bg-card/70 backdrop-blur">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            <div className="flex gap-3">
              <BotAvatar />
              <div className="bg-muted p-3 rounded-2xl rounded-tl-sm max-w-[80%]">
                <p className="text-sm">
                  {fil
                    ? "Kumusta! 👋 Ako si ZooBot, ang iyong Manila Zoo AI Guide. Paano kita matutulungan ngayon?"
                    : "Hello! 👋 I'm ZooBot, your Manila Zoo AI Guide. How can I help you today?"}
                </p>
              </div>
            </div>

            {/* Starter questions for a fresh chat */}
            {isEmpty && !busy && (
              <div className="flex flex-wrap gap-2 pl-[52px]">
                {questions.slice(0, 4).map(q => (
                  <button key={q.text} type="button" onClick={() => send(q.text)}
                    className="rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-secondary">
                    {q.emoji} {q.text}
                  </button>
                ))}
              </div>
            )}

            {safeHistory.map((msg, index) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.role === 'user' ? (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <User className="w-5 h-5" />
                  </div>
                ) : <BotAvatar />}
                <div className={`p-3 rounded-2xl max-w-[80%] ${
                  msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'
                }`}>
                  {msg.offline && msg.role === "assistant" && (
                    <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <WifiOff className="h-3 w-3" /> {fil ? "Offline na sagot" : "Offline answer"}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.role === "user" ? msg.message : <LinkifiedText text={msg.message} />}</p>
                  {lastRoute && msg.role === 'assistant' && index === lastAssistantIndex && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2 rounded-full"
                      onClick={() => setLocation(`/map?from=${lastRoute.from_pin_id > 0 ? lastRoute.from_pin_id : "me"}&to=${lastRoute.to_pin_id}${lastRoute.accessible_only ? "&accessible=1" : ""}`)}
                    >
                      <MapIcon className="w-4 h-4 mr-2" />
                      {fil ? "Ipakita ang ruta sa mapa" : "Show route on map"}
                    </Button>
                  )}
                  {!lastRoute && lastPlace && msg.role === 'assistant' && index === lastAssistantIndex && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2 rounded-full"
                      onClick={() => setLocation(`/map?place=${lastPlace.id}`)}
                    >
                      <MapIcon className="w-4 h-4 mr-2" />
                      {fil ? "Ipakita sa mapa" : "Show on map"}
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex gap-3">
                <BotAvatar />
                <div className="bg-muted p-3 rounded-2xl rounded-tl-sm max-w-[80%] flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {!online && (
          <div role="status" className="flex items-start gap-2 border-t bg-secondary/60 px-4 py-2 text-xs">
            <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {fil
                ? "Offline mode: sasagutin ko ang mga simpleng tanong (mga hayop, direksyon, pinakamalapit na CR, oras, tiket) mula sa impormasyong naka-save sa phone na ito. Kailangan ng koneksyon para sa buong AI Guide."
                : "Offline mode: I'll answer simple questions (animals, directions, nearest restroom, hours, tickets) from the zoo information saved on this phone. The full AI Guide needs a connection."}
            </span>
          </div>
        )}
        <div className="p-4 bg-background/80 border-t relative">
          {suggestion && !busy ? (
            <div
              role="status"
              className="absolute left-4 right-4 bottom-full mb-2 flex items-start gap-2 rounded-2xl border border-primary/30 bg-popover text-popover-foreground p-3 shadow-lg animate-in fade-in slide-in-from-bottom-2"
            >
              <SpellCheck className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
              <button type="button" onClick={applySuggestion} className="flex-1 text-left text-sm">
                <span className="text-muted-foreground">{fil ? "Ito ba ang ibig mong sabihin: " : "Did you mean: "}</span>
                {suggestion.tokens.map((t, i) => (
                  <span key={i} className={t.changed ? "font-semibold text-primary underline decoration-dotted underline-offset-2" : ""}>{t.text}</span>
                ))}
                <span className="block text-xs text-muted-foreground mt-1">
                  {suggestion.allSure
                    ? (fil ? "Awtomatikong itatama pagpadala. Pindutin ang ✕ para panatilihin ang isinulat mo." : "Fixed automatically when you send. Tap ✕ to keep what you typed.")
                    : (fil ? "Pindutin ang mungkahi para gamitin ito. Kung hindi, ipapadala ang isinulat mo." : "Tap the suggestion to use it. Otherwise your message is sent as you typed it.")}
                </span>
              </button>
              <button
                type="button"
                aria-label={fil ? "Isara ang mungkahi" : "Dismiss suggestion"}
                onClick={() => { setDismissedFor(message); setSuggestion(null); }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : showSuggestions && (
            <div className="absolute left-4 right-4 bottom-full mb-2 rounded-2xl border bg-popover p-3 shadow-lg animate-in fade-in slide-in-from-bottom-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">{fil ? "Subukang itanong" : "Try asking"}</p>
                <button type="button" onClick={() => setShowSuggestions(false)} aria-label={fil ? "Isara" : "Close"} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {questions.map(q => (
                  <button key={q.text} type="button" onClick={() => send(q.text)}
                    className="rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-secondary">
                    {q.emoji} {q.text}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); send(autoCorrect(message)); }} className="flex gap-2">
            <Button
              type="button"
              variant={showSuggestions ? "secondary" : "ghost"}
              size="icon"
              className="shrink-0 rounded-full"
              aria-label={fil ? "Mga mungkahing tanong" : "Suggested questions"}
              aria-expanded={showSuggestions}
              onClick={() => setShowSuggestions(!showSuggestions)}
            >
              <Lightbulb className="h-5 w-5" />
            </Button>
            <Input
              ref={inputRef}
              placeholder={fil ? "Magtanong tungkol sa mga hayop, pasilidad, o iskedyul..." : "Ask about animals, facilities, or schedules..."}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab" && suggestion) { e.preventDefault(); applySuggestion(); }
                if (e.key === "Escape" && suggestion) { setDismissedFor(message); setSuggestion(null); }
              }}
              className="flex-1 rounded-full"
              disabled={busy}
            />
            <Button type="submit" size="icon" className="shrink-0 rounded-full" disabled={!message.trim() || busy} aria-label={fil ? "Ipadala" : "Send"}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
