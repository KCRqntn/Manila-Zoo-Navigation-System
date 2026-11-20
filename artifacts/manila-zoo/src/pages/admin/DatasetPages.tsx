import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Info } from "lucide-react";
import { useListMapPins } from "@workspace/api-client-react";
import { DatasetManager, cell } from "@/components/admin/DatasetManager";
import { api, formatDateTime } from "@/lib/adminApi";

/** Admin pages for the managed datasets, each a DatasetManager with its own columns. */

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>{children}</div>
    </div>
  );
}

export function ZooUpdatesAdmin() {
  return (
    <DatasetManager
      dataset="zoo_updates"
      intro={<Note>Official Manila Zoo updates shown on the visitor home page once <b>published</b>. Only post information confirmed by the zoo.</Note>}
      columns={[
        { key: "title", label: "Title", render: r => <span className="font-medium">{String(r["title"])}</span> },
        { key: "category", label: "Category", render: r => <span className="capitalize">{String(r["category"])}</span> },
        { key: "published_at", label: "Published", render: cell.date("published_at") },
        { key: "updated_at", label: "Last updated", render: r => <span className="whitespace-nowrap text-xs">{formatDateTime(r["updated_at"])}<br />{String(r["updated_by"] ?? "")}</span> },
      ]}
    />
  );
}

export function TicketPricesAdmin() {
  const history = useQuery({
    queryKey: ["/api/admin/ticket-prices/history"],
    queryFn: () => api<{ id: number; changed_at: string; changed_by: string | null; change_type: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }[]>("/api/admin/ticket-prices/history"),
  });
  return (
    <div className="space-y-6">
      <DatasetManager
        dataset="ticket_prices"
        intro={<Note>
          The website and the chatbot show only prices that are <b>verified</b> (with a source and the date checked) and <b>published</b>, and in effect today.
          A price can't be published until it is verified. If no price is verified, visitors are told to confirm prices with the zoo. Never enter a price that hasn't been confirmed.
        </Note>}
        columns={[
          { key: "category", label: "Ticket category", render: r => <span className="font-medium">{String(r["category"])}</span> },
          { key: "visitor_type", label: "Visitor type" },
          { key: "price", label: "Price", render: r => r["is_free"] ? "Free" : r["price"] == null ? "—" : `₱${Number(r["price"]).toLocaleString("en-PH")}` },
          { key: "effective_date", label: "Effective", render: r => `${r["effective_date"] ?? "—"}${r["valid_until"] ? ` to ${r["valid_until"]}` : ""}` },
          { key: "is_verified", label: "Verification", render: cell.verified },
        ]}
      />
      <section>
        <h2 className="mb-2 text-lg font-semibold">Price change history</h2>
        <div className="max-h-80 overflow-y-auto rounded-xl border bg-card text-sm">
          {(history.data ?? []).length === 0 ? <p className="p-4 text-muted-foreground">No changes yet.</p> : (
            <ul className="divide-y">
              {history.data!.map(h => {
                const name = String((h.after ?? h.before)?.["category"] ?? "Ticket");
                const priceOf = (x: Record<string, unknown> | null) => (x ? (x["is_free"] ? "Free" : x["price"] == null ? "—" : `₱${Number(x["price"])}`) : "—");
                return (
                  <li key={h.id} className="flex flex-wrap justify-between gap-2 p-3">
                    <span><b className="capitalize">{h.change_type.replace("status:", "status → ")}</b> · {name} ({String((h.after ?? h.before)?.["visitor_type"] ?? "")}) · {priceOf(h.before)} → {priceOf(h.after)}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(h.changed_at)} · {h.changed_by ?? "—"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export function AnnouncementsAdmin() {
  return (
    <DatasetManager
      dataset="announcements"
      intro={<Note>
        Active announcements appear at the top of the visitor home page, most urgent first; <b>urgent</b> ones show as a banner.
        Leave <i>Publish on</i> empty to show right away. Announcements disappear after <i>Expires on</i> and are archived automatically (see <Link href="/admin/settings" className="underline">System Settings</Link>).
      </Note>}
      columns={[
        { key: "title", label: "Title", render: r => <span className="font-medium">{String(r["title"])}</span> },
        { key: "priority", label: "Priority", render: r => <span className={`capitalize ${r["priority"] === "urgent" ? "font-semibold text-destructive" : r["priority"] === "high" ? "font-medium text-orange-600" : ""}`}>{String(r["priority"])}</span> },
        { key: "type", label: "Type", render: r => <span className="capitalize">{String(r["type"] ?? "info")}</span> },
        { key: "publish_at", label: "Publish on", render: r => r["publish_at"] ? formatDateTime(r["publish_at"]) : "Right away" },
        { key: "expires_at", label: "Expires", render: r => r["expires_at"] ? formatDateTime(r["expires_at"]) : "Never" },
      ]}
    />
  );
}

export function EventsAdmin() {
  const { data: pins } = useListMapPins();
  const pinOptions = (Array.isArray(pins) ? pins : []).map(p => ({ id: p.id, name: p.name }));
  const pinName = (id: unknown) => pinOptions.find(p => p.id === Number(id))?.name;
  return (
    <DatasetManager
      dataset="events"
      pinOptions={pinOptions}
      intro={<Note>
        Published events appear on the Events page and the AI Guide; choose a <b>Map place</b> to show the event in that place's details on the map.
        Cancelled events stay visible, marked as cancelled. Only add events confirmed by the zoo.
      </Note>}
      columns={[
        { key: "title", label: "Title", render: r => <span className="font-medium">{String(r["title"])}</span> },
        { key: "start_date", label: "When", render: r => <span className="whitespace-nowrap">{formatDateTime(r["start_date"])}{r["end_date"] ? <><br /><span className="text-xs text-muted-foreground">to {formatDateTime(r["end_date"])}</span></> : null}</span> },
        { key: "pin_id", label: "Where", render: r => pinName(r["pin_id"]) ?? String(r["location"] ?? "—") },
        { key: "publish_at", label: "Publish on", render: r => r["publish_at"] ? formatDateTime(r["publish_at"]) : "Right away" },
      ]}
    />
  );
}
