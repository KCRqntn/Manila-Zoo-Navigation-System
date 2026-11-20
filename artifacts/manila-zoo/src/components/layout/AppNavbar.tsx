import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import { useAppCtx, PALETTES } from "../../contexts/AppContext";
import { Button } from "../ui/button";
import { Moon, Sun, Languages, Menu, Palette, Check, ChevronRight, ClipboardCheck, LayoutDashboard, LogIn, LogOut, MapPin, QrCode } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "../ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { isStaffRole } from "@/lib/adminApi";
import { openEntryWindowAfterLogout } from "@/components/EntryWindow";

function PalettePicker() {
  const { palette, setPalette, language } = useAppCtx();
  const fil = language === "fil";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={fil ? "Pumili ng kulay" : "Choose colours"}>
          <Palette className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3">
        <p className="mb-2 text-sm font-semibold">{fil ? "Kulay ng app" : "App colours"}</p>
        <div className="grid grid-cols-5 gap-2">
          {PALETTES.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPalette(p.id)}
              aria-label={fil ? p.fil : p.en}
              aria-pressed={palette === p.id}
              title={fil ? p.fil : p.en}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-background shadow ring-offset-2 ring-offset-popover transition-transform hover:scale-110 aria-pressed:ring-2 aria-pressed:ring-primary"
              style={{ background: p.swatch }}
            >
              {palette === p.id && <Check className="h-4 w-4 text-black/60" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppNavbar() {
  const { user, signOut } = useAuth();
  const { theme, setTheme, language, setLanguage } = useAppCtx();
  const [location, setLocation] = useLocation();
  // Everyone who logs out goes to the home page and sees the welcome window again
  const logOut = () => {
    setLocation("/");
    openEntryWindowAfterLogout();
    void signOut();
  };
  const fil = language === "fil";

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");
  const toggleLanguage = () => setLanguage(language === "en" ? "fil" : "en");

  // Scan QR lives on the Animals page, Favorites is a filter there, and Rules + FAQ share the Help page
  // (tile and hint are used by the phone menu)
  const navLinks = [
    { href: "/map", label: fil ? "Mapa" : "Map", emoji: "🗺️", tile: "bg-sky-100 dark:bg-sky-900/40", hint: fil ? "Hayop, daan at pinakamalapit na CR" : "Animals, routes & nearest restroom" },
    { href: "/animals", label: fil ? "Mga Hayop" : "Animals", emoji: "🦁", tile: "bg-amber-100 dark:bg-amber-900/40", hint: fil ? "Kilalanin ang mga hayop ng zoo" : "Meet the zoo's residents" },
    { href: "/chat", label: "AI Guide", emoji: "💬", tile: "bg-violet-100 dark:bg-violet-900/40", hint: fil ? "Magtanong sa English o Tagalog" : "Ask in English or Tagalog" },
    { href: "/events", label: fil ? "Mga Kaganapan" : "Events", emoji: "🎉", tile: "bg-pink-100 dark:bg-pink-900/40", hint: fil ? "Mga laro, kaganapan at balita" : "Games, events & news" },
    { href: "/visit", label: fil ? "Oras at Tiket" : "Hours & Tickets", emoji: "🎟️", tile: "bg-rose-100 dark:bg-rose-900/40", hint: fil ? "Oras ng bukas at presyo" : "Opening hours & prices" },
    { href: "/help", label: fil ? "Tulong" : "Help", emoji: "❓", tile: "bg-orange-100 dark:bg-orange-900/40", hint: fil ? "Mga patakaran at FAQ" : "Zoo rules & FAQ" },
  ];
  const quickActions = [
    { href: "/qr-scan", label: fil ? "I-scan ang QR" : "Scan QR", hint: fil ? "Sa karatula ng hayop" : "On any animal sign", icon: QrCode, tile: "bg-primary text-primary-foreground" },
    { href: "/visitor-registration", label: fil ? "Irehistro ang pagbisita" : "Register visit", hint: fil ? "Ikaw at mga kasama" : "You & your companions", icon: ClipboardCheck, tile: "bg-amber-400 text-amber-950" },
  ];
  const isActive = (href: string) => location.startsWith(href);
  // Phone menu: closes after choosing a page
  const [menuOpen, setMenuOpen] = React.useState(false);
  const close = () => setMenuOpen(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center">
        <div className="mr-4 hidden lg:flex items-center">
          <Link href="/" className="mr-6 flex items-center gap-2">
            <span className="text-2xl hover-wiggle" aria-hidden="true">🦒</span>
            <span className="font-bold text-primary text-lg" style={{ fontFamily: "Fredoka, sans-serif" }}>Manila Zoo</span>
          </Link>
          <div className="flex gap-1 text-sm font-medium">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 transition-colors ${
                  isActive(link.href) ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted hover:text-primary"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="lg:hidden flex min-w-0 flex-1 items-center">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="mr-2" aria-label={fil ? "Buksan ang menu" : "Open menu"}>
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left"
              className="flex w-[86vw] max-w-sm flex-col gap-0 overflow-y-auto p-0 sm:max-w-sm [&>*]:shrink-0 [&>button:first-child]:z-10 [&>button:first-child]:rounded-full [&>button:first-child]:bg-white/25 [&>button:first-child]:p-1.5 [&>button:first-child]:text-primary-foreground [&>button:first-child]:opacity-100 [&>button:first-child]:shadow-sm">
              {/* Header: logo, greeting and soft decorations */}
              <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/70 px-5 pb-7 pt-6 text-primary-foreground">
                <span aria-hidden="true" className="pointer-events-none absolute -right-3 -top-2 rotate-12 select-none text-7xl opacity-20">🌿</span>
                <span aria-hidden="true" className="pointer-events-none absolute bottom-1 right-16 -rotate-12 select-none text-3xl opacity-25">🐾</span>
                <span aria-hidden="true" className="pointer-events-none absolute -bottom-6 -left-4 select-none text-6xl opacity-15">🍃</span>
                <Link href="/" onClick={close} className="relative flex items-center gap-3">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/95 text-3xl shadow-lg hover-wiggle" aria-hidden="true">🦒</span>
                  <span>
                    <SheetTitle className="text-2xl font-bold text-primary-foreground" style={{ fontFamily: "Fredoka, sans-serif" }}>Manila Zoo</SheetTitle>
                    <SheetDescription className="text-sm text-primary-foreground/85">{fil ? "Ang iyong gabay sa zoo" : "Your wildlife guide"}</SheetDescription>
                  </span>
                </Link>
                <p className="relative mt-4 truncate rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur-sm">
                  {user?.email
                    ? `👋 ${fil ? "Naka-login bilang" : "Signed in as"} ${user.email}`
                    : `👋 ${fil ? "Mabuhay, explorer! Tara, mag-ikot." : "Welcome, explorer! Let's go wild."}`}
                </p>
              </div>

              {/* Quick actions, pulled up over the header */}
              <div className="relative -mt-4 grid grid-cols-2 gap-3 px-4">
                {quickActions.map((a, i) => (
                  <Link key={a.href} href={a.href} onClick={close}
                    className="menu-item-in group flex flex-col gap-2 rounded-2xl border bg-card p-3 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"
                    style={{ animationDelay: `${60 + i * 50}ms` }}>
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${a.tile}`}><a.icon className="h-5 w-5" /></span>
                    <span className="text-sm font-semibold leading-tight">{a.label}</span>
                    <span className="text-[11px] leading-tight text-muted-foreground">{a.hint}</span>
                  </Link>
                ))}
              </div>

              {/* Pages */}
              <nav aria-label={fil ? "Mga pahina" : "Pages"} className="px-3 pt-5">
                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{fil ? "Tuklasin" : "Explore"}</p>
                <div className="flex flex-col gap-1">
                  {navLinks.map((link, i) => {
                    const active = isActive(link.href);
                    return (
                      <Link key={link.href} href={link.href} onClick={close} aria-current={active ? "page" : undefined}
                        className={`menu-item-in group relative flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors ${
                          active ? "bg-secondary text-primary shadow-sm" : "hover:bg-muted"}`}
                        style={{ animationDelay: `${160 + i * 45}ms` }}>
                        {active && <span aria-hidden="true" className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full bg-primary" />}
                        <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl transition-transform group-hover:scale-110 ${link.tile}`}>{link.emoji}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block font-semibold leading-tight ${active ? "text-primary" : "text-foreground"}`}>{link.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{link.hint}</span>
                        </span>
                        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${active ? "text-primary" : "text-muted-foreground/60"}`} />
                      </Link>
                    );
                  })}
                </div>
              </nav>

              {/* Settings and account */}
              <div className="mt-auto space-y-3 border-t bg-muted/40 px-4 pb-5 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{fil ? "Mga setting" : "Settings"}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={toggleLanguage} className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary">
                    <Languages className="h-4 w-4 text-primary" /> {fil ? "English" : "Filipino"}
                  </button>
                  <button type="button" onClick={toggleTheme} className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm font-medium transition-colors hover:bg-secondary">
                    {theme === "light" ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-primary" />}
                    {theme === "light" ? (fil ? "Madilim" : "Dark mode") : (fil ? "Maliwanag" : "Light mode")}
                  </button>
                </div>
                {user ? (
                  <div className="grid gap-2">
                    {isStaffRole(user.role) && (
                      <Button variant="outline" className="h-11 rounded-xl" asChild>
                        <Link href="/admin" onClick={close}><LayoutDashboard className="mr-2 h-4 w-4" /> {fil ? "Admin dashboard" : "Admin dashboard"}</Link>
                      </Button>
                    )}
                    <Button variant="ghost" className="h-11 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { close(); logOut(); }}>
                      <LogOut className="mr-2 h-4 w-4" /> {fil ? "Mag-logout" : "Log Out"}
                    </Button>
                  </div>
                ) : (
                  <Button className="h-11 w-full rounded-xl" asChild>
                    <Link href="/visitor-registration" onClick={close}><LogIn className="mr-2 h-4 w-4" /> {fil ? "Mag-login" : "Login"}</Link>
                  </Button>
                )}
                <p className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" /> M. Adriatico St, Malate, Manila
                </p>
              </div>
            </SheetContent>
          </Sheet>
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="text-xl" aria-hidden="true">🦒</span>
            <span className="truncate font-bold text-primary">Manila Zoo</span>
          </Link>
        </div>

        {/* Under 360 px wide (iPhone SE) the buttons sit closer so the bar fits without sideways scrolling */}
        <div className="flex flex-1 items-center justify-end">
          <nav className="flex items-center gap-0 min-[360px]:gap-1">
            <Button variant="ghost" size="icon" onClick={toggleLanguage} aria-label={fil ? "Palitan ang wika" : "Switch language"}>
              <Languages className="h-4 w-4" />
            </Button>
            <PalettePicker />
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={theme === "light" ? "Dark mode" : "Light mode"}>
              {theme === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {user ? (
              <>
                {isStaffRole(user.role) && (
                  <Button variant="outline" size="sm" className="rounded-full" asChild>
                    <Link href="/admin">Admin</Link>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={logOut}>
                  {fil ? "Mag-logout" : "Log Out"}
                </Button>
              </>
            ) : (
              <Button variant="default" size="sm" className="rounded-full" asChild>
                <Link href="/visitor-registration">{fil ? "Mag-login" : "Login"}</Link>
              </Button>
            )}
          </nav>
        </div>
      </div>
    </nav>
  );
}
