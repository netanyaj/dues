import { addDays, istToday } from "@/lib/domain/dates";
import { formatINR } from "@/lib/domain/money";
import { check, db, logEvent, type Ctx } from "./core";
import { listInvoices, type InvoiceRow } from "./invoices";

const OPEN = new Set(["sent", "partially_paid", "overdue", "payment_reported"]);

export type Summary = {
  outstanding_paise: number;
  overdue_paise: number;
  paid_this_month_paise: number;
  tds_this_month_paise: number;
  overdue_by_client: { client: string; client_id: string; overdue_paise: number; invoices: number }[];
  to_chase: InvoiceRow[];
};

/** "To chase today": overdue, or open and due within 2 days. Excludes ones waiting on a client report. */
export function chaseList(rows: InvoiceRow[], today = istToday()): InvoiceRow[] {
  const soon = addDays(today, 2);
  return rows
    .filter((r) => r.status === "overdue" || ((r.status === "sent" || r.status === "partially_paid") && r.due_date <= soon))
    .sort((a, b) => b.days_overdue - a.days_overdue || a.due_date.localeCompare(b.due_date));
}

export async function receivablesSummary(ctx: Ctx): Promise<Summary> {
  const today = istToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const rows = (await listInvoices(ctx, { limit: 500 })).filter((r) => r.stage === "issued");
  let outstanding = 0, overdue = 0;
  const byClient = new Map<string, { client: string; client_id: string; overdue_paise: number; invoices: number }>();
  for (const r of rows) {
    if (OPEN.has(r.status)) outstanding += r.balance_paise;
    if (r.status === "overdue") {
      overdue += r.balance_paise;
      const c = byClient.get(r.client_id) ?? { client: r.client_name, client_id: r.client_id, overdue_paise: 0, invoices: 0 };
      c.overdue_paise += r.balance_paise;
      c.invoices += 1;
      byClient.set(r.client_id, c);
    }
  }
  const pays = check(
    await db().from("payments").select("amount_paise, tds_paise").eq("user_id", ctx.userId).eq("status", "confirmed").gte("paid_on", monthStart).lte("paid_on", today),
  ) as { amount_paise: number; tds_paise: number }[];
  return {
    outstanding_paise: outstanding,
    overdue_paise: overdue,
    paid_this_month_paise: pays.reduce((a, p) => a + Number(p.amount_paise), 0),
    tds_this_month_paise: pays.reduce((a, p) => a + Number(p.tds_paise), 0),
    overdue_by_client: [...byClient.values()].sort((a, b) => b.overdue_paise - a.overdue_paise),
    to_chase: chaseList(rows, today),
  };
}

export function describeSummary(s: Summary) {
  return {
    total_outstanding: formatINR(s.outstanding_paise),
    total_overdue: formatINR(s.overdue_paise),
    paid_this_month: formatINR(s.paid_this_month_paise),
    tds_deducted_this_month: formatINR(s.tds_this_month_paise),
    overdue_by_client: s.overdue_by_client.map((c) => ({ client: c.client, overdue: formatINR(c.overdue_paise), invoices: c.invoices })),
    to_chase_today: s.to_chase.map((r) => ({
      id: r.id, number: r.number, client: r.client_name, balance_due: formatINR(r.balance_paise), due_date: r.due_date,
      status: r.status, days_overdue: r.days_overdue,
    })),
  };
}

/**
 * Daily cron. Status is derived (DECISIONS.md D4), so this changes no state.
 * It records a one-time "became_overdue" event per invoice for the timeline and metrics.
 */
export async function runDailyOverdue(): Promise<{ newly_overdue: number; total_overdue: number }> {
  const overdue = check(await db().from("invoice_view").select("id, user_id, number, due_date, balance_paise").eq("status", "overdue").limit(5000)) as {
    id: string; user_id: string; number: string; due_date: string; balance_paise: number;
  }[];
  if (!overdue.length) return { newly_overdue: 0, total_overdue: 0 };
  const seen = check(await db().from("events").select("invoice_id").eq("type", "became_overdue").in("invoice_id", overdue.map((o) => o.id))) as { invoice_id: string }[];
  const seenIds = new Set(seen.map((s) => s.invoice_id));
  let n = 0;
  for (const o of overdue) {
    if (seenIds.has(o.id)) continue;
    const { error } = await db().from("events").insert({
      invoice_id: o.id, user_id: o.user_id, actor: "system", type: "became_overdue",
      payload: { due_date: o.due_date, balance_paise: Number(o.balance_paise), balance: formatINR(Number(o.balance_paise)) },
    });
    if (!error) n++;
    else if (error.code !== "23505") console.error("cron event failed", error);
  }
  return { newly_overdue: n, total_overdue: overdue.length };
}

export { logEvent };
