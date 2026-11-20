import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, CheckCircle2, DatabaseBackup, KeyRound, Layers, Loader2, Lock, ShieldCheck, ShieldAlert, XCircle, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { api, jsonBody, errorMessage, formatDateTime, formatBytes } from "@/lib/adminApi";

/**
 * Backup and Recovery. Flow: loading screen -> compact window -> re-enter your password (unlock) ->
 * choose Full backup / Differential backup / Recovery -> passphrase -> the server runs the job and
 * this page shows its real progress until it has finished (or failed). Backups are encrypted on the
 * server with AES-256-GCM using a key derived from the passphrase; the passphrase is never stored.
 */
type BackupRow = {
  id: number; backup_type: "full" | "differential"; base_backup_id: number | null; reason: string; status: string; created_at: string;
  finished_at: string | null; created_by: string | null; size_bytes: number | null; row_count: number | null; changed_rows: number | null; file_count: number | null; error: string | null;
};
type Job = { status: "running" | "completed" | "failed"; stage: string; percent: number; result?: Record<string, unknown>; error?: string };
type Step = "unlock" | "choose" | "full" | "differential" | "recovery" | "running";

export default function BackupPage() {
  const list = useQuery({ queryKey: ["/api/admin/backup/list"], queryFn: () => api<{ backups: BackupRow[]; storage: { location: string; folder_name: string } }>("/api/admin/backup/list") });

  // 1. Loading screen while the backup interface initialises
  if (list.isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <DatabaseBackup className="h-12 w-12 animate-pulse text-primary" />
        <p className="font-semibold">Preparing Backup & Recovery…</p>
        <p className="text-sm text-muted-foreground">Loading the backup catalogue</p>
      </div>
    );
  }
  if (list.isError) return <p className="rounded-xl bg-destructive/10 p-4 text-destructive">{errorMessage(list.error)}</p>;
  return (
    <div className="space-y-8">
      <MiniGui backups={list.data!.backups} />
      <Catalogue backups={list.data!.backups} storage={list.data!.storage} />
    </div>
  );
}

function MiniGui({ backups }: { backups: BackupRow[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("unlock");
  const [session, setSession] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [passphrase2, setPassphrase2] = useState("");
  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [jobKind, setJobKind] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);

  const completed = backups.filter(b => b.status === "completed");
  const lastFull = completed.find(b => b.backup_type === "full");
  const headers = session ? { "X-Backup-Session": session } : undefined;

  // Poll the running job: progress is the server's, so nothing shows "done" before it is
  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    const tick = async () => {
      try {
        const j = await api<Job>(`/api/admin/backup/jobs/${jobId}`);
        if (stop) return;
        setJob(j);
        if (j.status === "running") setTimeout(tick, 800);
        else qc.invalidateQueries({ queryKey: ["/api/admin/backup/list"] });
      } catch (err) {
        if (!stop) setJob({ status: "failed", stage: "Lost contact with the server", percent: 0, error: errorMessage(err) });
      }
    };
    void tick();
    return () => { stop = true; };
  }, [jobId, qc]);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ session: string }>("/api/admin/backup/unlock", jsonBody("POST", { password }));
      setSession(r.session);
      setPassword("");
      setStep("choose");
    } catch (err) {
      setError(errorMessage(err));
    } finally { setBusy(false); }
  };

  const start = async (kind: "full" | "differential" | "restore") => {
    setBusy(true); setError(null);
    try {
      const r = kind === "restore"
        ? await api<{ job: string }>(`/api/admin/backup/${target}/restore`, { ...jsonBody("POST", { passphrase, confirm: "RESTORE" }), headers: { "Content-Type": "application/json", ...headers } })
        : await api<{ job: string }>("/api/admin/backup/create", { ...jsonBody("POST", { type: kind, passphrase }), headers: { "Content-Type": "application/json", ...headers } });
      setJobKind(kind);
      setJob({ status: "running", stage: "Starting", percent: 0 });
      setJobId(r.job);
      setStep("running");
      setPassphrase(""); setPassphrase2("");
    } catch (err) {
      const msg = errorMessage(err);
      if ((err as { data?: { code?: string } }).data?.code === "backup_locked") { setSession(null); setStep("unlock"); toast({ title: "Unlock again", description: "Your backup session ended." }); }
      setError(msg);
    } finally { setBusy(false); }
  };

  const reset = () => { setStep("choose"); setJobId(null); setJob(null); setError(null); setTarget(""); };
  const back = <Button type="button" variant="ghost" size="sm" onClick={reset} className="-ml-2"><ChevronLeft className="mr-1 h-4 w-4" /> Back</Button>;
  const passphraseFields = (confirmToo: boolean) => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="bk-pass">Backup passphrase</Label>
        <Input id="bk-pass" type="password" autoComplete="new-password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="At least 12 characters" />
      </div>
      {confirmToo && (
        <div className="space-y-1.5">
          <Label htmlFor="bk-pass2">Repeat the passphrase</Label>
          <Input id="bk-pass2" type="password" autoComplete="new-password" value={passphrase2} onChange={e => setPassphrase2(e.target.value)} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">The passphrase encrypts the backup. It is never stored: <b>without it the backup can't be restored</b>. Keep it somewhere safe, separate from the backups.</p>
    </div>
  );
  const passOk = passphrase.length >= 12;

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-lg border-primary/30 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Backup & Recovery</CardTitle>
          <CardDescription>Encrypted full and differential backups of the zoo database and uploaded photos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "unlock" && (
            <form onSubmit={unlock} className="space-y-3">
              <p className="flex items-center gap-2 text-sm"><Lock className="h-4 w-4 text-primary" /> Confirm it's you before using backups.</p>
              <div className="space-y-1.5">
                <Label htmlFor="bk-pw">Your account password</Label>
                <Input id="bk-pw" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !password}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />} Unlock (15 minutes)</Button>
            </form>
          )}

          {step === "choose" && (
            <div className="grid gap-2">
              <OptionButton icon={DatabaseBackup} title="Full backup" text="Everything: all zoo data and uploaded photos, at this moment." onClick={() => setStep("full")} />
              <OptionButton icon={Layers} title="Differential backup" disabled={!lastFull}
                text={lastFull ? `Only what changed since full backup #${lastFull.id} (${formatDateTime(lastFull.created_at)}). Smaller and faster.` : "Needs a full backup first."}
                onClick={() => setStep("differential")} />
              <OptionButton icon={ArchiveRestore} title="Recovery" disabled={completed.length === 0}
                text={completed.length ? "Restore the data from a backup. A safety backup of the current data is made first." : "No completed backups yet."}
                onClick={() => setStep("recovery")} />
            </div>
          )}

          {(step === "full" || step === "differential") && (
            <div className="space-y-4">
              {back}
              <p className="text-sm">{step === "full"
                ? "Copies every table in the zoo database and every uploaded photo, then encrypts the file and checks that it opens."
                : `Compares the current data with full backup #${lastFull?.id} and stores only new, changed and deleted records and photos. Use the same passphrase as that full backup.`}</p>
              {passphraseFields(step === "full")}
              <Button className="w-full" disabled={busy || !passOk || (step === "full" && passphrase !== passphrase2)} onClick={() => start(step)}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Start {step} backup
              </Button>
              {step === "full" && passphrase2 && passphrase !== passphrase2 && <p className="text-xs text-destructive">The passphrases don't match.</p>}
            </div>
          )}

          {step === "recovery" && (
            <div className="space-y-4">
              {back}
              <div className="space-y-1.5">
                <Label htmlFor="bk-target">Backup to restore</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger id="bk-target"><SelectValue placeholder="Choose a backup…" /></SelectTrigger>
                  <SelectContent>
                    {completed.map(b => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        #{b.id} · {b.backup_type === "full" ? "Full" : `Differential (on #${b.base_backup_id})`} · {formatDateTime(b.created_at)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">A differential restores its full backup plus the changes; both files must be present.</p>
              </div>
              {target && <ChainCheck id={Number(target)} />}
              {passphraseFields(false)}
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                Recovery replaces the current zoo data with the backup's. Changes made after the backup will be undone (they stay in the safety backup).
                The audit log and the backup catalogue are never rolled back. Accounts and logins aren't affected.
              </div>
              <Button variant="destructive" className="w-full" disabled={busy || !target || !passOk} onClick={() => setConfirmRestore(true)}>Restore…</Button>
              <ConfirmDialog open={confirmRestore} onOpenChange={setConfirmRestore} destructive typeToConfirm="RESTORE" confirmLabel="Restore now"
                title={`Restore backup #${target}?`}
                description={<><p>The backup's integrity is checked first, then a safety full backup of the current data is made, then the data is replaced in one step and verified.</p><p>If anything fails, nothing is changed.</p></>}
                onConfirm={() => { setConfirmRestore(false); void start("restore"); }} />
            </div>
          )}

          {step === "running" && job && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-medium">
                {job.status === "running" ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : job.status === "completed" ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-destructive" />}
                {job.status === "running" ? (jobKind === "restore" ? "Restoring…" : "Backing up…") : job.status === "completed" ? (jobKind === "restore" ? "Restore complete" : "Backup complete") : (jobKind === "restore" ? "Restore failed" : "Backup failed")}
              </div>
              <Progress value={job.percent} aria-label="Progress" />
              <p className="text-sm text-muted-foreground">{job.stage} ({job.percent}%)</p>
              {job.status === "completed" && job.result && (
                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950/40 dark:text-green-100">
                  {jobKind === "restore"
                    ? <>Restored {String(job.result["rows"])} records ({String(job.result["files_restored"])} photos put back). Safety backup: #{String(job.result["safety_backup"])}.</>
                    : <>Backup #{String(job.result["id"])} saved, encrypted and verified: {formatBytes(Number(job.result["size_bytes"]))}, {String(job.result["changed_rows"])} records, {String(job.result["file_count"])} photos.</>}
                </div>
              )}
              {job.status === "failed" && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{job.error}</p>}
              {job.status !== "running" && <Button variant="outline" className="w-full" onClick={reset}>Done</Button>}
            </div>
          )}

          {error && step !== "running" && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {session && step !== "unlock" && <p className="text-center text-xs text-muted-foreground">Unlocked for 15 minutes on this page only.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function OptionButton({ icon: Icon, title, text, onClick, disabled }: { icon: typeof DatabaseBackup; title: string; text: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <span><span className="block font-medium">{title}</span><span className="text-sm text-muted-foreground">{text}</span></span>
    </button>
  );
}

/** Integrity check of a backup and its full backup (SHA-256), before restoring. */
function ChainCheck({ id }: { id: number }) {
  const q = useQuery({ queryKey: ["/api/admin/backup/verify", id], queryFn: () => api<{ ok: boolean; error?: string; chain?: { id: number; type: string }[] }>(`/api/admin/backup/${id}/verify`) });
  if (q.isLoading) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Checking integrity…</p>;
  if (q.data?.ok) return <p className="flex items-center gap-2 text-xs text-green-700"><ShieldCheck className="h-4 w-4" /> Integrity OK: {q.data.chain!.map(c => `#${c.id} (${c.type})`).join(" + ")}</p>;
  return <p className="flex items-center gap-2 text-xs text-destructive"><ShieldAlert className="h-4 w-4" /> {q.data?.error ?? errorMessage(q.error)}</p>;
}

function Catalogue({ backups, storage }: { backups: BackupRow[]; storage: { location: string; folder_name: string } }) {
  const [checking, setChecking] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, string>>({});
  const verify = async (id: number) => {
    setChecking(id);
    try {
      const r = await api<{ ok: boolean; error?: string }>(`/api/admin/backup/${id}/verify`);
      setResults(prev => ({ ...prev, [id]: r.ok ? "Integrity OK" : r.error ?? "Failed" }));
    } finally { setChecking(null); }
  };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold">Backup catalogue</h2>
        <p className="text-xs text-muted-foreground">Stored encrypted in a private folder on the server ({storage.folder_name}); not reachable from the website.</p>
      </div>
      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>#</TableHead><TableHead>Type</TableHead><TableHead>Created</TableHead><TableHead>By</TableHead><TableHead>Size</TableHead><TableHead>Records</TableHead><TableHead>Status</TableHead><TableHead>Integrity</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {backups.length === 0 ? <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No backups yet. Start with a full backup.</TableCell></TableRow> : backups.map(b => (
              <TableRow key={b.id}>
                <TableCell>{b.id}</TableCell>
                <TableCell>{b.backup_type === "full" ? "Full" : <>Differential<br /><span className="text-xs text-muted-foreground">on full #{b.base_backup_id}</span></>}{b.reason !== "manual" && <><br /><span className="text-xs text-muted-foreground">{b.reason}</span></>}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{formatDateTime(b.created_at)}</TableCell>
                <TableCell className="max-w-[10rem] truncate text-xs">{b.created_by ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{formatBytes(b.size_bytes)}</TableCell>
                <TableCell className="text-xs">{b.backup_type === "full" ? `${b.row_count ?? "—"} rows, ${b.file_count ?? 0} photos` : `${b.changed_rows ?? "—"} changes, ${b.file_count ?? 0} photos`}</TableCell>
                <TableCell>
                  <Badge className={b.status === "completed" ? "bg-green-600 text-white" : b.status === "failed" ? "bg-destructive text-white" : "bg-amber-500 text-white"}>{b.status}</Badge>
                  {b.error && <p className="mt-1 max-w-[14rem] text-xs text-destructive">{b.error}</p>}
                </TableCell>
                <TableCell>
                  {b.status === "completed" && (results[b.id]
                    ? <span className={`text-xs ${results[b.id] === "Integrity OK" ? "text-green-700" : "text-destructive"}`}>{results[b.id]}</span>
                    : <Button size="sm" variant="outline" disabled={checking === b.id} onClick={() => verify(b.id)}>{checking === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Check"}</Button>)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>
    </section>
  );
}
