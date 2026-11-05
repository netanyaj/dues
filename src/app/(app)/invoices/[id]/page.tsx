import type React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { DuesError } from "@/lib/service/core";
import { getClient, listClients } from "@/lib/service/clients";
import { getInvoiceDetail, publicUrl } from "@/lib/service/invoices";
import { getProfile, hasBankDetails, setupGaps } from "@/lib/service/profile";
import { reminderLink } from "@/lib/service/reminders";
import { formatINR, qtyMilliToString, parseQtyMilli } from "@/lib/domain/money";
import { formatDate, formatDateTime, istToday } from "@/lib/domain/dates";
import { allowedActions, STAGE_LABEL, type ReminderStage } from "@/lib/domain/status";
import { mailtoLink, whatsappLink } from "@/lib/domain/upi";
import { AutoRefresh } from "@/components/bits";
import { InvoiceDocument } from "@/components/invoice-document";
import { ClaudeBadge, StatusBadge } from "@/components/status-badge";
import { ReportDecision } from "@/components/report-decision";
import { docFromInvoice, describeEvent, viewedText } from "@/lib/view";
import { pendingReports } from "@/lib/service/payments";
import { Amount, Banner, Panel } from "@/components/ds";
import { InvoiceForm } from "../invoice-form";
import { ConfirmTotals, InvoiceMoreMenu, ReminderButtons, SendButton, ShareMain } from "../invoice-actions";

export const metadata: Metadata = { title: "Invoice" };

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

  const stat = (label: string, value: React.ReactNode, tone = "") => (
    <div className="min-w-0"><dt className="caption-4 text-muted-foreground">{label}</dt><dd className={`amount mt-0.5 title-3 ${tone}`}>{value}</dd></div>
  );
  // D34: one summary bar instead of a sentence, so amount, status and due date read at a glance.
  const summary = inv.stage === "cancelled" ? null : (
    <Panel className="p-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {inv.stage === "draft" ? (
          <>
            {stat("Total", <Amount paise={inv.total_paise} />, "heading-6")}
            {stat("Client", inv.client_name)}
            {stat("Due", formatDate(inv.due_date))}
            {stat("Number", "When you send")}
          </>
        ) : (
          <>
            {stat(inv.status === "paid" ? "Paid" : "Still owed", <Amount paise={inv.status === "paid" ? inv.total_paise : inv.balance_paise} />, `heading-6 ${inv.status === "paid" ? "text-paid" : ""}`)}
            {stat("Invoice total", <Amount paise={inv.total_paise} />)}
            {stat("Due", <>{formatDate(inv.due_date)}{inv.days_overdue > 0 && inv.status !== "paid" ? <span className="block caption-3 text-late">{inv.days_overdue} day{inv.days_overdue === 1 ? "" : "s"} late</span> : null}</>)}
            {stat("Client opened", <span className="body-5">{viewedText(inv.view_count, inv.last_viewed_at)}</span>)}
          </>
        )}
      </dl>
    </Panel>
  );

  const header = (main: React.ReactNode, more: React.ReactNode) => (
    <div className="flex flex-col gap-2">
      <nav aria-label="Breadcrumb" className="caption-4 text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground hover:underline">Dashboard</Link>
        <span aria-hidden className="mx-2">/</span>
        <Link href={`/clients/${inv.client_id}`} className="hover:text-foreground hover:underline">{inv.client_name}</Link>
      </nav>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="amount heading-6 sm:heading-5">{title}</h1>
        <StatusBadge status={inv.status} pendingReports={inv.pending_reports} />
        {inv.source === "claude" && <ClaudeBadge />}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">{main}{more}</div>
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
        {header(
          <SendButton id={inv.id} total={formatINR(inv.total_paise)} client={inv.client_name} blockedReason={blocked} needsBank={!hasBankDetails(profile)} accountName={profile.business_name ?? ""} />,
          <InvoiceMoreMenu id={inv.id} can={{ delete: true }} links={[{ label: "Preview as client", href: `/invoices/${inv.id}/preview` }]} />,
        )}
        <p className="-mt-4 caption-5 text-muted-foreground">
          {blocked ? <>{blocked} {gaps.length ? <Link href="/settings" className="font-medium text-foreground underline underline-offset-2">Open settings</Link> : null}</> : "Save your edits first. Send uses the saved version."}
        </p>
        {summary}
        {inv.needs_review && <ConfirmTotals id={inv.id} reason={inv.review_reason} />}
        {inv.ready_to_send_at && !inv.needs_review && (
          <Banner title="Claude marked this ready to send">Check it, then press Send. Only you can send it.</Banner>
        )}
        <InvoiceForm
          key={inv.updated_at}
          invoiceId={inv.id}
          clients={clients.map((c) => ({ id: c.id, name: c.name, state_code: c.state_code, gstin: c.gstin }))}
          supplier={{ state_code: profile.state_code, hasGstin: !!profile.gstin, default_sac: profile.default_sac, msmeCovered: !!profile.udyam_number && (profile.msme_category === "micro" || profile.msme_category === "small") }}
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
      {header(
        inv.stage === "issued" && inv.status !== "paid" && reports.length === 0 ? <ShareMain link={link} whatsapp={whatsappLink(client?.phone, shareText)} /> : null,
        inv.stage === "issued" ? (
          <InvoiceMoreMenu
            id={inv.id} number={inv.number} balance={formatINR(inv.balance_paise)} today={istToday()} due={inv.due_date} notes={inv.notes}
            can={{ record: actions.has("record_payment"), extend: actions.has("edit_notes_due") && inv.status !== "paid", notes: actions.has("edit_notes_due"), cancel: actions.has("cancel") }}
            links={[
              { label: "View as client", href: link, external: true },
              ...(client?.email ? [{ label: "Send by email", href: mailtoLink(client.email, `Invoice ${inv.number} from ${profile.business_name}`, shareText), external: true }] : []),
            ]}
          />
        ) : null,
      )}
      {summary}
      {inv.stage === "cancelled" && (
        <Banner tone="error" title="Cancelled">Its number stays used, so your series has no gaps. Create a new invoice if you need to bill again.</Banner>
      )}
      {inv.stage === "issued" && inv.status === "paid" && (
        <Banner tone="success" title="Paid in full">Nothing left to do.</Banner>
      )}
      {reports.map((r) => (
        <Banner
          key={r.id}
          tone="warning"
          title={<>{r.reported_by === "claude" ? "You told Claude it was paid" : "Your client says they paid"}: <Amount paise={r.amount_paise} />{r.tds_paise ? <> + <Amount paise={r.tds_paise} /> TDS</> : null}</>}
          action={<ReportDecision report={r} />}
        >
          UTR <span className="amount">{r.utr ?? "not given"}</span> · {formatDate(r.paid_on)}. Check your bank or UPI app before confirming.
          {r.proof_url && <> <a href={r.proof_url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline underline-offset-2">View proof</a></>}
          {r.flags.map((f) => <span key={f} className="mt-1 block font-medium text-attention">{f}</span>)}
        </Banner>
      ))}
      {inv.stage === "issued" && <p className="-mt-3 caption-5 text-muted-foreground">Amounts, client and line items are locked once sent. To change them, cancel this invoice from More and create a new one.</p>}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <InvoiceDocument d={docFromInvoice(inv, items)} />
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="body-4">Payments</h2>
            {payments.length === 0 ? (
              <p className="mt-1 body-6 text-muted-foreground">None yet. When your client taps &ldquo;Notify as paid&rdquo;, it shows up here and on your dashboard.</p>
            ) : (
              <ul className="mt-2 divide-y rounded-xl border bg-card body-6">
                {payments.map((p) => (
                  <li key={p.id} className="px-3 py-2">
                    <p className="flex justify-between gap-2">
                      <span className="amount font-medium">{formatINR(p.amount_paise)}{p.tds_paise > 0 ? ` + ${formatINR(p.tds_paise)} TDS` : ""}</span>
                      <span className={p.status === "confirmed" ? "text-paid font-medium" : p.status === "rejected" ? "text-muted-foreground line-through" : "text-review font-medium"}>
                        {p.status === "reported" ? "Waiting for you" : p.status === "confirmed" ? "Confirmed" : "Rejected"}
                      </span>
                    </p>
                    <p className="caption-5 text-muted-foreground">{formatDate(p.paid_on)} · {p.method.replace("_", " ")}{p.utr ? ` · ${p.utr}` : ""} · by {p.reported_by === "user" ? "you" : p.reported_by}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="body-4">Reminders</h2>
            {reminders.length === 0 ? (
              <p className="mt-1 body-6 text-muted-foreground">No reminders yet. Ask Claude: &ldquo;Write a polite reminder for {inv.number} and save it for WhatsApp.&rdquo;</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-3">
                {reminders.map((r) => (
                  <li key={r.id} className="rounded-xl border bg-card p-3 body-6">
                    <p className="whitespace-pre-line [overflow-wrap:anywhere]">{r.message}</p>
                    <p className="mt-2 caption-5 text-muted-foreground">
                      {r.stage ? `${STAGE_LABEL[r.stage as ReminderStage]} · ` : ""}{r.channel === "whatsapp" ? "WhatsApp" : "Email"} · written by {r.created_by === "claude" ? "Claude" : "you"} · {formatDateTime(r.created_at)}
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
      <h2 className="body-4">History</h2>
      <ol className="mt-2 flex flex-col gap-3 body-6">
        {events.filter((e, i, all) => e.type !== "viewed" || e.payload?.n === 1 || i === all.findLastIndex((x) => x.type === "viewed")).slice().reverse().map((e) => {
          const d = describeEvent(e);
          return (
            <li key={e.id} className="flex gap-3">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-tone-mid" />
              <div className="min-w-0 break-words">
                <p><span className="font-medium">{d.who}</span> {d.what}</p>
                <p className="caption-5 text-muted-foreground">{formatDateTime(e.created_at)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
