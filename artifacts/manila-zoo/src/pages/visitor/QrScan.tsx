import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { QrScannerPanel } from "@/components/QrScannerPanel";
import { Stickers } from "@/components/fun/Stickers";
import { useAppCtx } from "@/contexts/AppContext";
import { BackButton } from "@/components/layout/BackButton";
import { useParams, useSearch } from "wouter";

export default function QrScan() {
  const { language } = useAppCtx();
  const fil = language === "fil";
  // /q/MNL-ZOO-… (printed codes) or /qr-scan?code=… (older prints)
  const params = useParams<{ code?: string }>();
  const code = params.code ? decodeURIComponent(params.code) : new URLSearchParams(useSearch()).get("code");

  return (
    <div className="container py-12 max-w-md mx-auto">
      <BackButton className="mb-4" />
      <div className="relative text-center mb-8">
        <Stickers set="qr" />
        <h1 className="text-3xl font-bold text-primary mb-2">{fil ? "I-scan ang QR" : "Scan QR Code"}</h1>
        <p className="text-muted-foreground">
          {fil ? "I-scan ang QR code sa anumang kulungan para makilala ang hayop." : "Scan the QR code at any exhibit to meet the animal."}
        </p>
      </div>
      <Card className="rounded-3xl shadow-xl">
        <CardContent className="p-6">
          <QrScannerPanel initialCode={code} />
        </CardContent>
      </Card>
    </div>
  );
}
