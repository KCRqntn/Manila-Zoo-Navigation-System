import React, { useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Star, Lock, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppCtx } from "@/contexts/AppContext";
import { useToast } from "@/hooks/use-toast";

/** Private visitor feedback about an exhibit. Only admins can read it (Admin → Feedback). */
export function AnimalFeedbackForm({ animalId, animalName }: { animalId: number; animalName: string }) {
  const { language } = useAppCtx();
  const fil = language === "fil";
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating && !comment.trim()) return;
    setSending(true);
    try {
      await customFetch(`/api/animals/${animalId}/feedback`, {
        method: "POST",
        body: JSON.stringify({ rating: rating || null, comment }),
      });
      setSent(true);
    } catch {
      toast({ title: fil ? "Hindi naipadala" : "Couldn't send feedback", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-3xl border bg-secondary/60 p-6 text-center">
        <div className="mb-2 text-4xl" aria-hidden="true">💌</div>
        <p className="font-semibold">{fil ? "Salamat sa iyong puna!" : "Thanks for your feedback!"}</p>
        <p className="text-sm text-muted-foreground">{fil ? "Babasahin ito ng aming staff." : "Our zoo staff will read it."}</p>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <form onSubmit={submit} className="rounded-3xl border bg-card p-6 shadow-sm">
      <h2 className="text-xl font-bold text-primary">{fil ? "Tulungan kaming mapabuti" : "Help us improve"}</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {fil ? `Kumusta ang pagbisita mo sa ${animalName}?` : `How was your visit to the ${animalName}?`}
      </p>

      <div className="mb-4 flex gap-1" role="radiogroup" aria-label={fil ? "Marka" : "Rating"} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} / 5`}
            onClick={() => setRating(rating === n ? 0 : n)}
            onMouseEnter={() => setHover(n)}
            className="rounded-full p-1 transition-transform hover:scale-110"
          >
            <Star className={`h-7 w-7 ${n <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
          </button>
        ))}
      </div>

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder={fil ? "Ano ang puwede naming ayusin? (hal. malinis ba ang kulungan, nakita mo ba ang hayop)" : "What could we improve? (e.g. was the exhibit clean, could you see the animal?)"}
        className="rounded-2xl"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center text-xs text-muted-foreground">
          <Lock className="mr-1.5 h-3.5 w-3.5" /> {fil ? "Ang staff lang ng zoo ang makakakita nito." : "Only zoo staff can see this."}
        </p>
        <Button type="submit" className="rounded-full" disabled={sending || (!rating && !comment.trim())}>
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {fil ? "Ipadala" : "Send"}
        </Button>
      </div>
    </form>
  );
}
