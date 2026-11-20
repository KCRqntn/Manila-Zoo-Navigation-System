import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, CheckCircle2, RotateCcw, Trash2, MessageSquareHeart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AnimalFeedback = {
  id: number;
  animal_id: number;
  animal_name: string;
  rating: number | null;
  comment: string | null;
  is_resolved: boolean;
  created_at: string;
};

const FEEDBACK_KEY = ["/api/animal-feedback"] as const;

/** Private visitor feedback from animal pages: what to improve at each exhibit. */
export default function AdminFeedback() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showResolved, setShowResolved] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: FEEDBACK_KEY,
    queryFn: () => customFetch<AnimalFeedback[]>("/api/animal-feedback"),
  });
  const rows = data ?? [];
  const open = rows.filter(r => !r.is_resolved);
  const shown = showResolved ? rows : open;

  const rated = rows.filter(r => r.rating != null);
  const average = rated.length ? rated.reduce((sum, r) => sum + r.rating!, 0) / rated.length : null;

  const act = async (request: Promise<unknown>) => {
    try {
      await request;
      queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY });
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    }
  };
  const setResolved = (id: number, is_resolved: boolean) =>
    act(customFetch(`/api/animal-feedback/${id}`, { method: "PATCH", body: JSON.stringify({ is_resolved }) }));
  const remove = (id: number) => {
    if (confirm("Delete this feedback?")) act(customFetch(`/api/animal-feedback/${id}`, { method: "DELETE" }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Visitor Feedback</h1>
        <p className="text-muted-foreground">Private ratings and comments from animal pages. Visitors can't see these.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">To review</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{open.length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total received</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{rows.length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Average rating</CardTitle></CardHeader>
          <CardContent><p className="flex items-center gap-1 text-3xl font-bold">{average ? average.toFixed(1) : "–"}<Star className="h-6 w-6 fill-amber-400 text-amber-400" /></p></CardContent></Card>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setShowResolved(!showResolved)}>
          {showResolved ? "Hide resolved" : "Show resolved too"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : isError ? (
        <p className="text-destructive">Couldn't load feedback. Is the API server running?</p>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-16 text-center text-muted-foreground">
          <MessageSquareHeart className="mx-auto mb-3 h-10 w-10 opacity-40" />
          {rows.length ? "All feedback has been reviewed." : "No feedback yet. It appears here when visitors use “Help us improve” on an animal page."}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(f => (
            <Card key={f.id} className={f.is_resolved ? "opacity-60" : ""}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/animals/${f.animal_id}`} className="font-semibold text-primary hover:underline">{f.animal_name}</Link>
                    {f.rating != null && (
                      <span className="flex" aria-label={`${f.rating} out of 5`}>
                        {[1, 2, 3, 4, 5].map(n => <Star key={n} className={`h-4 w-4 ${n <= f.rating! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />)}
                      </span>
                    )}
                    {f.is_resolved && <Badge variant="secondary">Resolved</Badge>}
                    <span className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm">{f.comment || <span className="italic text-muted-foreground">No comment, rating only</span>}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setResolved(f.id, !f.is_resolved)}>
                    {f.is_resolved ? <><RotateCcw className="mr-1.5 h-4 w-4" /> Reopen</> : <><CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark resolved</>}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(f.id)} aria-label="Delete feedback">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
