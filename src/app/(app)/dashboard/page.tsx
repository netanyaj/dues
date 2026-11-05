import { viewedText } from "@/lib/view";
import type { Metadata } from "next";
import Link from "next/link";
import { BankIcon, ClockCountdownIcon, DownloadSimpleIcon, PaperPlaneTiltIcon, PlusIcon, WarningIcon, EyeIcon } from "@phosphor-icons/react/dist/ssr";
import { requireCtx } from "@/lib/auth";
import { listInvoices } from "@/lib/service/invoices";
import { receivablesSummary } from "@/lib/service/summary";
import { pendingReports } from "@/lib/service/payments";
import { formatINR } from "@/lib/domain/money";
import { formatDate, istToday } from "@/lib/domain/dates";
import { AGE_BUCKETS, ageBuckets, ageOf, bucketOf, type AgeKey } from "@/lib/domain/aging";
import { ALL_STATUSES, STAGE_LABEL, STATUS_LABEL, type InvoiceStatus } from "@/lib/domain/status";
import { AutoRefresh } from "@/components/bits";
import { EmptyState } from "@/components/empty-state";
import { ClaudeBadge, StatusBadge } from "@/components/status-badge";
import { ReportDecision } from "@/components/report-decision";
import { Amount, PageHeader, Panel, Section } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TRY_PROMPT } from "../settings/mcp-card";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && (ALL_STATUSES as string[]).concat("outstanding", "payment_reported").includes(sp.status) ? (sp.status as InvoiceStatus | "outstanding" | "payment_reported") : null;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const age = AGE_BUCKETS.find((b) => b.key === sp.age)?.key ?? null;

  const [summary, reports, listed, anyInvoices, drafts, open] = await Promise.all([
    receivablesSummary(ctx),
    pendingReports(ctx),
    listInvoices(ctx, { status: age ? "outstanding" : status, q, limit: 200 }),
    status || q || age ? listInvoices(ctx, { limit: 1 }) : null,
    listInvoices(ctx, { status: "draft", limit: 50 }),
    listInvoices(ctx, { status: "outstanding", limit: 500 }),
  ]);
  const hasAny = (anyInvoices ?? listed).length > 0;
  const ready = drafts.filter((i) => i.ready_to_send_at);
  const todayIst = istToday();
  const invoices = age ? listed.filter((i) => bucketOf(ageOf(i.issue_date, todayIst)) === age) : listed;
  const buckets = ageBuckets(open, todayIst);
  const agedTotal = buckets.reduce((a, b) => a + b.paise, 0);
  const chase = summary.to_chase;
  const today = istToday();
  const fyStart = Number(today.slice(5, 7)) >= 4 ? `${today.slice(0, 4)}-04-01` : `${Number(today.slice(0, 4)) - 1}-04-01`;
  const notDue = summary.outstanding_paise - summary.overdue_paise;
  const needsCount = reports.length + ready.length + chase.length;

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh />
      <PageHeader title="Dashboard" description={`${formatDate(today)} · who owes you, and what needs you today`} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel className="p-5 sm:p-6 lg:col-start-1 lg:row-start-1">
            <p className="body-6 text-muted-foreground">Owed to you</p>
            <p className="amount mt-1 text-4xl font-semibold tracking-tight">{formatINR(summary.outstanding_paise, { decimals: "auto" })}</p>
            {agedTotal > 0 && <AgeBar buckets={buckets} total={agedTotal} active={age} />}
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <div><dt className="caption-4 text-muted-foreground">Late</dt><dd className={`amount title-4 ${summary.overdue_paise > 0 ? "text-late" : ""}`}>{formatINR(summary.overdue_paise, { decimals: "auto" })}</dd></div>
              <div><dt className="caption-4 text-muted-foreground">Not yet due</dt><dd className="amount title-4">{formatINR(notDue, { decimals: "auto" })}</dd></div>
              <div><dt className="caption-4 text-muted-foreground">Received this month</dt><dd className="amount title-4">{formatINR(summary.paid_this_month_paise, { decimals: "auto" })}</dd></div>
              <div><dt className="caption-4 text-muted-foreground">TDS this month</dt><dd className="amount title-4">{formatINR(summary.tds_this_month_paise, { decimals: "auto" })}</dd></div>
            </dl>
          </Panel>

        <Section title="Needs you" count={needsCount} className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {needsCount === 0 ? (
            <Panel className="p-4 body-6 text-muted-foreground">Nothing needs you right now. Payments to check, drafts to send and invoices to chase show up here.</Panel>
          ) : (
            <ul className="flex flex-col gap-3">
              {reports.map((r) => (
                <li key={r.id} className="flex gap-3 rounded-xl border bg-card p-4">
                    <BankIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-review" />
                    <div className="min-w-0 flex-1">
                      <p className="title-4">
                        {r.reported_by === "claude" ? "You told Claude " : `${r.client_name} says `}
                        <Amount paise={r.amount_paise} decimals="auto" /> was paid{r.reported_by === "claude" ? ` by ${r.client_name}` : ""}
                      </p>
                      <p className="mt-0.5 caption-5 text-muted-foreground">
                        <Link href={`/invoices/${r.invoice_id}`} className="amount underline underline-offset-2">{r.number}</Link> · UTR <span className="amount">{r.utr ?? "not given"}</span> · {formatDate(r.paid_on)}
                      </p>
                      <p className="mt-0.5 caption-5 text-muted-foreground">
                        {r.tds_suggestion ? `${formatINR(r.balance_paise - r.amount_paise, { decimals: "auto" })} short, which matches ${r.tds_suggestion.rate}% TDS.` : r.amount_paise < r.balance_paise ? `${formatINR(r.balance_paise - r.amount_paise, { decimals: "auto" })} less than the balance.` : "Covers the full balance."}
                      </p>
                      {r.proof_url && <p className="mt-1 caption-4"><a href={r.proof_url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline underline-offset-2">View proof of payment</a></p>}
                      {r.flags.map((f) => <p key={f} className="mt-1 flex gap-1 caption-4 text-attention"><WarningIcon aria-hidden className="mt-px size-3.5 shrink-0" />{f}</p>)}
                      <p className="mt-2 caption-5 text-muted-foreground">Check your bank or UPI app, then:</p>
                      <div className="mt-2"><ReportDecision report={r} /></div>
                    </div>
                </li>
              ))}
              {ready.map((r) => (
                <li key={r.id}>
                  <Link href={`/invoices/${r.id}`} className="flex gap-3 rounded-xl border bg-card p-4 hover:bg-muted/50">
                    <PaperPlaneTiltIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="title-4">Send {r.client_name}&apos;s invoice · <Amount paise={r.total_paise} decimals="auto" /></p>
                      <p className="mt-0.5 caption-5 text-muted-foreground">Claude marked this draft ready. Check it, then send it yourself.</p>
                    </div>
                  </Link>
                </li>
              ))}
              {chase.map((r) => (
                <li key={r.id}>
                  <Link href={`/invoices/${r.id}`} className="flex gap-3 rounded-xl border bg-card p-4 hover:bg-[#fafafa]">
                    <ClockCountdownIcon aria-hidden className={`mt-0.5 size-5 shrink-0 ${r.days_overdue > 0 ? "text-late" : "text-muted-foreground"}`} />
                    <div className="min-w-0">
                      <p className="title-4">
                        {r.client_name} · <Amount paise={r.balance_paise} decimals="auto" />{" "}
                        <span className={r.days_overdue > 0 ? "text-late" : "text-muted-foreground"}>
                          {r.days_overdue > 0 ? `${r.days_overdue} day${r.days_overdue === 1 ? "" : "s"} late` : `due ${formatDate(r.due_date)}`}
                        </span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 caption-5 text-muted-foreground"><EyeIcon aria-hidden className="size-3.5" />{viewedText(r.view_count, r.last_viewed_at)}</p>
                      {r.chase_note && <p className="mt-0.5 caption-5 text-attention">{r.chase_note}</p>}
                      {r.next_stage && <p className="mt-0.5 caption-5 text-muted-foreground">Next: {STAGE_LABEL[r.next_stage].toLowerCase()} reminder. Ask Claude to write it.</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
          <Section
            className="lg:col-start-1 lg:row-start-2"
            title="Invoices"
            action={hasAny ? (
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1 body-5 hover:bg-muted [&::-webkit-details-marker]:hidden">
                  <DownloadSimpleIcon aria-hidden className="size-4" />Export CSV
                </summary>
                <form action="/api/export" method="get" className="absolute right-0 z-20 mt-2 flex w-72 flex-col gap-3 rounded-xl border bg-card p-4 shadow-lg">
                  <p className="body-6 text-muted-foreground">Includes GST split, TDS and payments.</p>
                  <label className="flex flex-col gap-1 title-4">From<Input type="date" name="from" defaultValue={fyStart} required /></label>
                  <label className="flex flex-col gap-1 title-4">To<Input type="date" name="to" defaultValue={today} max={today} required /></label>
                  <Button type="submit">Download CSV</Button>
                </form>
              </details>
            ) : undefined}
          >
            {hasAny && (
              <form className="mb-3 flex flex-wrap items-center gap-2" role="search">
                <label htmlFor="status" className="sr-only">Status</label>
                {age && <span className="inline-flex h-9 items-center rounded-lg bg-muted px-3 body-5">Age: {AGE_BUCKETS.find((b) => b.key === age)!.label}</span>}
                <select id="status" name="status" defaultValue={status ?? ""} disabled={!!age} className="h-9 rounded-lg border border-input bg-card px-3 body-6">
                  <option value="">All invoices</option>
                  <option value="outstanding">Still owed</option>
                  <option value="payment_reported">Payment reported</option>
                  {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <label htmlFor="q" className="sr-only">Search</label>
                <Input id="q" name="q" defaultValue={q} placeholder="Number, client or notes" className="h-9 min-w-0 flex-1 sm:max-w-64" />
                <Button type="submit" variant="outline">Search</Button>
                {age && <input type="hidden" name="age" value={age} />}
                {(status || q || age) && <Button asChild variant="ghost"><Link href="/dashboard">Clear</Link></Button>}
              </form>
            )}

            {!hasAny ? (
              <EmptyState
                title="No invoices yet"
                action={<><Button asChild><Link href="/invoices/new"><PlusIcon aria-hidden weight="bold" />New invoice</Link></Button><Button asChild variant="outline"><Link href="/settings/claude">Connect Claude</Link></Button></>}
              >
                Ask Claude: “{TRY_PROMPT}” The draft shows up here within seconds.
              </EmptyState>
            ) : invoices.length === 0 ? (
              <EmptyState title="No invoices match">Try another status or search. <Link href="/dashboard" className="font-medium text-foreground underline underline-offset-4">Show all</Link></EmptyState>
            ) : (
              <Panel className="overflow-hidden">
                <table className="hidden w-full body-6 lg:table">
                  <thead className="border-b text-left caption-4 text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-medium">Invoice</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Client</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Still owed</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {invoices.map((i) => (
                      <tr key={i.id} className="group relative hover:bg-[#fafafa]">
                        <td className="px-4 py-3">
                          <Link href={`/invoices/${i.id}`} className="amount font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring">
                            {i.number ?? "Draft"}
                          </Link>
                          <span className="block caption-5 text-muted-foreground">Due {formatDate(i.due_date)}</span>
                          {i.source === "claude" && <ClaudeBadge className="mt-0.5 flex" />}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{i.client_name}</td>
                        <td className="px-4 py-3 text-right">
                          {i.stage === "issued" ? <Amount paise={i.balance_paise} muted={i.balance_paise === 0} /> : <Amount paise={i.total_paise} muted />}
                          {i.stage === "issued" && i.balance_paise !== i.total_paise && <span className="block whitespace-nowrap caption-5 text-muted-foreground">of <Amount paise={i.total_paise} /></span>}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={i.status} pendingReports={i.pending_reports} />
                          {i.needs_review && <span className="mt-0.5 flex items-center gap-1 caption-4 text-review"><WarningIcon aria-hidden className="size-3.5" />Check totals</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="divide-y lg:hidden">
                  {invoices.map((i) => (
                    <li key={i.id}>
                      <Link href={`/invoices/${i.id}`} className="flex items-start justify-between gap-4 px-4 py-3 active:bg-muted">
                        <div className="min-w-0">
                          <p className="title-4 truncate">{i.client_name}</p>
                          <p className="amount caption-5 text-muted-foreground">{i.number ?? "Draft"} · due {formatDate(i.due_date)}</p>
                          {i.source === "claude" && <ClaudeBadge className="mt-0.5" />}
                        </div>
                        <div className="shrink-0 text-right">
                          <Amount paise={i.stage === "issued" ? i.balance_paise : i.total_paise} className="title-4" decimals="auto" />
                          <div><StatusBadge status={i.status} pendingReports={i.pending_reports} className="caption-4 justify-end" /></div>
                          {i.needs_review && <p className="caption-4 text-review">Check totals</p>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </Section>

      </div>
    </div>
  );
}

/** D39: one chart. Open balances by invoice age, with the MSME 45-day line. Each bucket filters the list. */
function AgeBar({ buckets, total, active }: { buckets: ReturnType<typeof ageBuckets>; total: number; active: AgeKey | null }) {
  const TONE: Record<AgeKey, string> = { "0-15": "bg-[#d9d2cc]", "16-30": "bg-[#a8a3ad]", "31-45": "bg-[#5e5a63]", "45+": "bg-late" };
  const before45 = buckets.filter((b) => b.key !== "45+").reduce((a, b) => a + b.paise, 0);
  const markerPct = (before45 / total) * 100;
  return (
    <div className="mt-5">
      <p className="caption-4 text-muted-foreground">Who owes you, by age</p>
      <div className="relative mt-2">
        <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={buckets.map((b) => `${b.label}: ${formatINR(b.paise, { decimals: "auto" })}`).join(", ")}>
          {buckets.filter((b) => b.paise > 0).map((b) => (
            <Link key={b.key} href={active === b.key ? "/dashboard" : `/dashboard?age=${b.key}`} tabIndex={-1} aria-hidden
              className={`${TONE[b.key]} h-full transition-opacity duration-300 hover:opacity-80 ${active && active !== b.key ? "opacity-30" : ""}`} style={{ width: `${(b.paise / total) * 100}%` }} />
          ))}
        </div>
        {markerPct > 0 && markerPct < 100 && (
          <div aria-hidden className="pointer-events-none absolute -top-1 -bottom-1 w-0.5 rounded bg-foreground" style={{ left: `calc(${markerPct}% - 1px)` }} />
        )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {buckets.map((b) => (
          <li key={b.key}>
            <Link href={active === b.key ? "/dashboard" : `/dashboard?age=${b.key}`} aria-current={active === b.key ? "true" : undefined}
              className={`flex flex-col rounded-lg border px-2.5 py-1.5 hover:bg-muted/60 ${active === b.key ? "border-foreground" : "border-transparent"}`}>
              <span className="flex items-center gap-1.5 caption-4 text-muted-foreground"><span aria-hidden className={`size-2 rounded-full ${TONE[b.key]}`} />{b.label}</span>
              <span className={`amount title-4 ${b.key === "45+" && b.paise > 0 ? "text-late" : ""}`}>{formatINR(b.paise, { decimals: "auto" })}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 caption-5 text-muted-foreground">The line marks 45 days, the MSMED Act limit for buyers paying Udyam-registered micro and small businesses.</p>
    </div>
  );
}
