import React from "react";
import { 
  useGetDashboardStats, 
  useFetchPopularAnimals, 
  useGetChatbotStats 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PawPrint, Users, QrCode, MessageSquare, Megaphone, CalendarDays, Newspaper, Ticket, MapPin, Inbox, ShieldCheck, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, formatDateTime } from "@/lib/adminApi";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { VisitorStats } from "@/components/admin/VisitorStats";

type Overview = {
  active_announcements: number; scheduled_announcements: number; upcoming_events: number; published_updates: number;
  verified_prices: number; unverified_prices: number; map_locations: number; hidden_locations: number;
  submissions: number; new_submissions: number; backups_completed: number; backups_failed: number; last_backup_at: string | null; failed_actions_7d: number;
};

/** Content, visitors and system health at a glance; each card opens its page. */
function OperationsRow({ panel }: { panel: string }) {
  const q = useQuery({ queryKey: ["/api/admin/overview"], queryFn: () => api<Overview>("/api/admin/overview") });
  const o = q.data;
  const items: { href: string; title: string; value: number | undefined; note: string; icon: typeof Megaphone; warn?: boolean }[] = [
    { href: "/admin/announcements", title: "Active announcements", value: o?.active_announcements, note: `${o?.scheduled_announcements ?? 0} scheduled`, icon: Megaphone },
    { href: "/admin/events", title: "Upcoming events", value: o?.upcoming_events, note: "Published", icon: CalendarDays },
    { href: "/admin/datasets", title: "Published zoo updates", value: o?.published_updates, note: "On the home page", icon: Newspaper },
    { href: "/admin/tickets", title: "Verified ticket prices", value: o?.verified_prices, note: o?.unverified_prices ? `${o.unverified_prices} need verification` : "All verified", icon: Ticket, warn: !!o?.unverified_prices },
    { href: "/admin/map", title: "Map locations", value: o?.map_locations, note: `${o?.hidden_locations ?? 0} hidden from visitors`, icon: MapPin },
    { href: "/admin/submissions", title: "Form submissions", value: o?.submissions, note: `${o?.new_submissions ?? 0} new`, icon: Inbox, warn: !!o?.new_submissions },
    { href: "/admin/backup", title: "Successful backups", value: o?.backups_completed, note: o?.last_backup_at ? `Last: ${formatDateTime(o.last_backup_at)}` : "No backup yet", icon: ShieldCheck, warn: !o?.backups_completed },
    { href: "/admin/audit", title: "Failed backups / actions (7 days)", value: (o?.backups_failed ?? 0) + (o?.failed_actions_7d ?? 0), note: `${o?.backups_failed ?? 0} failed backups, ${o?.failed_actions_7d ?? 0} failed actions`, icon: ShieldAlert, warn: !!o?.backups_failed },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(i => (
        <Link key={i.title} href={i.href}>
          <Card className={`${panel} h-full cursor-pointer transition-transform hover:-translate-y-0.5`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{i.title}</CardTitle>
              <i.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {q.isLoading ? <Skeleton className="h-7 w-16" /> : <div className="text-2xl font-bold">{i.value ?? 0}</div>}
              <p className={`mt-1 text-xs ${i.warn ? "font-medium text-amber-600" : "text-muted-foreground"}`}>{i.note}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: popularAnimals, isLoading: popularLoading } = useFetchPopularAnimals({ limit: 5 });
  const { data: chatbotStats, isLoading: chatLoading } = useGetChatbotStats();

  const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444'];

  const panel = "bg-card/90 backdrop-blur-md shadow-lg";
  const today = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const StatCard = ({ title, value, icon: Icon, trend }: any) => (
    <Card className={panel}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {statsLoading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className="text-2xl font-bold">{value?.toLocaleString() || 0}</div>
        )}
        {trend && <p className="text-xs text-muted-foreground mt-1">{trend}</p>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="pt-4 pb-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Manila Zoological &amp; Botanical Garden</p>
        <h2 className="mt-1 text-3xl font-bold text-balance drop-shadow-md">Welcome back</h2>
        <p className="mt-1 text-white/80 drop-shadow">{today}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Animals" value={stats?.total_animals} icon={PawPrint} trend="In directory" />
        <StatCard title="Chat Visitors Today" value={stats?.total_visitors_today} icon={Users} trend="AI Guide sessions today" />
        <StatCard title="Total QR Scans" value={stats?.total_qr_scans} icon={QrCode} trend="All time" />
        <StatCard title="Chatbot Messages" value={stats?.total_chat_messages} icon={MessageSquare} trend={`Avg. confidence: ${Number(stats?.chatbot_accuracy ?? 0).toFixed(1)}%`} />
      </div>

      {/* Visitor numbers come only from saved registrations (the website QR code's form) */}
      <section aria-labelledby="visitors-heading" className="space-y-3">
        <h3 id="visitors-heading" className="text-lg font-semibold text-white drop-shadow">Visitors (from registrations)</h3>
        <VisitorStats panel={panel} compact />
      </section>

      <OperationsRow panel={panel} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className={`col-span-4 ${panel}`}>
          <CardHeader>
            <CardTitle>Popular Animals (Views)</CardTitle>
          </CardHeader>
          <CardContent className="pl-0">
            {popularLoading ? (
              <div className="h-[300px] flex items-center justify-center"><Skeleton className="h-full w-full mx-4" /></div>
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={popularAnimals || []} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="animal_name" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="view_count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`col-span-3 ${panel}`}>
          <CardHeader>
            <CardTitle>Chatbot Intent Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {chatLoading ? (
              <div className="h-[300px] flex items-center justify-center"><Skeleton className="h-48 w-48 rounded-full" /></div>
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chatbotStats?.top_intents || []}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      fill="#8884d8"
                      paddingAngle={5}
                      dataKey="count"
                      nameKey="intent"
                    >
                      {(chatbotStats?.top_intents || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                  {(chatbotStats?.top_intents || []).slice(0, 4).map((intent, i) => (
                    <div key={intent.intent} className="flex items-center text-xs">
                      <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="capitalize">{intent.intent}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
