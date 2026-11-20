import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { api, jsonBody, errorMessage, useStaff } from "@/lib/adminApi";

/** Settings administrators can change without editing code (validated on the server). */
type Setting = { key: string; label: string; help: string; value: unknown; default: unknown };

export default function SystemSettings() {
  const staff = useStaff();
  const q = useQuery({ queryKey: ["/api/admin/settings"], queryFn: () => api<Setting[]>("/api/admin/settings") });
  if (q.isLoading) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-primary" />;
  if (q.isError) return <p className="text-destructive">{errorMessage(q.error)}</p>;
  return (
    <div className="max-w-2xl space-y-4">
      {!staff.can("settings.manage") && <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">Only administrators can change these settings. (Editors can change the website address on the QR Code Access page.)</p>}
      {q.data!.map(s => <SettingCard key={s.key} setting={s} canEdit={s.key === "public_site_url" ? staff.can("qr.write") : staff.can("settings.manage")} />)}
    </div>
  );
}

function SettingCard({ setting, canEdit }: { setting: Setting; canEdit: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [value, setValue] = useState<unknown>(setting.value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setValue(setting.value); }, [setting.value]);
  const changed = JSON.stringify(value) !== JSON.stringify(setting.value);
  const save = async () => {
    setSaving(true);
    try {
      const v = typeof setting.default === "number" ? Number(value) : typeof setting.default === "string" ? String(value).trim() : value;
      await api(`/api/admin/settings/${setting.key}`, jsonBody("PUT", { value: v }));
      await qc.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      qc.invalidateQueries({ queryKey: ["/api/settings/public"] });
      toast({ title: "Setting saved" });
    } catch (err) {
      toast({ title: "Not saved", description: errorMessage(err), variant: "destructive" });
    } finally { setSaving(false); }
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{setting.label}</CardTitle>
        <CardDescription>{setting.help}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        {typeof setting.default === "boolean" ? (
          <div className="flex items-center gap-2">
            <Switch id={`set-${setting.key}`} checked={!!value} onCheckedChange={setValue} disabled={!canEdit} />
            <Label htmlFor={`set-${setting.key}`}>{value ? "On" : "Off"}</Label>
          </div>
        ) : (
          <Input id={`set-${setting.key}`} aria-label={setting.label} className="max-w-md flex-1" disabled={!canEdit}
            type={typeof setting.default === "number" ? "number" : "text"} value={String(value ?? "")} onChange={e => setValue(e.target.value)} />
        )}
        {canEdit && <Button onClick={save} disabled={!changed || saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save</Button>}
      </CardContent>
    </Card>
  );
}
