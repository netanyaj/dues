"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatINR } from "@/lib/domain/money";
import { decideReportAction } from "@/app/(app)/dashboard/actions";

export type ReportForDecision = {
  id: string;
  amount_paise: number;
  utr: string | null;
  number: string | null;
  balance_paise: number;
  tds_suggestion: { rate: number; tdsPaise: number } | null;
  flags?: string[];
  tds_paise?: number;
  reported_by?: string;
};

const rupees = (p: number) => (p / 100).toFixed(2).replace(/\.00$/, "");

export function ReportDecision({ report }: { report: ReportForDecision }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(rupees(report.amount_paise));
  const [tds, setTds] = useState(report.tds_paise ? rupees(report.tds_paise) : report.tds_suggestion ? rupees(report.tds_suggestion.tdsPaise) : "");
  const [error, setError] = useState<string | null>(null);

  const run = (decision: "confirm" | "reject") =>
    start(async () => {
      setError(null);
      const r = await decideReportAction(report.id, decision, decision === "confirm" ? amount : undefined, decision === "confirm" ? tds : undefined);
      if (r.ok) {
        toast.success(r.message);
        setOpen(false);
      } else if (decision === "confirm") setError(r.error);
      else toast.error(r.error);
    });

  return (
    <div className="flex gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" disabled={pending}>Confirm</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm payment for {report.number}</DialogTitle>
            <DialogDescription>
              Check your bank or UPI app for UTR <b>{report.utr ?? "—"}</b> before confirming. Balance due: {formatINR(report.balance_paise)}.
            </DialogDescription>
          </DialogHeader>
          {report.tds_suggestion ? (
            <p className="rounded-lg bg-muted px-3 py-2 body-6">
              The shortfall looks like {report.tds_suggestion.rate}% TDS ({formatINR(report.tds_suggestion.tdsPaise)}) on the amount before GST. It&apos;s filled in below. Change it if that&apos;s not right.
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`amt-${report.id}`}>Amount received (₹)</Label>
              <Input id={`amt-${report.id}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`tds-${report.id}`}>TDS deducted (₹)</Label>
              <Input id={`tds-${report.id}`} inputMode="decimal" value={tds} onChange={(e) => setTds(e.target.value)} placeholder="0" className="h-10" />
            </div>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Not now</Button>
            <Button onClick={() => run("confirm")} disabled={pending}>{pending ? "Confirming…" : "Confirm payment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={pending}>Reject</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this payment report?</AlertDialogTitle>
            <AlertDialogDescription>
              Do this if the money hasn&apos;t arrived. The invoice goes back to unpaid (or overdue, if past its due date). The report is kept in the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => run("reject")} className="bg-destructive text-white hover:bg-destructive/90">Reject report</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
