import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  useListQrCodes, 
  useGenerateQrCode, 
  useDeleteQrCode,
  useSearchAnimals,
  useListMapPins,
  customFetch,
  getListQrCodesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Loader2, QrCode as QrIcon, Download, MapPin, Printer, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { publicSiteBase, scanLink, qrDataUrl, labelledQrPng } from "@/lib/qrLinks";
import { useToast } from "@/hooks/use-toast";
import { QrPointsCell } from "@/components/admin/QrPointsCell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type QrRow = { id: number; code: string; is_active?: boolean | null; animal_name?: string | null; location_name?: string | null };
const qrTitle = (qr: QrRow) => qr.animal_name ?? qr.location_name ?? qr.code;

/** Small preview of a code; the image holds the full scan link */
function QrThumb({ link }: { link: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { qrDataUrl(link, 160).then(setSrc, () => setSrc(null)); }, [link]);
  return src ? <img src={src} alt="QR Code" className="w-full h-full object-contain" /> : null;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export default function AdminQrCodes() {
  const { data: qrcodes, isLoading } = useListQrCodes();
  const { data: animals } = useSearchAnimals();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Codes hold a link to the public website, so phones' own camera apps open them too
  const settings = useQuery({ queryKey: ["/api/settings/public"], queryFn: () => customFetch<{ public_site_url: string }>("/api/settings/public") });
  const siteBase = publicSiteBase(settings.data?.public_site_url);
  const linkFor = (code: string) => (siteBase ? scanLink(siteBase, code) : code);

  const downloadQr = async (qr: QrRow) => {
    const a = document.createElement("a");
    a.href = await labelledQrPng(linkFor(qr.code), qrTitle(qr), qr.code);
    a.download = `qr-${qrTitle(qr).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${qr.code}.png`;
    a.click();
  };

  // A printable sheet of every active code, three across on A4
  const printAll = async () => {
    const list = ((qrcodes ?? []) as QrRow[]).filter(q => q.is_active !== false);
    const w = window.open("", "_blank");
    if (!w) { toast({ title: "Allow pop-ups to print the QR codes", variant: "destructive" }); return; }
    const cards = await Promise.all(list.map(async q => `<div class="card"><img src="${await qrDataUrl(linkFor(q.code), 600)}" alt=""><b>${escapeHtml(qrTitle(q))}</b><span>${escapeHtml(q.code)}</span></div>`));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Manila Zoo QR codes</title><style>
      @page { size: A4; margin: 10mm; } body { margin: 0; font-family: Arial, sans-serif; color: #1b4332; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
      .card { break-inside: avoid; border: 1.5px solid #2d6a4f; border-radius: 10px; padding: 4mm; text-align: center; display: flex; flex-direction: column; align-items: center; }
      .card img { width: 52mm; height: 52mm; } .card b { font-size: 14px; margin-top: 2mm; } .card span { font-size: 10px; color: #555; margin-top: 1mm; }
      .card::after { content: "Scan with your phone camera"; font-size: 10px; color: #2d6a4f; margin-top: 1mm; }
    </style></head><body><div class="grid">${cards.join("")}</div><script>window.onload = () => setTimeout(() => window.print(), 300);<\/script></body></html>`);
    w.document.close();
  };

  const generateQr = useGenerateQrCode();
  const deleteQr = useDeleteQrCode();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>("");

  // Location codes: posted at a place (restroom, gate, info desk…) so scanning one tells the map
  // exactly where the visitor is. They use the place's saved map coordinates.
  const { data: pinsData } = useListMapPins();
  const pins = (Array.isArray(pinsData) ? pinsData : []).filter(p => p.is_active).sort((a, b) => a.name.localeCompare(b.name));
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [selectedPinId, setSelectedPinId] = useState<string>("");
  const [creatingLocation, setCreatingLocation] = useState(false);

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPinId) return;
    setCreatingLocation(true);
    try {
      await customFetch("/api/qr/location", { method: "POST", body: JSON.stringify({ map_pin_id: Number(selectedPinId) }) });
      toast({ title: "Location QR code generated" });
      queryClient.invalidateQueries({ queryKey: getListQrCodesQueryKey() });
      setIsLocationOpen(false);
      setSelectedPinId("");
    } catch {
      toast({ title: "Failed to generate the location QR code", variant: "destructive" });
    } finally {
      setCreatingLocation(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnimalId) return;

    try {
      await generateQr.mutateAsync({
        data: {
          animal_id: parseInt(selectedAnimalId)
        }
      });
      toast({ title: "QR Code generated successfully" });
      queryClient.invalidateQueries({ queryKey: getListQrCodesQueryKey() });
      setIsCreateOpen(false);
      setSelectedAnimalId("");
    } catch (error) {
      toast({ title: "Failed to generate QR Code", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this QR code?")) return;
    try {
      await deleteQr.mutateAsync({ id });
      toast({ title: "QR Code deleted" });
      queryClient.invalidateQueries({ queryKey: getListQrCodesQueryKey() });
    } catch (error) {
      toast({ title: "Failed to delete QR code", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">QR Code Management</h1>
        <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={printAll} disabled={!siteBase || !qrcodes?.length}><Printer className="w-4 h-4 mr-2" /> Print all</Button>
        <Dialog open={isLocationOpen} onOpenChange={setIsLocationOpen}>
          <DialogTrigger asChild>
            <Button variant="outline"><MapPin className="w-4 h-4 mr-2" /> Location QR Code</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate a Location QR Code</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateLocation} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Post this code at the place itself. When a visitor scans it, the map sets their position to this
                place's saved coordinates, so check the pin is in the right spot in Map Editor first.
              </p>
              <div className="space-y-2">
                <Label htmlFor="pin">Place</Label>
                <Select value={selectedPinId} onValueChange={setSelectedPinId}>
                  <SelectTrigger id="pin"><SelectValue placeholder="Select a place on the map" /></SelectTrigger>
                  <SelectContent>
                    {pins.map(pin => (
                      <SelectItem key={pin.id} value={pin.id.toString()}>{pin.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" type="button">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={creatingLocation || !selectedPinId}>
                  {creatingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Generate QR Code</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate New QR Code</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="animal">Target Animal</Label>
                <Select value={selectedAnimalId} onValueChange={setSelectedAnimalId}>
                  <SelectTrigger><SelectValue placeholder="Select an animal" /></SelectTrigger>
                  <SelectContent>
                    {animals?.map(animal => (
                      <SelectItem key={animal.id} value={animal.id.toString()}>
                        {animal.name} ({animal.scientific_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" type="button">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={generateQr.isPending || !selectedAnimalId}>
                  {generateQr.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {settings.isSuccess && !siteBase ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>Set the website's public address in <Link href="/admin/qr-access" className="font-semibold underline">QR Code Access</Link> first.
            Until then these codes only work in the website's own scanner, not in phone camera apps.</p>
        </div>
      ) : siteBase && (
        <p className="text-sm text-muted-foreground">
          Each code opens <span className="font-mono text-xs">{siteBase}/q/…</span>, so visitors can scan it with the
          iPhone or Android camera app or with the website's scanner. If the public address changes, print the codes again.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>QR Codes Directory</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Preview</TableHead>
                    <TableHead>Code String</TableHead>
                    <TableHead>Animal / Place</TableHead>
                    <TableHead>Scan Count</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qrcodes?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No QR codes generated yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    qrcodes?.map((qr) => (
                      <TableRow key={qr.id}>
                        <TableCell>
                          <div className="w-12 h-12 bg-white p-1 rounded border">
                            <QrThumb link={linkFor(qr.code)} />
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{qr.code}</TableCell>
                        <TableCell className="font-medium">
                          {qr.animal_name ?? ((qr as { location_name?: string | null }).location_name
                            ? <span className="flex items-center"><MapPin className="mr-1 h-3.5 w-3.5 text-primary" />{(qr as { location_name?: string | null }).location_name}</span>
                            : "—")}
                        </TableCell>
                        <TableCell>{qr.scan_count || 0}</TableCell>
                        <TableCell><QrPointsCell qr={qr as { id: number; points?: number | null; points_once?: boolean | null }} /></TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs ${qr.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {qr.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 mr-2" onClick={() => downloadQr(qr as QrRow)} aria-label="Download QR code">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(qr.id)}
                            disabled={deleteQr.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
