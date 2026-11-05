"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage } from "@/components/bits";
import { GST_RATES, stateName, type GstRate } from "@/lib/domain/gst";
import { formatINR, parseQtyMilli, rupeesToPaise } from "@/lib/domain/money";
import { computeTotals } from "@/lib/domain/tax";
import { addDays, daysBetween } from "@/lib/domain/dates";
import { saveDraftAction } from "./actions";

export type FormClient = { id: string; name: string; state_code: string; gstin: string | null };
export type FormItem = { description: string; sac: string; qty: string; rate: string };
export type FormInitial = {
  client_id: string;
  items: FormItem[];
  gst_rate: number;
  issue_date: string;
  due_date: string;
  notes: string;
};

const blankItem = (sac: string): FormItem => ({ description: "", sac, qty: "1", rate: "" });

function tryParse<T>(fn: () => T): T | null {
  try { return fn(); } catch { return null; }
}

export function InvoiceForm({
  invoiceId, clients, supplier, initial,
}: {
  invoiceId: string | null;
  clients: FormClient[];
  supplier: { state_code: string | null; hasGstin: boolean; default_sac: string };
  initial: FormInitial;
}) {
  const [clientId, setClientId] = useState(initial.client_id);
  const [items, setItems] = useState<FormItem[]>(initial.items.length ? initial.items : [blankItem(supplier.default_sac)]);
  const [gstRate, setGstRate] = useState<number>(initial.gst_rate);
  const [issueDate, setIssueDate] = useState(initial.issue_date);
  const [dueDate, setDueDate] = useState(initial.due_date);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState<{ msg: string; field?: string } | null>(null);
  const [pending, start] = useTransition();

  const client = clients.find((c) => c.id === clientId);
  const totals = useMemo(() => {
    const lines = items.map((it) => {
      const q = tryParse(() => parseQtyMilli(it.qty || "0"));
      const r = tryParse(() => rupeesToPaise(it.rate || "0"));
      return q != null && r != null && q > 0 && r >= 0 ? { qtyMilli: q, ratePaise: r } : { qtyMilli: 0, ratePaise: 0 };
    });
    return computeTotals({
      lines,
      gstRate: (supplier.hasGstin ? gstRate : 0) as GstRate,
      supplierState: supplier.state_code ?? "",
      clientState: client?.state_code ?? supplier.state_code ?? "",
      supplierHasGstin: supplier.hasGstin,
    });
  }, [items, gstRate, client, supplier]);

  const terms = issueDate && dueDate ? daysBetween(issueDate, dueDate) : null;
  const fieldErr = (f: string) => (error?.field === f ? error.msg : undefined);
  const setItem = (i: number, patch: Partial<FormItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await saveDraftAction(invoiceId, {
        client_id: clientId || null,
        items: items.map((it) => ({ description: it.description, qty: it.qty, rate_rupees: it.rate, sac: it.sac })),
        gst_rate: supplier.hasGstin ? gstRate : 0,
        issue_date: issueDate,
        due_date: dueDate,
        notes,
      });
      if (r && !r.ok) {
        setError({ msg: r.error, field: r.field });
        toast.error(r.error);
      } else if (r?.ok) toast.success(r.message ?? "Saved");
    });
  };

  if (clients.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="font-medium">Add a client first</p>
        <p className="mt-1 text-sm text-muted-foreground">Invoices need a client with a state, so Dues can work out the tax split.</p>
        <Button asChild className="mt-4"><Link href="/clients?new=1">+ Add client</Link></Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client">Client</Label>
          <select id="client" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-invalid={!!fieldErr("client_id")} className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm aria-invalid:border-destructive">
            <option value="">Choose a client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">
            {client ? `${stateName(client.state_code)}${client.gstin ? ` · GSTIN ${client.gstin}` : " · no GSTIN"}` : <Link href="/clients?new=1" className="underline">+ Add a new client</Link>}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gst">GST rate</Label>
          {supplier.hasGstin ? (
            <select id="gst" value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm">
              {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
            </select>
          ) : (
            <p className="flex h-10 items-center rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground">GST not applicable (no GSTIN in your profile)</p>
          )}
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">Line items</legend>
        <div className="hidden grid-cols-[1fr_90px_80px_120px_110px_36px] gap-2 text-xs text-muted-foreground md:grid">
          <span>Description</span><span>SAC</span><span>Qty</span><span>Rate (₹)</span><span className="text-right">Amount</span><span />
        </div>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-3 md:grid-cols-[1fr_90px_80px_120px_110px_36px] md:border-0 md:p-0">
            <div className="col-span-2 md:col-span-1">
              <Label htmlFor={`d${i}`} className="md:sr-only">Description</Label>
              <Input id={`d${i}`} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="e.g. Logo design, 12 hours" aria-invalid={!!fieldErr(`items.${i}.description`)} className="h-10" />
            </div>
            <div>
              <Label htmlFor={`s${i}`} className="md:sr-only">SAC</Label>
              <Input id={`s${i}`} value={it.sac} onChange={(e) => setItem(i, { sac: e.target.value })} inputMode="numeric" maxLength={8} aria-invalid={!!fieldErr(`items.${i}.sac`)} className="h-10" />
            </div>
            <div>
              <Label htmlFor={`q${i}`} className="md:sr-only">Qty</Label>
              <Input id={`q${i}`} value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} inputMode="decimal" aria-invalid={!!fieldErr(`items.${i}.qty`)} className="h-10" />
            </div>
            <div>
              <Label htmlFor={`r${i}`} className="md:sr-only">Rate (₹)</Label>
              <Input id={`r${i}`} value={it.rate} onChange={(e) => setItem(i, { rate: e.target.value })} inputMode="decimal" placeholder="0" aria-invalid={!!fieldErr(`items.${i}.rate_rupees`)} className="h-10" />
            </div>
            <p className="flex items-center justify-end text-sm tabular-nums" aria-label={`Line ${i + 1} amount`}>{formatINR(totals.lineAmounts[i] ?? 0)}</p>
            <div className="flex items-center justify-end">
              <Button type="button" variant="ghost" size="icon" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} disabled={items.length === 1} aria-label={`Remove line ${i + 1}`}>
                <Trash2Icon />
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setItems((xs) => [...xs, blankItem(supplier.default_sac)])} disabled={items.length >= 50}>
            <PlusIcon /> Add line
          </Button>
        </div>
      </fieldset>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue">Issue date</Label>
              <Input id="issue" type="date" value={issueDate} onChange={(e) => { const t = terms; setIssueDate(e.target.value); if (t != null && e.target.value) setDueDate(addDays(e.target.value, t)); }} className="h-10" />
              <p className="text-xs text-muted-foreground">Becomes the send date when you send it.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="due">Due date</Label>
              <Input id="due" type="date" value={dueDate} min={issueDate} onChange={(e) => setDueDate(e.target.value)} aria-invalid={!!fieldErr("due_date")} className="h-10" />
              <div className="flex gap-1.5">
                {[7, 15, 30].map((d) => (
                  <Button key={d} type="button" variant={terms === d ? "secondary" : "ghost"} size="xs" onClick={() => setDueDate(addDays(issueDate, d))}>{d} days</Button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes (shown on the invoice)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} placeholder="e.g. Thanks for your business. Payment terms: 15 days." />
          </div>
        </div>

        <dl className="flex h-fit flex-col gap-1.5 rounded-lg border bg-muted/30 p-4 text-sm" aria-live="polite">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatINR(totals.subtotal)}</dd></div>
          {totals.mode === "intra" && (<>
            <div className="flex justify-between text-muted-foreground"><dt>CGST {gstRate / 2}%</dt><dd className="tabular-nums">{formatINR(totals.cgst)}</dd></div>
            <div className="flex justify-between text-muted-foreground"><dt>SGST {gstRate / 2}%</dt><dd className="tabular-nums">{formatINR(totals.sgst)}</dd></div>
          </>)}
          {totals.mode === "inter" && (
            <div className="flex justify-between text-muted-foreground"><dt>IGST {gstRate}%</dt><dd className="tabular-nums">{formatINR(totals.igst)}</dd></div>
          )}
          {totals.mode === "none" && <p className="text-muted-foreground">GST not applicable</p>}
          <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatINR(totals.total)}</dd></div>
          {totals.mode !== "none" && client && (
            <p className="text-xs text-muted-foreground">
              {totals.mode === "intra" ? "Same state, so CGST + SGST." : `${stateName(client.state_code)} is another state, so IGST.`} Dues recalculates this on save.
            </p>
          )}
        </dl>
      </div>

      <FormMessage error={error?.msg} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className="h-10 px-5">{pending ? "Saving…" : invoiceId ? "Save draft" : "Create draft"}</Button>
        <p className="self-center text-sm text-muted-foreground">Drafts get an invoice number when you send them.</p>
      </div>
    </form>
  );
}
