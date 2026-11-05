import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { listInvoices } from "@/lib/service/invoices";
import { receivablesSummary } from "@/lib/service/summary";
import { pendingReports } from "@/lib/service/payments";
import { formatINR } from "@/lib/domain/money";
import { formatDate } from "@/lib/domain/dates";
import { ALL_STATUSES, STATUS_LABEL, type InvoiceStatus } from "@/lib/domain/status";
import { AutoRefresh } from "@/components/bits";
import { EmptyState } from "@/components/empty-state";
import { ClaudeBadge, StatusBadge } from "@/components/status-badge";
import { ReportDecision } from "@/components/report-decision";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TRY_PROMPT } from "../settings/mcp-card";
import { STAGE_LABEL } from "@/lib/domain/status";
import { istToday } from "@/lib/domain/dates";

export const metadata: Metadata = { title: "Dashboard · Dues" };

function Stat({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" }) {
  return (
    <div className="min-w-0 rounded-lg border p-3 sm:p-4">
      <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums break-words sm:text-2xl ${tone === "red" ? "text-red-700" : tone === "green" ? "text-emerald-700" : ""}`}>{value}</p>
    </div>
  );
}

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && (ALL_STATUSES as string[]).concat("outstanding", "payment_reported").includes(sp.status) ? (sp.status as InvoiceStatus | "outstanding" | "payment_reported") : null;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";

  const [summary, reports, invoices, anyInvoices] = await Promise.all([
    receivablesSummary(ctx),
    pendingReports(ctx),
    listInvoices(ctx, { status, q, limit: 200 }),
    status || q ? listInvoices(ctx, { limit: 1 }) : null,
  ]);
  const hasAny = (anyInvoices ?? invoices).length > 0;
  const ready = (await listInvoices(ctx, { status: "draft", limit: 50 })).filter((i) => i.ready_to_send_at);
  const today = istToday();
  const fyStart = Number(today.slice(5, 7)) >= 4 ? `${today.slice(0, 4)}-04-01` : `${Number(today.slice(0, 4)) - 1}-04-01`;

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh />
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Outstanding" value={formatINR(summary.outstanding_paise, { decimals: "auto" })} />
        <Stat label="Overdue" value={formatINR(summary.overdue_paise, { decimals: "auto" })} tone={summary.overdue_paise > 0 ? "red" : undefined} />
        <Stat label="Paid this month" value={formatINR(summary.paid_this_month_paise, { decimals: "auto" })} tone="green" />
      </div>

      {reports.length > 0 && (
        <section aria-labelledby="confirm-h" className="rounded-lg border border-amber-300 bg-amber-50/60 p-4">
          <h2 id="confirm-h" className="font-medium">Needs your confirmation</h2>
          <p className="text-sm text-muted-foreground">Clients (or Claude, from what you told it) say these were paid. Check your bank or UPI app, then confirm or reject.</p>
          <ul className="mt-3 divide-y divide-amber-200">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.reported_by === "claude" ? `Claude noted ${r.client_name} paid` : `${r.client_name} paid`} {formatINR(r.amount_paise)}{r.tds_paise ? ` + ${formatINR(r.tds_paise)} TDS` : ""}{" "}
                    <Link href={`/invoices/${r.invoice_id}`} className="font-normal text-muted-foreground underline underline-offset-4">{r.number}</Link>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    UTR {r.utr ?? "—"} · {formatDate(r.paid_on)}
                    {r.tds_suggestion ? ` · rest looks like ${r.tds_suggestion.rate}% TDS` : r.amount_paise < r.balance_paise ? ` · ${formatINR(r.balance_paise - r.amount_paise)} short of the balance` : ""}
                  </p>
                  {r.flags.map((f) => (
                    <p key={f} className="mt-0.5 text-sm font-medium text-amber-900">⚠ {f}</p>
                  ))}
                </div>
                <ReportDecision report={r} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {ready.length > 0 && (
        <section aria-labelledby="ready-h" className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
          <h2 id="ready-h" className="font-medium">Ready to send</h2>
          <p className="text-sm text-muted-foreground">Claude prepared these. Check each one and press Send. Claude can&apos;t send for you.</p>
          <ul className="mt-2 divide-y divide-blue-100">
            {ready.map((r) => (
              <li key={r.id}>
                <Link href={`/invoices/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:underline">
                  <span><span className="font-medium">{r.client_name}</span> <span className="text-sm text-muted-foreground">Draft · {formatDate(r.created_at.slice(0, 10))}</span></span>
                  <span className="text-sm tabular-nums">{formatINR(r.total_paise)} · Review and send →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.to_chase.length > 0 && (
        <section aria-labelledby="chase-h">
          <h2 id="chase-h" className="font-medium">To chase today</h2>
          <ul className="mt-2 divide-y rounded-lg border">
            {summary.to_chase.map((r) => (
              <li key={r.id}>
                <Link href={`/invoices/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50">
                  <span className="min-w-0">
                    <span className="font-medium">{r.client_name}</span>{" "}
                    <span className="text-sm text-muted-foreground">{r.number}</span>
                    {r.chase_note && <span className="block text-sm text-amber-900">{r.chase_note}</span>}
                    {r.next_stage && <span className="mt-0.5 block text-sm text-muted-foreground">Next: {STAGE_LABEL[r.next_stage]} reminder. Ask Claude to write it.</span>}
                  </span>
                  <span className="flex items-center gap-3 text-sm">
                    <span className="tabular-nums">{formatINR(r.balance_paise)}</span>
                    <span className={r.days_overdue > 0 ? "text-red-700" : "text-muted-foreground"}>
                      {r.days_overdue > 0 ? `${r.days_overdue} day${r.days_overdue === 1 ? "" : "s"} overdue` : `due ${formatDate(r.due_date)}`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="inv-h" className="flex flex-col gap-3">
        {hasAny && (
          <form action="/api/export" method="get" className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
            <span className="mr-auto self-center font-medium">Export for your accountant (CSV)</span>
            <label className="flex flex-col gap-1">From<Input type="date" name="from" defaultValue={fyStart} className="h-9" required /></label>
            <label className="flex flex-col gap-1">To<Input type="date" name="to" defaultValue={today} max={today} className="h-9" required /></label>
            <Button type="submit" variant="outline" size="sm" className="h-9">Export CSV</Button>
          </form>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="inv-h" className="font-medium">Invoices</h2>
          {hasAny && (
            <form className="flex flex-wrap items-center gap-2" role="search">
              <label htmlFor="status" className="sr-only">Status</label>
              <select id="status" name="status" defaultValue={status ?? ""} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
                <option value="">All statuses</option>
                <option value="outstanding">Outstanding</option>
                <option value="payment_reported">Payment reported</option>
                {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <label htmlFor="q" className="sr-only">Search</label>
              <Input id="q" name="q" defaultValue={q} placeholder="Search number, client, notes" className="h-9 w-56" />
              <Button type="submit" variant="outline" size="sm" className="h-9">Filter</Button>
              {(status || q) && <Button asChild variant="ghost" size="sm" className="h-9"><Link href="/dashboard">Clear</Link></Button>}
            </form>
          )}
        </div>

        {!hasAny ? (
          <EmptyState
            title="No invoices yet"
            action={<><Button asChild><Link href="/invoices/new">+ New invoice</Link></Button><Button asChild variant="outline"><Link href="/settings">Connect Claude</Link></Button></>}
          >
            Ask Claude: “{TRY_PROMPT}” It will appear here within seconds.
          </EmptyState>
        ) : invoices.length === 0 ? (
          <EmptyState title="No invoices match">Try a different status or search. <Link href="/dashboard" className="underline">Show all</Link></EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Invoice</th>
                  <th scope="col" className="px-4 py-2 font-medium">Client</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Balance</th>
                  <th scope="col" className="px-4 py-2 font-medium">Due</th>
                  <th scope="col" className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((i) => (
                  <tr key={i.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <Link href={`/invoices/${i.id}`} className="font-medium whitespace-nowrap underline-offset-4 hover:underline">
                        {i.number ?? `Draft · ${formatDate(i.created_at.slice(0, 10))}`}
                      </Link>
                      {i.source === "claude" && <div className="mt-1"><ClaudeBadge /></div>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{i.client_name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(i.total_paise)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{i.stage === "issued" ? formatINR(i.balance_paise) : "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(i.due_date)}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <StatusBadge status={i.status} pendingReports={i.pending_reports} />
                        {i.needs_review && <span className="text-xs font-medium whitespace-nowrap text-amber-800">Check totals</span>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
