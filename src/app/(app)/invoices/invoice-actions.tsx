"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/bits";
import { cancelAction, confirmTotalsAction, deleteDraftAction, markReminderSentAction, recordPaymentAction, sendAction, updateIssuedAction, type Result } from "./actions";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result | void>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r) return;
      if (r.ok) { if (r.message) toast.success(r.message); onOk?.(); }
      else toast.error(r.error);
    });
  return { pending, run };
}

export function ConfirmTotals({ id, reason }: { id: string; reason: string | null }) {
  const { pending, run } = useRun();
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <div className="text-sm text-amber-950">
        <p className="font-medium">Check the totals before sending</p>
        <p>{reason}. Dues&apos; figure is the one that will be used. Fix the line items if something&apos;s wrong, or confirm.</p>
      </div>
      <Button onClick={() => run(() => confirmTotalsAction(id))} disabled={pending} className="bg-amber-900 text-white hover:bg-amber-900/90">
        {pending ? "Confirming…" : "Confirm totals"}
      </Button>
    </div>
  );
}

export function SendButton({ id, total, client, blockedReason }: { id: string; total: string; client: string; blockedReason: string | null }) {
  const { pending, run } = useRun();
  if (blockedReason) {
    return <Button disabled title={blockedReason}>Send</Button>;
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button disabled={pending} className="h-10 px-5">{pending ? "Sending…" : "Send invoice"}</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send this invoice to {client}?</AlertDialogTitle>
          <AlertDialogDescription>
            Dues gives it the next invoice number and dates it today. The amounts ({total}) are then locked; to change them later you&apos;d cancel it and issue a new one. You&apos;ll get a link to share.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(() => sendAction(id))}>Send invoice</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteDraft({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="ghost" disabled={pending}>Delete draft</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
          <AlertDialogDescription>It has no invoice number yet, so nothing is lost from your invoice series. This can&apos;t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(() => deleteDraftAction(id))} className="bg-destructive text-white hover:bg-destructive/90">Delete draft</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ShareButtons({ link, whatsapp }: { link: string; whatsapp: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <CopyButton value={link} label="Copy link" variant="default" size="default" />
      <Button asChild variant="outline"><a href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a></Button>
      <Button asChild variant="ghost"><a href={link} target="_blank" rel="noopener noreferrer">Open client page</a></Button>
    </div>
  );
}

export function RecordPayment({ id, balance, today }: { id: string; balance: string; today: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ amount: "", tds: "", method: "bank_transfer", utr: "", paid_on: today });
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Record payment</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>Balance due: {balance}. If the client deducted TDS, enter it separately so the invoice still counts as paid.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            run(async () => { const r = await recordPaymentAction(id, f); if (!r.ok) setErr(r.error); return r; }, () => setOpen(false));
          }}
        >
          <div className="flex flex-col gap-1.5"><Label htmlFor="pa">Amount received (₹)</Label><Input id="pa" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="h-10" required /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="pt">TDS deducted (₹)</Label><Input id="pt" inputMode="decimal" value={f.tds} onChange={(e) => setF({ ...f, tds: e.target.value })} placeholder="0" className="h-10" /></div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pm">Method</Label>
            <select id="pm" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
              <option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="other">Other</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="pd">Paid on</Label><Input id="pd" type="date" max={today} value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} className="h-10" /></div>
          <div className="flex flex-col gap-1.5 sm:col-span-2"><Label htmlFor="pu">Reference / UTR (optional)</Label><Input id="pu" value={f.utr} onChange={(e) => setF({ ...f, utr: e.target.value })} className="h-10" /></div>
          {err ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{err}</p> : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Not now</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record payment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExtendDueDate({ id, current }: { id: string; current: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(current);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost">Extend due date</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend the due date</DialogTitle>
          <DialogDescription>The client&apos;s page will say the date was extended. Your on-time metrics still use the original date.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); setErr(null); run(async () => { const r = await updateIssuedAction(id, { due_date: date, reason }); if (!r.ok) setErr(r.error); return r; }, () => setOpen(false)); }}>
          <div className="flex flex-col gap-1.5"><Label htmlFor="nd">New due date</Label><Input id="nd" type="date" min={current} value={date} onChange={(e) => setDate(e.target.value)} className="h-10" /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="nr">Reason</Label><Input id="nr" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client asked for 30 days" maxLength={200} className="h-10" /></div>
          {err ? <p role="alert" className="text-sm text-destructive">{err}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Not now</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Extend"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditNotes({ id, notes }: { id: string; notes: string | null }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(notes ?? "");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost">Edit notes</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Notes on the invoice</DialogTitle><DialogDescription>Amounts are locked after sending, but notes can change.</DialogDescription></DialogHeader>
        <Label htmlFor="en" className="sr-only">Notes</Label>
        <Textarea id="en" value={v} onChange={(e) => setV(e.target.value)} rows={4} maxLength={1000} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Not now</Button>
          <Button disabled={pending} onClick={() => run(() => updateIssuedAction(id, { notes: v }), () => setOpen(false))}>{pending ? "Saving…" : "Save notes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelInvoice({ id, number }: { id: string; number: string }) {
  const { pending, run } = useRun();
  const [reason, setReason] = useState("");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive hover:text-destructive" disabled={pending}>Cancel invoice</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {number}?</AlertDialogTitle>
          <AlertDialogDescription>
            The client&apos;s page will show it as cancelled, and {number} stays used in your series. To bill different amounts, create a new invoice afterwards. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Label htmlFor="cr" className="sr-only">Reason</Label>
        <Input id="cr" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional), e.g. Wrong rate" maxLength={300} className="h-10" />
        <AlertDialogFooter>
          <AlertDialogCancel>Keep invoice</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(() => cancelAction(id, reason))} className="bg-destructive text-white hover:bg-destructive/90">Cancel invoice</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ReminderButtons({ invoiceId, reminderId, link, channel, sent }: { invoiceId: string; reminderId: string; link: string; channel: string; sent: boolean }) {
  const { run } = useRun();
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant={sent ? "outline" : "default"}>
        <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => { if (!sent) run(() => markReminderSentAction(invoiceId, reminderId)); }}>
          {channel === "whatsapp" ? "Open in WhatsApp" : "Open in email"}
        </a>
      </Button>
      <CopyButton value={decodeURIComponent((link.split(/[?&](?:text|body)=/)[1] ?? "").split("&")[0])} label="Copy text" />
    </div>
  );
}

export function PreviewLink({ id }: { id: string }) {
  return <Button asChild variant="outline"><Link href={`/invoices/${id}/preview`}>Preview</Link></Button>;
}
