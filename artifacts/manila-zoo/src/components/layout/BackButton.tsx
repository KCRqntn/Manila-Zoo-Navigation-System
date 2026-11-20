import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAppCtx } from "@/contexts/AppContext";
import { canGoBack } from "@/lib/navHistory";
import { cn } from "@/lib/utils";

/**
 * Returns to the previous page (with its search, filters and scroll position, see lib/navHistory).
 * When the page was opened directly (QR code, typed link, new tab) there is no previous page, so it
 * goes to the main page for that part of the system: the admin dashboard on admin pages, the home
 * page on the visitor website. `fallback` sets a closer parent page instead (e.g. /animals).
 */
export function BackButton({ fallback, className }: { fallback?: string; className?: string }) {
  const [location, navigate] = useLocation();
  const { language } = useAppCtx();
  const inAdmin = location === "/admin" || location.startsWith("/admin/");
  // The admin portal is English only; the visitor website follows the chosen language
  const label = !inAdmin && language === "fil" ? "Bumalik" : "Back";

  const goBack = () => {
    if (canGoBack()) history.back();
    else navigate(fallback ?? (inAdmin ? "/admin" : "/"), { replace: true });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={goBack}
      className={cn("-ml-2 shrink-0 gap-1.5 text-muted-foreground hover:text-foreground", className)}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
