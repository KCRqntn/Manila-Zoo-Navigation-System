import React, { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage } from "@/lib/adminApi";

/**
 * Contact form on the Help page: a question for the zoo, or a group / school visit inquiry.
 * Collects only what the zoo needs to reply (name, and an email or a phone number). Staff see
 * submissions in Admin → Form Submissions.
 */
export function InquiryForm({ fil }: { fil: boolean }) {
  const [form, setForm] = useState({ form_type: "inquiry", name: "", email: "", phone: "", subject: "", message: "", visit_date: "", group_size: "", website: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim() && !form.phone.trim()) { setError(fil ? "Ilagay ang email o numero ng telepono para makasagot ang zoo." : "Enter an email address or a phone number so the zoo can reply."); return; }
    setSending(true); setError(null);
    try {
      await customFetch("/api/forms/inquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally { setSending(false); }
  };

  if (sent) {
    return (
      <div className="rounded-3xl border bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-600" />
        <p className="text-lg font-semibold">{fil ? "Natanggap ang iyong mensahe" : "Your message was received"}</p>
        <p className="mt-1 text-sm text-muted-foreground">{fil ? "Sasagot ang Manila Zoo sa email o numerong ibinigay mo." : "Manila Zoo will reply to the email or number you gave."}</p>
        <Button variant="outline" className="mt-4" onClick={() => { setSent(false); setForm(f => ({ ...f, subject: "", message: "" })); }}>{fil ? "Magpadala ng isa pa" : "Send another"}</Button>
      </div>
    );
  }

  const group = form.form_type === "group_visit";
  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border bg-card p-5 shadow-sm sm:p-6" noValidate>
      <p className="text-sm text-muted-foreground">
        {fil ? "May tanong o balak bumisita kasama ang grupo o paaralan? Magpadala ng mensahe sa Manila Zoo. Para sa emergency, tumawag sa zoo security: +63 2 8525-7275."
             : "Have a question, or planning a group or school visit? Send Manila Zoo a message. For emergencies, call zoo security: +63 2 8525-7275."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="iq-type">{fil ? "Uri ng mensahe" : "Message type"}</Label>
          <Select value={form.form_type} onValueChange={v => setForm(f => ({ ...f, form_type: v }))}>
            <SelectTrigger id="iq-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inquiry">{fil ? "Tanong o mensahe" : "Question or message"}</SelectItem>
              <SelectItem value="group_visit">{fil ? "Pagbisita ng grupo / paaralan" : "Group / school visit inquiry"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="iq-name">{fil ? "Pangalan *" : "Name *"}</Label>
          <Input id="iq-name" value={form.name} onChange={set("name")} required maxLength={120} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="iq-email">Email</Label>
          <Input id="iq-email" type="email" value={form.email} onChange={set("email")} maxLength={200} autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="iq-phone">{fil ? "Telepono" : "Phone"}</Label>
          <Input id="iq-phone" type="tel" value={form.phone} onChange={set("phone")} maxLength={40} autoComplete="tel" placeholder="09…" />
        </div>
        {group && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="iq-date">{fil ? "Petsa ng pagbisita" : "Planned visit date"}</Label>
              <Input id="iq-date" type="date" min={today} value={form.visit_date} onChange={set("visit_date")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iq-size">{fil ? "Bilang ng tao" : "Group size"}</Label>
              <Input id="iq-size" type="number" min={1} max={1000} value={form.group_size} onChange={set("group_size")} />
            </div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="iq-subject">{fil ? "Paksa" : "Subject"}</Label>
          <Input id="iq-subject" value={form.subject} onChange={set("subject")} maxLength={200} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="iq-msg">{fil ? "Mensahe *" : "Message *"}</Label>
          <Textarea id="iq-msg" rows={5} value={form.message} onChange={set("message")} required maxLength={2000} />
        </div>
        {/* Hidden from people; bots that fill it are ignored */}
        <input type="text" name="website" value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      </div>
      <p className="text-xs text-muted-foreground">
        {fil ? "Gagamitin lamang ang iyong pangalan at contact para sagutin ang mensaheng ito; mga awtorisadong tauhan ng zoo lang ang makakakita nito."
             : "Your name and contact details are used only to reply to this message and are seen only by authorized zoo staff."}
      </p>
      {group && (
        <p className="text-xs text-muted-foreground">
          {fil ? "Paalala: hindi ito reservation. Kukumpirmahin ng zoo ang mga detalye at bayad." : "Note: this is an inquiry, not a reservation. The zoo will confirm details and payment."}
        </p>
      )}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={sending} className="w-full sm:w-auto">
        {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} {fil ? "Ipadala" : "Send"}
      </Button>
    </form>
  );
}
