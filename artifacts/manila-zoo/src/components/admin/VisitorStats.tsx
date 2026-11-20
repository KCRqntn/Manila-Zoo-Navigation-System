import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Accessibility, Baby, CalendarCheck, ClipboardList, Divide, IdCard, PersonStanding, Repeat, UserPlus, UserRound, Users, UsersRound } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/adminApi";

/**
 * Visitor numbers from saved visits (the Visitor Registration page the website QR code opens).
 *  - Visitor accounts: people who registered (one account each, however often they come)
 *  - Visits: saved visit registrations (an account's 1st, 2nd, 3rd… visit are separate visits)
 *  - Attendance (person-visits): every person on every visit, the visitor + their companions that
 *    day, each counted once per visit (a family of 4 that comes twice is 8). Children, adults and
 *    senior citizens add up to it; PWD overlaps them (a senior who is a PWD is in both numbers but
 *    counted once in the total).
 *  - First-time vs returning visits, companions and average group size come from the same visits.
 * Nothing here comes from page visits, logins or QR scans.
 */
export type VisitorStatsData = {
  total_registrations: number; total_people: number; today_registrations: number; today_people: number;
  accounts: number; returning_accounts: number; visits_without_account: number;
  first_visits: number; return_visits: number; companions: number; avg_group_size: number;
  by_week: { week: string; registrations: number; people: number }[];
  by_month: { month: string; registrations: number; people: number }[];
  by_year: { year: number; registrations: number; people: number }[];
  categories: {
    children: number; adults: number; seniors: number; pwd: number; pwd_children: number; pwd_adults: number; pwd_seniors: number;
    today_children: number; today_adults: number; today_seniors: number; today_pwd: number;
    /** People registered before the form asked for group details (in the totals, without an age category) */
    unclassified: number;
  };
  by_date: { date: string; registrations: number; people: number }[];
  by_sex: { sex: string; registrations: number; people: number }[];
  by_age: { group: string; people: number }[];
};

export const visitorStatsKey = ["/api/admin/visitor-registrations/stats"];

const shortDate = (d: string) => new Date(`${d}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });
const tooltipStyle = { borderRadius: "8px", border: "none", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" };

export function VisitorStats({ panel = "", compact = false }: { panel?: string; compact?: boolean }) {
  const q = useQuery({ queryKey: visitorStatsKey, queryFn: () => api<VisitorStatsData>("/api/admin/visitor-registrations/stats"), refetchInterval: 30_000 });
  const s = q.data, c = s?.categories;
  const main = [
    { title: "Registered visitor accounts", value: s?.accounts, note: `${s?.returning_accounts ?? 0} have visited more than once`, icon: IdCard },
    { title: "Visits (total)", value: s?.total_registrations, note: "Visit transactions: one per saved visit", icon: ClipboardList },
    { title: "Total attendance", value: s?.total_people, note: "People counted: visitors + companions, once per visit", icon: Users },
    { title: "Attendance today", value: s?.today_people, note: `${s?.today_registrations ?? 0} visit${s?.today_registrations === 1 ? "" : "s"} today (Philippine time)`, icon: CalendarCheck },
  ];
  const visits = [
    { title: "First-time visits", value: s?.first_visits, note: "An account's first visit", icon: UserPlus },
    { title: "Returning visits", value: s?.return_visits, note: "2nd, 3rd… visits of registered visitors", icon: Repeat },
    { title: "Companions (total)", value: s?.companions, note: "People who came with a registered visitor", icon: UsersRound },
    { title: "Average group size", value: s?.avg_group_size, note: "People per visit, including the visitor", icon: Divide },
  ];
  const groups = [
    { title: "Children", value: c?.children, note: `Below 18 · ${c?.today_children ?? 0} today`, icon: Baby },
    { title: "Adults", value: c?.adults, note: `18 to 59 · ${c?.today_adults ?? 0} today`, icon: UserRound },
    { title: "Senior citizens", value: c?.seniors, note: `60 and above · ${c?.today_seniors ?? 0} today`, icon: PersonStanding },
    { title: "PWD visitors", value: c?.pwd, note: `${c?.pwd_children ?? 0} children, ${c?.pwd_adults ?? 0} adults, ${c?.pwd_seniors ?? 0} seniors · ${c?.today_pwd ?? 0} today`, icon: Accessibility },
  ];
  const days = (s?.by_date ?? []).slice(compact ? -14 : -30).map(d => ({ ...d, label: shortDate(d.date) }));
  const stat = (x: (typeof main)[number]) => (
    <Card key={x.title} className={panel}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{x.title}</CardTitle>
        <x.icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {q.isLoading ? <Skeleton className="h-7 w-16" /> : <div className="text-2xl font-bold">{(x.value ?? 0).toLocaleString()}</div>}
        <p className="mt-1 text-xs text-muted-foreground">{x.note}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{main.map(stat)}</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{visits.map(stat)}</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{groups.map(stat)}</div>
      <p className={`rounded-lg px-3 py-2 text-xs ${panel ? "bg-black/40 text-white/90" : "bg-muted text-muted-foreground"}`}>
        A registered visitor is one account however often they come; each visit is a new visit transaction, and attendance counts everyone present on it (the visitor + their companions that day). Children + adults + senior citizens = total attendance{c?.unclassified ? ` (plus ${c.unclassified} registered before group details were collected)` : ""}. PWD visitors are also counted in their age group, so they aren't added to the total again.{s?.visits_without_account ? ` ${s.visits_without_account} visit${s.visits_without_account === 1 ? " was" : "s were"} registered before visitor accounts existed.` : ""}
      </p>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className={`lg:col-span-4 ${panel}`}>
          <CardHeader>
            <CardTitle>Daily attendance</CardTitle>
            <CardDescription>Last {compact ? 14 : 30} days · attendance and visits</CardDescription>
          </CardHeader>
          <CardContent className="pl-0">
            {q.isLoading ? <Skeleton className="mx-4 h-[260px]" /> : (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={days} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="people" name="Attendance" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="registrations" name="Visits" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`lg:col-span-3 ${panel}`}>
          <CardHeader>
            <CardTitle>Visitor age distribution</CardTitle>
            <CardDescription>Every visitor in registered groups</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {q.isLoading ? <Skeleton className="h-[220px]" /> : (
              <>
                <div className="h-[170px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={s?.by_age ?? []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="group" tickLine={false} axisLine={false} fontSize={10} interval={0} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="people" name="Visitors" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  {(s?.by_sex ?? []).map(x => (
                    <div key={x.sex} className="rounded-xl bg-muted/60 p-2">
                      <p className="text-xs font-medium uppercase text-muted-foreground">{x.sex === "male" ? "Male" : "Female"} registrants</p>
                      <p className="text-lg font-bold">{x.registrations.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{x.people.toLocaleString()} visitors in their groups</p>
                    </div>
                  ))}
                </div>
              </>
            )}
            {compact && <Link href="/admin/visitor-registrations" className="block text-sm text-primary underline-offset-4 hover:underline">See all registrations →</Link>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {periodChart("Weekly attendance", "Last 12 weeks (from Monday) · attendance and visits",
          (s?.by_week ?? []).map(w => ({ ...w, label: shortDate(w.week) })))}
        {periodChart("Monthly attendance", "Last 12 months · attendance and visits",
          (s?.by_month ?? []).map(m => ({ ...m, label: new Date(`${m.month}-01T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", year: "2-digit", timeZone: "Asia/Manila" }) })))}
      </div>
      {!compact && (
        <Card className={panel}>
          <CardHeader className="pb-2">
            <CardTitle>Yearly attendance</CardTitle>
            <CardDescription>All years with registered visits</CardDescription>
          </CardHeader>
          <CardContent>
            {q.isLoading ? <Skeleton className="h-10" /> : (s?.by_year ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No visits yet.</p> : (
              <div className="flex flex-wrap gap-3">
                {(s?.by_year ?? []).map(y => (
                  <div key={y.year} className="rounded-xl bg-muted/60 px-4 py-2">
                    <p className="text-xs font-medium text-muted-foreground">{y.year}</p>
                    <p className="text-lg font-bold">{y.people.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">attendance · {y.registrations.toLocaleString()} visits</span></p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );

  function periodChart(title: string, description: string, data: { label: string; registrations: number; people: number }[]) {
    return (
      <Card className={panel}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="pl-0">
          {q.isLoading ? <Skeleton className="mx-4 h-[220px]" /> : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar dataKey="people" name="Attendance" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="registrations" name="Visits" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
}
