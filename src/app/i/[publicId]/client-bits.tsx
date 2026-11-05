"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reportAbuseAction, reportPaidAction, type PaidState } from "./actions";

export function PaidForm({ publicId, due, business, primary = false }: { publicId: string; due: string; business: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<PaidState, FormData>(reportPaidAction.bind(null, publicId), {});
  if (state.ok) {
    return (
      <p role="status" className="rounded-xl border border-paid-border bg-paid-soft px-4 py-3 body-6">
        Marked as paid. {business} will confirm once it arrives.
      </p>
    );
  }
  if (!open) {
    return <Button variant={primary ? "default" : "outline"} size="lg" className="w-full" onClick={() => setOpen(true)}>Notify as paid</Button>;
  }
  const v = state.values;
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4" noValidate>
      <h3 className="title-4">Notify as paid</h3>
      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Amount paid (₹)</Label>
        <Input id="amount" name="amount" inputMode="decimal" defaultValue={v?.amount ?? due} aria-invalid={state.field === "amount_rupees"} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="utr">Transaction reference (UTR)</Label>
        <Input id="utr" name="utr" defaultValue={v?.utr} autoCapitalize="characters" aria-invalid={state.field === "utr"} aria-describedby="utr-hint" />
        <p id="utr-hint" className="caption-5 text-muted-foreground">On your receipt: 12 digits for UPI or IMPS, 16 or 22 for NEFT or RTGS.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="method">Paid by</Label>
        <select id="method" name="method" defaultValue={v?.method ?? "bank_transfer"} className="h-10 rounded-lg border border-input bg-card px-3 body-3">
          <option value="bank_transfer">Bank transfer</option>
          <option value="upi">UPI</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="proof">Screenshot or receipt <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <input id="proof" name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-invalid={state.field === "proof"} aria-describedby="proof-hint"
          className="block w-full min-w-0 rounded-lg border border-input bg-card body-6 file:mr-3 file:h-10 file:border-0 file:bg-muted file:px-3 file:font-medium" />
        <p id="proof-hint" className="caption-5 text-muted-foreground">Image or PDF, up to 5 MB. Only {business} can see it.</p>
      </div>
      {state.error ? <p role="alert" className="body-6 text-destructive">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending} className="flex-1">{pending ? "Sending…" : "Send"}</Button>
        <Button type="button" size="lg" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="font-medium underline underline-offset-4">Print or save as PDF</button>;
}

export function ReportInvoice({ publicId }: { publicId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  if (done) return <span role="status">Report logged.</span>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-muted-foreground underline underline-offset-4">Report this invoice</button>;
  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(e) => { e.preventDefault(); start(async () => { await reportAbuseAction(publicId, reason); setDone(true); }); }}
    >
      <Label htmlFor="reason">What looks wrong? (optional)</Label>
      <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} placeholder="e.g. I don't know this business, or the bank details changed" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Sending…" : "Report"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
