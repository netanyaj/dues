"use client";

import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { DotsThreeIcon, WhatsappLogoIcon } from "@phosphor-icons/react";
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
import { Banner } from "@/components/ds";
import { cancelAction, confirmTotalsAction, deleteDraftAction, markReminderSentAction, recordPaymentAction, saveBankAndSendAction, sendAction, updateIssuedAction, type Result } from "./actions";

type Controlled = { open?: boolean; onOpenChange?: (open: boolean) => void };

/** Dialogs open from their own button, or from the More menu when `open` is passed in. */
function useControlled(open: boolean | undefined, onChange: ((o: boolean) => void) | undefined): [boolean, (o: boolean) => void] {
  const [own, setOwn] = useState(false);
  return open === undefined ? [own, setOwn] : [open, onChange ?? (() => {})];
}

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
    <Banner
      tone="warning"
      title="Check the totals before sending"
      action={<Button onClick={() => run(() => confirmTotalsAction(id))} disabled={pending}>{pending ? "Confirming…" : "Totals are right"}</Button>}
    >
      {reason}. Dues uses its own figure. If something is off, fix the line items below; otherwise confirm.
    </Banner>
  );
}

export function SendButton({ id, total, client, blockedReason, needsBank = false, accountName = "" }: { id: string; total: string; client: string; blockedReason: string | null; needsBank?: boolean; accountName?: string }) {
  const { pending, run } = useRun();
  if (blockedReason) {
    return <Button disabled title={blockedReason}>Send</Button>;
  }
  if (needsBank) return <SendWithBank id={id} total={total} client={client} accountName={accountName} />;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button disabled={pending} className="h-10 px-6">{pending ? "Sending…" : "Send invoice"}</Button></AlertDialogTrigger>
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

/** D35: the first Send asks for bank details inline, then sends, instead of a dead end. */
function SendWithBank({ id, total, client, accountName }: { id: string; total: string; client: string; accountName: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: accountName, number: "", ifsc: "" });
  const [err, setErr] = useState<{ error: string; field?: string } | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="h-10 px-6">Send invoice</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add your bank account to send</DialogTitle>
          <DialogDescription>Your client needs it to pay you. It&apos;s saved to Settings and shown on every invoice. UPI stays optional.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            run(async () => { const r = await saveBankAndSendAction(id, f); if (!r.ok) setErr({ error: r.error, field: r.field }); return r; }, () => setOpen(false));
          }}
        >
          <div className="flex flex-col gap-2"><Label htmlFor="ban">Account name</Label><Input id="ban" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-10" aria-invalid={err?.field === "bank_account_name"} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="bno">Account number</Label><Input id="bno" inputMode="numeric" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} className="h-10" required aria-invalid={err?.field === "bank_account_number"} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="bif">IFSC</Label><Input id="bif" value={f.ifsc} onChange={(e) => setF({ ...f, ifsc: e.target.value.toUpperCase() })} className="h-10" required placeholder="HDFC0001234" aria-invalid={err?.field === "bank_ifsc"} /></div>
          {err ? <p role="alert" className="body-6 text-destructive">{err.error}</p> : null}
          <p className="caption-5 text-muted-foreground">Sending gives this invoice the next number and dates it today. The amounts ({total}) are then locked. It goes to {client} only when you share the link.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Not now</Button>
            <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Save and send"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDraft({ id, open: openProp, onOpenChange }: { id: string } & Controlled) {
  const { pending, run } = useRun();
  const [open, setOpen] = useControlled(openProp, onOpenChange);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {openProp === undefined && <AlertDialogTrigger asChild><Button variant="destructive-outline" disabled={pending}>Delete draft</Button></AlertDialogTrigger>}
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

export function ShareButtons({ link, whatsapp, email }: { link: string; whatsapp: string; email?: string | null }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate caption-2 text-muted-foreground">{link.replace(/^https?:\/\//, "")}</span>
        <CopyButton value={link} label="Copy client link" variant="default" />
      </div>
      <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline"><a href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a></Button>
      {email && <Button asChild variant="outline"><a href={email}>Email</a></Button>}
      <Button asChild variant="ghost"><a href={link} target="_blank" rel="noopener noreferrer">View as client</a></Button>
      </div>
    </div>
  );
}

export function RecordPayment({ id, balance, today, open: openProp, onOpenChange }: { id: string; balance: string; today: string } & Controlled) {
  const { pending, run } = useRun();
  const [open, setOpen] = useControlled(openProp, onOpenChange);
  const [f, setF] = useState({ amount: "", tds: "", method: "bank_transfer", utr: "", paid_on: today });
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {openProp === undefined && <DialogTrigger asChild><Button variant="outline">Record payment</Button></DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>Balance due: {balance}. If the client deducted TDS, enter it separately so the invoice still counts as paid.</DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            run(async () => { const r = await recordPaymentAction(id, f); if (!r.ok) setErr(r.error); return r; }, () => setOpen(false));
          }}
        >
          <div className="flex flex-col gap-2"><Label htmlFor="pa">Amount received (₹)</Label><Input id="pa" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="h-10" required /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="pt">TDS deducted (₹)</Label><Input id="pt" inputMode="decimal" value={f.tds} onChange={(e) => setF({ ...f, tds: e.target.value })} placeholder="0" className="h-10" /></div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pm">Method</Label>
            <select id="pm" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} className="h-10 rounded-lg border border-input bg-card px-3 body-6">
              <option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="other">Other</option>
            </select>
          </div>
          <div className="flex flex-col gap-2"><Label htmlFor="pd">Paid on</Label><Input id="pd" type="date" max={today} value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} className="h-10" /></div>
          <div className="flex flex-col gap-2 sm:col-span-2"><Label htmlFor="pu">Reference / UTR (optional)</Label><Input id="pu" value={f.utr} onChange={(e) => setF({ ...f, utr: e.target.value })} className="h-10" /></div>
          {err ? <p role="alert" className="body-6 text-destructive sm:col-span-2">{err}</p> : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Not now</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record payment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExtendDueDate({ id, current, open: openProp, onOpenChange }: { id: string; current: string } & Controlled) {
  const { pending, run } = useRun();
  const [open, setOpen] = useControlled(openProp, onOpenChange);
  const [date, setDate] = useState(current);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {openProp === undefined && <DialogTrigger asChild><Button variant="outline">Extend due date</Button></DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend the due date</DialogTitle>
          <DialogDescription>The client&apos;s page will say the date was extended. Your on-time metrics still use the original date.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); setErr(null); run(async () => { const r = await updateIssuedAction(id, { due_date: date, reason }); if (!r.ok) setErr(r.error); return r; }, () => setOpen(false)); }}>
          <div className="flex flex-col gap-2"><Label htmlFor="nd">New due date</Label><Input id="nd" type="date" min={current} value={date} onChange={(e) => setDate(e.target.value)} className="h-10" /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="nr">Reason</Label><Input id="nr" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client asked for 30 days" maxLength={200} className="h-10" /></div>
          {err ? <p role="alert" className="body-6 text-destructive">{err}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Not now</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Extend"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditNotes({ id, notes, open: openProp, onOpenChange }: { id: string; notes: string | null } & Controlled) {
  const { pending, run } = useRun();
  const [open, setOpen] = useControlled(openProp, onOpenChange);
  const [v, setV] = useState(notes ?? "");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {openProp === undefined && <DialogTrigger asChild><Button variant="outline">Edit notes</Button></DialogTrigger>}
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

export function CancelInvoice({ id, number, open: openProp, onOpenChange }: { id: string; number: string } & Controlled) {
  const { pending, run } = useRun();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useControlled(openProp, onOpenChange);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {openProp === undefined && <AlertDialogTrigger asChild><Button variant="destructive-outline" disabled={pending}>Cancel invoice</Button></AlertDialogTrigger>}
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
      <CopyButton value={decodeURIComponent((link.split(/[?&](?:text|body)=/)[1] ?? "").split("&")[0])} label="Copy message" />
    </div>
  );
}

export function PreviewLink({ id }: { id: string }) {
  return <Button asChild variant="outline"><Link href={`/invoices/${id}/preview`}>Preview</Link></Button>;
}

type MenuDialog = "record" | "extend" | "notes" | "cancel" | "delete";

/** The invoice's secondary actions (D34): one main action stays on the page, the rest live here. */
export function InvoiceMoreMenu(p: {
  id: string; number?: string | null; balance?: string; today?: string; due?: string; notes?: string | null;
  can: Partial<Record<MenuDialog, boolean>>; links?: { label: string; href: string; external?: boolean }[];
}) {
  const [which, setWhich] = useState<MenuDialog | null>(null);
  const set = (d: MenuDialog) => (o: boolean) => setWhich(o ? d : null);
  const item = "flex w-full cursor-pointer items-center rounded-lg px-3 py-2 body-6 outline-none data-[highlighted]:bg-muted";
  const LABEL: Record<MenuDialog, string> = { record: "Record payment", extend: "Extend due date", notes: "Edit notes", cancel: "Cancel invoice", delete: "Delete draft" };
  const order: MenuDialog[] = ["record", "extend", "notes"];
  const danger: MenuDialog[] = ["cancel", "delete"];
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions" title="More actions"><DotsThreeIcon weight="bold" /></Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-52 rounded-xl border bg-popover p-1 shadow-lg">
            {order.filter((d) => p.can[d]).map((d) => <DropdownMenu.Item key={d} className={item} onSelect={() => setWhich(d)}>{LABEL[d]}</DropdownMenu.Item>)}
            {p.links?.map((l) => (
              <DropdownMenu.Item key={l.href} asChild className={item}>
                {l.external ? <a href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a> : <Link href={l.href}>{l.label}</Link>}
              </DropdownMenu.Item>
            ))}
            {danger.some((d) => p.can[d]) && <DropdownMenu.Separator className="my-1 h-px bg-border" />}
            {danger.filter((d) => p.can[d]).map((d) => <DropdownMenu.Item key={d} className={`${item} text-danger`} onSelect={() => setWhich(d)}>{LABEL[d]}</DropdownMenu.Item>)}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {p.can.record && <RecordPayment id={p.id} balance={p.balance!} today={p.today!} open={which === "record"} onOpenChange={set("record")} />}
      {p.can.extend && <ExtendDueDate id={p.id} current={p.due!} open={which === "extend"} onOpenChange={set("extend")} />}
      {p.can.notes && <EditNotes id={p.id} notes={p.notes ?? null} open={which === "notes"} onOpenChange={set("notes")} />}
      {p.can.cancel && <CancelInvoice id={p.id} number={p.number!} open={which === "cancel"} onOpenChange={set("cancel")} />}
      {p.can.delete && <DeleteDraft id={p.id} open={which === "delete"} onOpenChange={set("delete")} />}
    </>
  );
}

/** Issued and unpaid: the main action is getting the link to the client. */
export function ShareMain({ link, whatsapp }: { link: string; whatsapp: string }) {
  return (
    <div className="flex items-center gap-2">
      <CopyButton value={link} label="Copy client link" variant="outline" size="icon" />
      <Button asChild><a href={whatsapp} target="_blank" rel="noopener noreferrer"><WhatsappLogoIcon weight="fill" aria-hidden />WhatsApp</a></Button>
    </div>
  );
}
