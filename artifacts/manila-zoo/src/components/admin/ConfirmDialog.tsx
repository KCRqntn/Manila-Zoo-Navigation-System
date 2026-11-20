import React, { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

/**
 * Confirmation for destructive or important actions. With `typeToConfirm`, the action stays
 * disabled until that exact word is typed (used for restores).
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", destructive = false, typeToConfirm, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  typeToConfirm?: string;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ready = !typeToConfirm || typed === typeToConfirm;
  return (
    <AlertDialog open={open} onOpenChange={o => { if (!o) setTyped(""); onOpenChange(o); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild><div className="space-y-2 text-sm text-muted-foreground">{description}</div></AlertDialogDescription>
        </AlertDialogHeader>
        {typeToConfirm && (
          <div className="space-y-1.5">
            <p className="text-sm">Type <span className="font-mono font-bold">{typeToConfirm}</span> to confirm:</p>
            <Input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" aria-label={`Type ${typeToConfirm} to confirm`} />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ready}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={() => { setTyped(""); onConfirm(); }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
