import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useAppCtx } from "@/contexts/AppContext";

export default function NotFound() {
  const { language } = useAppCtx();
  const fil = language === "fil";
  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold text-foreground">{fil ? "Hindi nahanap ang pahina" : "Page not found"}</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {fil ? "Wala ang pahinang ito. Baka mali ang link o inalis na ito." : "This page doesn't exist. The link may be wrong, or the page was removed."}
          </p>
          <Button asChild className="mt-6 w-full">
            <Link href="/">{fil ? "Bumalik sa Home" : "Back to Home"}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
