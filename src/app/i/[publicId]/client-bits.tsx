"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reportAbuseAction, reportPaidAction, type PaidState } from "./actions";

export function PaidForm({ publicId, due }: { publicId: string; due: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<PaidState, FormData>(reportPaidAction.bind(null, publicId), {});
  if (state.ok) {
    return (
      <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        Thanks. We&apos;ve let them know. They&apos;ll confirm once the money shows up in their account.
      </p>
    );
  }
  if (!open) {
    return <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>I&apos;ve paid</Button>;
  }
  const v = state.values;
  return (
    <form action={action} className="flex flex-col gap-3 border-t pt-4" noValidate>
      <h3 className="text-sm font-medium">Tell them you&apos;ve paid</h3>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="amount">Amount paid (₹)</Label>
        <Input id="amount" name="amount" inputMode="decimal" defaultValue={v?.amount ?? due} aria-invalid={state.field === "amount_rupees"} className="h-11" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="utr">Transaction reference (UTR)</Label>
        <Input id="utr" name="utr" defaultValue={v?.utr} autoCapitalize="characters" aria-invalid={state.field === "utr"} aria-describedby="utr-hint" className="h-11" />
        <p id="utr-hint" className="text-xs text-muted-foreground">Find it on your payment receipt: 12 digits for UPI or IMPS, 16 or 22 characters for NEFT or RTGS.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="method">Paid by</Label>
        <select id="method" name="method" defaultValue={v?.method ?? "bank_transfer"} className="h-11 rounded-lg border border-input bg-transparent px-3 text-sm">
          <option value="bank_transfer">Bank transfer</option>
          <option value="upi">UPI</option>
          <option value="other">Other</option>
        </select>
      </div>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="h-11 flex-1">{pending ? "Sending…" : "Send to the freelancer"}</Button>
        <Button type="button" variant="ghost" className="h-11" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="underline underline-offset-4">Print or save as PDF</button>;
}

export function ReportInvoice({ publicId }: { publicId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  if (done) return <span role="status">Thanks. We&apos;ve logged your report.</span>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-zinc-500 underline underline-offset-4">Report this invoice</button>;
  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(e) => { e.preventDefault(); start(async () => { await reportAbuseAction(publicId, reason); setDone(true); }); }}
    >
      <Label htmlFor="reason">What looks wrong? (optional)</Label>
      <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} placeholder="e.g. I don't know this business, or the bank details changed" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Sending…" : "Send report"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
