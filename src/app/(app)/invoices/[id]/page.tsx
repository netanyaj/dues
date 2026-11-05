import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { DuesError } from "@/lib/service/core";
import { getClient, listClients } from "@/lib/service/clients";
import { getInvoiceDetail, publicUrl } from "@/lib/service/invoices";
import { getProfile, setupGaps } from "@/lib/service/profile";
import { reminderLink } from "@/lib/service/reminders";
import { formatINR, qtyMilliToString, parseQtyMilli } from "@/lib/domain/money";
import { formatDate, formatDateTime, istToday } from "@/lib/domain/dates";
import { allowedActions } from "@/lib/domain/status";
import { whatsappLink } from "@/lib/domain/upi";
import { AutoRefresh } from "@/components/bits";
import { InvoiceDocument } from "@/components/invoice-document";
import { ClaudeBadge, StatusBadge } from "@/components/status-badge";
import { ReportDecision } from "@/components/report-decision";
import { docFromInvoice, describeEvent } from "@/lib/view";
import { pendingReports } from "@/lib/service/payments";
import { InvoiceForm } from "../invoice-form";
import {
  CancelInvoice, ConfirmTotals, DeleteDraft, EditNotes, ExtendDueDate, PreviewLink, RecordPayment, ReminderButtons, SendButton, ShareButtons,
} from "../invoice-actions";

export const metadata: Metadata = { title: "Invoice · Dues" };

export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const ctx = await requireCtx();
  const { id } = await params;
  let detail;
  try {
    detail = await getInvoiceDetail(ctx, id);
  } catch (e) {
    if (e instanceof DuesError && e.code === "invoice_not_found") notFound();
    throw e;
  }
  const { invoice: inv, items, payments, events, reminders } = detail;
  const profile = await getProfile(ctx);
  const actions = allowedActions({ stage: inv.stage, status: inv.status, needsReview: inv.needs_review, pendingReports: inv.pending_reports });
  const title = inv.number ?? `Draft · ${formatDate(inv.created_at.slice(0, 10))}`;

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm text-muted-foreground"><Link href="/dashboard" className="hover:underline">Dashboard</Link> / <Link href={`/clients/${inv.client_id}`} className="hover:underline">{inv.client_name}</Link></p>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold">
          <span className={inv.number ? "font-mono" : ""}>{title}</span>
          <StatusBadge status={inv.status} pendingReports={inv.pending_reports} />
          {inv.source === "claude" && <ClaudeBadge />}
        </h1>
        {inv.stage === "issued" && (
          <p className="mt-1 text-sm text-muted-foreground">
            Total {formatINR(inv.total_paise)} · Balance <b className="text-foreground">{formatINR(inv.balance_paise)}</b> · Due {formatDate(inv.due_date)}
            {inv.days_overdue > 0 ? <span className="text-red-700"> · {inv.days_overdue} days overdue</span> : null}
          </p>
        )}
      </div>
    </div>
  );

  if (inv.stage === "draft") {
    const clients = await listClients(ctx);
    const gaps = setupGaps(profile);
    const blocked = gaps.length ? `Finish setup first: add your ${gaps.join(", ")} in Settings.` : inv.needs_review ? "Confirm the totals first." : null;
    return (
      <div className="flex flex-col gap-6">
        <AutoRefresh seconds={15} />
        {header}
        {inv.needs_review && <ConfirmTotals id={inv.id} reason={inv.review_reason} />}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <SendButton id={inv.id} total={formatINR(inv.total_paise)} client={inv.client_name} blockedReason={blocked} />
          <PreviewLink id={inv.id} />
          <DeleteDraft id={inv.id} />
          {blocked ? <p className="text-sm text-muted-foreground">{blocked} {gaps.length ? <Link href="/settings" className="underline">Settings</Link> : null}</p> : <p className="text-sm text-muted-foreground">Save your edits first. Send uses the saved version.</p>}
        </div>
        <InvoiceForm
          key={inv.updated_at}
          invoiceId={inv.id}
          clients={clients.map((c) => ({ id: c.id, name: c.name, state_code: c.state_code, gstin: c.gstin }))}
          supplier={{ state_code: profile.state_code, hasGstin: !!profile.gstin, default_sac: profile.default_sac }}
          initial={{
            client_id: inv.client_id,
            items: items.map((i) => ({ description: i.description, sac: i.sac, qty: qtyMilliToString(parseQtyMilli(String(i.qty))), rate: (i.rate_paise / 100).toFixed(2).replace(/\.00$/, "") })),
            gst_rate: inv.gst_rate,
            issue_date: inv.issue_date,
            due_date: inv.due_date,
            notes: inv.notes ?? "",
          }}
        />
        <Timeline events={events} />
      </div>
    );
  }

  const link = publicUrl(inv.public_id)!;
  const shareText = `Hi ${inv.client_name}, here's invoice ${inv.number} from ${profile.business_name} for ${formatINR(inv.balance_paise)}, due ${formatDate(inv.due_date)}. You can view and pay it here: ${link}`;
  const reports = (await pendingReports(ctx)).filter((r) => r.invoice_id === inv.id);
  const client = await getClient(ctx, inv.client_id);

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh seconds={15} />
      {header}
      {reports.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50/60 p-4">
          <h2 className="font-medium">Needs your confirmation</h2>
          <ul className="mt-2 divide-y divide-amber-200">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div>
                  <p>Client says they paid <b>{formatINR(r.amount_paise)}</b> · UTR {r.utr ?? "—"} · {formatDate(r.paid_on)}</p>
                  {r.flags.map((f) => <p key={f} className="text-sm font-medium text-amber-900">⚠ {f}</p>)}
                </div>
                <ReportDecision report={r} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {inv.stage === "issued" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <ShareButtons link={link} whatsapp={whatsappLink(client?.phone, shareText)} />
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
          {actions.has("record_payment") && <RecordPayment id={inv.id} balance={formatINR(inv.balance_paise)} today={istToday()} />}
          {actions.has("edit_notes_due") && inv.status !== "paid" && <ExtendDueDate id={inv.id} current={inv.due_date} />}
          {actions.has("edit_notes_due") && <EditNotes id={inv.id} notes={inv.notes} />}
          {actions.has("cancel") && <CancelInvoice id={inv.id} number={inv.number!} />}
        </div>
      )}
      {inv.stage === "issued" && (
        <p className="text-sm text-muted-foreground">Line items, client and amounts are locked now it&apos;s sent. To change the amounts, cancel this invoice and create a new one.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <InvoiceDocument d={docFromInvoice(inv, items)} />
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="font-medium">Payments</h2>
            {payments.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">None yet. When the client taps &ldquo;I&apos;ve paid&rdquo;, it shows up here and on your dashboard.</p>
            ) : (
              <ul className="mt-2 divide-y rounded-lg border text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="px-3 py-2">
                    <p className="flex justify-between gap-2">
                      <span>{formatINR(p.amount_paise)}{p.tds_paise > 0 ? ` + ${formatINR(p.tds_paise)} TDS` : ""}</span>
                      <span className={p.status === "confirmed" ? "text-emerald-700" : p.status === "rejected" ? "text-muted-foreground line-through" : "text-amber-800"}>
                        {p.status === "reported" ? "Waiting for you" : p.status === "confirmed" ? "Confirmed" : "Rejected"}
                      </span>
                    </p>
                    <p className="text-muted-foreground">{formatDate(p.paid_on)} · {p.method.replace("_", " ")}{p.utr ? ` · ${p.utr}` : ""} · by {p.reported_by === "user" ? "you" : p.reported_by}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="font-medium">Reminders</h2>
            {reminders.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No reminders yet. Ask Claude: &ldquo;Write a polite reminder for {inv.number} and save it for WhatsApp.&rdquo;</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-3">
                {reminders.map((r) => (
                  <li key={r.id} className="rounded-lg border p-3 text-sm">
                    <p className="whitespace-pre-line">{r.message}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {r.channel === "whatsapp" ? "WhatsApp" : "Email"} · written by {r.created_by === "claude" ? "Claude" : "you"} · {formatDateTime(r.created_at)}
                      {r.sent_marked_at ? ` · opened to send ${formatDateTime(r.sent_marked_at)}` : ""}
                    </p>
                    <div className="mt-2"><ReminderButtons invoiceId={inv.id} reminderId={r.id} link={reminderLink(inv, profile.business_name, r)} channel={r.channel} sent={!!r.sent_marked_at} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Timeline events={events} />
        </div>
      </div>
    </div>
  );
}

function Timeline({ events }: { events: { id: number; actor: string; type: string; payload: Record<string, unknown>; created_at: string }[] }) {
  return (
    <section>
      <h2 className="font-medium">History</h2>
      <ol className="mt-2 flex flex-col gap-2 border-l pl-4 text-sm">
        {events.slice().reverse().map((e) => {
          const d = describeEvent(e);
          return (
            <li key={e.id}>
              <p><b>{d.who}</b> {d.what}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
