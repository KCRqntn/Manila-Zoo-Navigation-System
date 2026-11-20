import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { registrationQrDataUrl, registrationLink } from "@/lib/qrLinks";
import { Download, Loader2, Printer, Save, Smartphone, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api, jsonBody, errorMessage, useStaff } from "@/lib/adminApi";
import { QrPosterPreview, QrPosterPrint } from "@/components/admin/QrPoster";

/**
 * QR Code Access: one QR code that opens the visitor registration form on the visitor website (visitors
 * are counted when they register). The address is a setting (so it can follow the deployment) and
 * must be a public https:// address, never localhost.
 */
const isLocalHost = (host: string) => /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);

export default function QrAccess() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const staff = useStaff();
  const settings = useQuery({ queryKey: ["/api/settings/public"], queryFn: () => api<{ public_site_url: string }>("/api/settings/public") });
  const saved = settings.data?.public_site_url ?? "";
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => { setDraft(saved); }, [saved]);

  // The address this page is open on, offered when it's already a public one (e.g. the tunnel link)
  const here = window.location.origin;
  const hereIsPublic = window.location.protocol === "https:" && !isLocalHost(window.location.hostname);

  // What the QR code opens: the registration form on the saved address
  const target = saved ? registrationLink(saved) : "";
  useEffect(() => {
    if (!target) { setQr(null); return; }
    registrationQrDataUrl(target, 1024).then(setQr, () => setQr(null));
  }, [target]);

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/admin/settings/public_site_url", jsonBody("PUT", { value: draft.trim().replace(/\/+$/, "") }));
      await qc.invalidateQueries({ queryKey: ["/api/settings/public"] });
      toast({ title: "Website address saved", description: "The QR code now opens this address." });
    } catch (err) {
      toast({ title: "Not saved", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // The same QR code (same link, same settings) drawn at 2048 px for sharp printing; white background
  const download = async () => {
    if (!target) return;
    try {
      const a = document.createElement("a");
      a.href = await registrationQrDataUrl(target, 2048);
      a.download = "manila-zoo-visitor-registration-qr.png";
      a.click();
    } catch (err) {
      toast({ title: "Download failed", description: errorMessage(err), variant: "destructive" });
    }
  };

  // Prints only the poster (see QrPosterPrint): the rest of the admin page is hidden by print CSS
  const print = () => { if (qr) window.print(); };

  const canEdit = staff.can("qr.write");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" /> Visitor website address</CardTitle>
          <CardDescription>The QR code opens this address. Change it whenever the website moves (for example, a new tunnel link or a permanent domain).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="site-url">Public website address</Label>
            <Input id="site-url" value={draft} onChange={e => setDraft(e.target.value)} placeholder="https://your-zoo-site.example" disabled={!canEdit} />
            <p className="text-xs text-muted-foreground">Must start with https:// and be reachable from visitors' phones. Local addresses (localhost, 192.168…) are refused.</p>
          </div>
          {canEdit && hereIsPublic && here !== saved && (
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft(here)}>Use the address this page is open on ({here})</Button>
          )}
          {canEdit && (
            <Button onClick={save} disabled={saving || draft.trim() === saved}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save address
            </Button>
          )}
          <div className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">How visitors use it</p>
            <p>Print the QR code and post it at the entrance. Scanning it opens the Visitor Registration form; once a visitor's registration is saved, their group is counted in the dashboard and they continue to the website. Visitors don't need an account or password. The admin dashboard always needs an admin login: having the QR code never gives admin access.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>QR code preview</CardTitle>
          <CardDescription>{target ? <>Opens the registration form: <span className="break-all">{target}</span></> : "Set the website address first."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {settings.isLoading ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : qr ? (
            <>
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="lg" onClick={print}><Printer className="mr-2 h-4 w-4" /> Print QR Code</Button>
                <Button size="lg" variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" /> Download PNG</Button>
              </div>
              <QrPosterPreview qr={qr} target={target} />
              <p className="text-center text-xs text-muted-foreground">Printed preview on A4 portrait. Download PNG saves the QR code alone (2048 × 2048 px, white background).</p>
              <QrPosterPrint qr={qr} target={target} />
              {saved.includes("trycloudflare.com") && (
                <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <TriangleAlert className="h-4 w-4 shrink-0" />
                  This is a temporary tunnel link; it changes every time the tunnel restarts. Reprint the QR code after updating the address, or use a permanent domain.
                </p>
              )}
            </>
          ) : <p className="py-16 text-sm text-muted-foreground">No QR code yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
