import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import {
  LayoutDashboard, PawPrint, Map, QrCode, Bot, Users, Megaphone, CalendarDays, MessageSquareHeart, Gamepad2,
  LogOut, ChevronLeft, Database, Ticket, Smartphone, Inbox, ShieldCheck, ScrollText, Settings, Menu, UserCheck, UserCog, Loader2, Building2, Trees, Navigation, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useStaff, type Permission } from "@/lib/adminApi";
import { openEntryWindowAfterLogout } from "@/components/EntryWindow";
import { ChangeCredentialsDialog } from "@/components/admin/ChangeCredentialsDialog";
import { BackButton } from "./BackButton";

type NavItem = { href: string; label: string; icon: LucideIcon; perm: Permission };

// Grouped sections; each item shows only for roles with its permission (the server checks again)
const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Overview", items: [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.read" },
  ] },
  { section: "Datasets", items: [
    { href: "/admin/datasets", label: "Zoo Updates", icon: Database, perm: "dashboard.read" },
    { href: "/admin/tickets", label: "Ticket Prices", icon: Ticket, perm: "dashboard.read" },
    { href: "/admin/announcements", label: "Announcements", icon: Megaphone, perm: "dashboard.read" },
    { href: "/admin/events", label: "Events", icon: CalendarDays, perm: "dashboard.read" },
    { href: "/admin/animals", label: "Animals", icon: PawPrint, perm: "dashboard.read" },
    { href: "/admin/chatbot", label: "Chatbot & FAQ", icon: Bot, perm: "dashboard.read" },
    { href: "/admin/games", label: "Game Events", icon: Gamepad2, perm: "dashboard.read" },
  ] },
  { section: "Map & QR", items: [
    { href: "/admin/map", label: "Map Management", icon: Map, perm: "dashboard.read" },
    { href: "/admin/facilities", label: "Facilities", icon: Building2, perm: "dashboard.read" },
    { href: "/admin/park-areas", label: "Park Areas", icon: Trees, perm: "dashboard.read" },
    { href: "/admin/navigation-demo", label: "Navigation Demo", icon: Navigation, perm: "dashboard.read" },
    { href: "/admin/qr", label: "Exhibit QR Codes", icon: QrCode, perm: "dashboard.read" },
    { href: "/admin/qr-access", label: "QR Code Access", icon: Smartphone, perm: "dashboard.read" },
  ] },
  { section: "Visitors", items: [
    { href: "/admin/visitor-registrations", label: "Visitor Registrations", icon: UserCheck, perm: "submissions.read" },
    { href: "/admin/submissions", label: "Form Submissions", icon: Inbox, perm: "submissions.read" },
    { href: "/admin/feedback", label: "Animal Feedback", icon: MessageSquareHeart, perm: "dashboard.read" },
  ] },
  { section: "System", items: [
    { href: "/admin/backup", label: "Backup & Recovery", icon: ShieldCheck, perm: "backup.manage" },
    { href: "/admin/audit", label: "Audit Logs", icon: ScrollText, perm: "audit.read" },
    { href: "/admin/admin-accounts", label: "Admin Accounts", icon: UserCog, perm: "admins.manage" },
    { href: "/admin/users", label: "Users & Roles", icon: Users, perm: "users.manage" },
    { href: "/admin/settings", label: "System Settings", icon: Settings, perm: "dashboard.read" },
  ] },
];
const ALL_ITEMS = NAV.flatMap(s => s.items);
const isActiveItem = (location: string, href: string) => location === href || (href !== "/admin" && location.startsWith(href));

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location, setLocation] = useLocation();
  const { signOut, user } = useAuth();
  const staff = useStaff();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center border-b px-6">
        <span className="flex items-center font-bold text-primary">
          <span className="mr-2 rounded-md bg-primary p-1.5 text-primary-foreground">MZ</span>
          Admin Portal
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <Button variant="ghost" size="sm" className="mb-3 w-full justify-start text-muted-foreground hover:text-foreground" asChild>
          <Link href="/" onClick={onNavigate}><ChevronLeft className="mr-2 h-4 w-4" /> Back to website</Link>
        </Button>
        {NAV.map(group => {
          const items = group.items.filter(i => staff.loading || staff.can(i.perm));
          if (items.length === 0) return null;
          return (
            <div key={group.section} className="mb-4">
              <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.section}</div>
              <nav className="space-y-0.5">
                {items.map(item => {
                  const active = isActiveItem(location, item.href);
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} onClick={onNavigate}>
                      <div className={`flex cursor-pointer items-center rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                        <Icon className={`mr-3 h-4 w-4 ${active ? "text-primary" : ""}`} />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </nav>
            </div>
          );
        })}
      </div>
      <div className="border-t p-4">
        <p className="mb-2 truncate px-2 text-xs text-muted-foreground" title={staff.username ?? user?.email}>
          {staff.username ?? user?.email} · <span className="font-medium capitalize text-foreground">{staff.role}</span>
        </p>
        <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive" onClick={() => {
          // Leave the dashboard first (so its login check doesn't redirect), then show the welcome window
          onNavigate?.();
          setLocation("/");
          openEntryWindowAfterLogout();
          void signOut();
        }}>
          <LogOut className="mr-3 h-4 w-4" /> Log Out
        </Button>
      </div>
    </div>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const staff = useStaff();
  const isDashboard = location === "/admin" || location === "/admin/";

  // A new or reset administrator sees nothing of the dashboard until they set their own credentials
  // (the API refuses their requests too, so this isn't only hidden)
  if (staff.loading || staff.mustChangeCredentials) {
    return (
      <div className="flex h-screen items-center justify-center bg-muted/20">
        {staff.loading ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <ChangeCredentialsDialog defaultUsername={staff.username} />}
      </div>
    );
  }
  const title = ALL_ITEMS.filter(i => isActiveItem(location, i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.label ?? "Admin";

  return (
    <div className="flex h-screen overflow-hidden bg-muted/20 text-foreground">
      {/* Sidebar on wide screens */}
      <aside className="z-20 hidden w-64 flex-shrink-0 border-r bg-card shadow-sm lg:block">
        <SidebarContent />
      </aside>

      <div className="relative flex flex-1 flex-col overflow-hidden">
        <header className="z-10 flex h-16 items-center gap-3 border-b bg-card px-4 sm:px-6">
          {/* Menu button on phones and tablets */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open admin menu"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SidebarContent onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          {/* Every admin page but the dashboard: back to the previous page (the dashboard if opened directly) */}
          {!isDashboard && <BackButton className="ml-0 lg:-ml-2" />}
          <h1 className="truncate text-lg font-semibold">{title}</h1>
        </header>
        {/* The dashboard sits over the zoo's entrance at night; other admin pages keep a plain background */}
        {isDashboard && (
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 top-16 z-0">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/manila-zoo-entrance.jpg)` }} />
            <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/55 to-black/75" />
          </div>
        )}
        <main data-scroll-root className={`relative z-[1] flex-1 overflow-auto p-4 sm:p-6 ${isDashboard ? "" : "bg-background/50"}`}>
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
