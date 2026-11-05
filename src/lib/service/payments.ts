import { formatINR, rupeesToPaise } from "@/lib/domain/money";
import { CLAIM_TOLERANCE_PAISE, suggestTds } from "@/lib/domain/tax";
import { formatDate, istToday, isValidDate } from "@/lib/domain/dates";
import { check, cleanText, db, DuesError, logEvent, type Ctx } from "./core";
import { assertAllowed, findInvoice, type InvoiceRow, type PaymentRow } from "./invoices";

export type PaymentInput = {
  amount_rupees?: number | string | null;
  tds_rupees?: number | string | null;
  method?: string | null;
  utr?: string | null;
  paid_on?: string | null;
};

type Method = "upi" | "bank_transfer" | "other";

function parseMethod(m: string | null | undefined): Method {
  if (!m) return "other";
  const v = m.toLowerCase().replace(/[\s-]/g, "_");
  if (v === "upi") return "upi";
  if (["bank_transfer", "bank", "neft", "imps", "rtgs", "transfer"].includes(v)) return "bank_transfer";
  if (v === "other" || v === "cash" || v === "cheque") return "other";
  throw new DuesError("invalid_input", `method must be "upi", "bank_transfer" or "other" (got "${m}").`, "method");
}

function parseUtr(raw: string | null | undefined, required: boolean): string | null {
  const v = cleanText(raw, 40)?.replace(/\s/g, "").toUpperCase() ?? null;
  if (!v) {
    if (required) throw new DuesError("invalid_input", "Enter the transaction reference (UTR). Your banking app shows it on the payment receipt.", "utr");
    return null;
  }
  if (!/^[A-Z0-9]{6,22}$/.test(v)) throw new DuesError("invalid_input", "The UTR should be 6 to 22 letters or digits, e.g. 412345678901 for UPI.", "utr");
  return v;
}

function parsePaidOn(raw: string | null | undefined): string {
  const today = istToday();
  const d = raw ? String(raw).slice(0, 10) : today;
  if (!isValidDate(d)) throw new DuesError("invalid_input", "Payment date isn't valid. Use YYYY-MM-DD.", "paid_on");
  if (d > today) throw new DuesError("invalid_input", "Payment date can't be in the future.", "paid_on");
  return d;
}

async function afterPayment(ctx: Ctx, before: InvoiceRow) {
  const after = await findInvoice(ctx, before.id);
  if (after.status === "paid" && before.status !== "paid") {
    await logEvent({ ...ctx }, after.id, "paid", { total_paise: after.total_paise, tds_paise: after.tds_total_paise });
  }
  return after;
}

/** The freelancer (in the app) or Claude records money received. Confirmed immediately. */
export async function recordPayment(ctx: Ctx, ref: string, input: PaymentInput): Promise<{ invoice: InvoiceRow; payment: PaymentRow; message: string }> {
  const inv = await findInvoice(ctx, ref);
  assertAllowed(inv, "record_payment");
  if (input.amount_rupees == null || input.amount_rupees === "") throw new DuesError("invalid_input", "Enter the amount received.", "amount_rupees");
  const amount = rupeesToPaise(input.amount_rupees, "Amount received");
  const tds = input.tds_rupees == null || input.tds_rupees === "" ? 0 : rupeesToPaise(input.tds_rupees, "TDS");
  if (amount < 0 || tds < 0) throw new DuesError("invalid_input", "Amounts can't be negative.");
  if (amount + tds <= 0) throw new DuesError("invalid_input", "Enter an amount received or TDS more than ₹0.", "amount_rupees");
  if (amount + tds > inv.balance_paise + CLAIM_TOLERANCE_PAISE) {
    throw new DuesError(
      "overpayment",
      `That's more than the balance due. ${inv.number} has ${formatINR(inv.balance_paise)} left to pay, but this records ${formatINR(amount + tds)} (amount ${formatINR(amount)} + TDS ${formatINR(tds)}).`,
      "amount_rupees",
    );
  }
  const payment = check(
    await db().from("payments").insert({
      invoice_id: inv.id, user_id: ctx.userId, amount_paise: amount, tds_paise: tds,
      method: parseMethod(input.method), utr: parseUtr(input.utr, false), paid_on: parsePaidOn(input.paid_on),
      reported_by: ctx.actor === "claude" ? "claude" : "user", status: "confirmed", decided_at: new Date().toISOString(),
    }).select("*").single(),
  ) as PaymentRow;
  await logEvent(ctx, inv.id, "payment_recorded", { amount_paise: amount, tds_paise: tds, utr: payment.utr });
  const after = await afterPayment(ctx, inv);
  const message = after.status === "paid"
    ? `${inv.number} is now fully paid.`
    : `Recorded. ${inv.number} still has ${formatINR(after.balance_paise)} to pay.`;
  return { invoice: after, payment, message };
}

// ---------------------------------------------------------------------------
// Client-reported payments (public page, no login)
// ---------------------------------------------------------------------------

export async function getPublicInvoice(publicId: string) {
  if (!/^[0-9a-f]{32}$/.test(publicId)) return null;
  const { data } = await db().from("invoice_view").select("*").eq("public_id", publicId).neq("stage", "draft").maybeSingle();
  if (!data) return null;
  const [{ data: items }, { data: reports }] = await Promise.all([
    db().from("invoice_items").select("*").eq("invoice_id", data.id).order("position"),
    db().from("payments").select("id, amount_paise, utr, status, created_at").eq("invoice_id", data.id).eq("reported_by", "client").order("created_at", { ascending: false }),
  ]);
  return { invoice: data, items: items ?? [], reports: reports ?? [] };
}

export async function reportPaymentPublic(publicId: string, input: PaymentInput): Promise<{ ok: true } | { ok: false; field?: string; error: string }> {
  try {
    const found = await getPublicInvoice(publicId);
    if (!found) return { ok: false, error: "This invoice link isn't valid." };
    const inv = found.invoice as Record<string, unknown>;
    if (inv.stage === "cancelled") return { ok: false, error: "This invoice has been cancelled, so it can't take payments." };
    if (inv.status === "paid") return { ok: false, error: "This invoice is already marked as paid. Thank you!" };
    const pending = found.reports.filter((r) => r.status === "reported").length;
    if (pending >= 3) return { ok: false, error: "We already have payment reports waiting for the freelancer to confirm. They'll check soon." };
    if (input.amount_rupees == null || input.amount_rupees === "") return { ok: false, field: "amount_rupees", error: "Enter the amount you paid." };
    const amount = rupeesToPaise(input.amount_rupees, "Amount");
    if (amount <= 0) return { ok: false, field: "amount_rupees", error: "Enter the amount you paid." };
    if (amount > Number(inv.total_paise) + CLAIM_TOLERANCE_PAISE) {
      return { ok: false, field: "amount_rupees", error: `That's more than the invoice total of ${formatINR(Number(inv.total_paise))}. Check the amount.` };
    }
    const utr = parseUtr(input.utr, true);
    const ctx: Ctx = { userId: String(inv.user_id), actor: "client" };
    const { error } = await db().from("payments").insert({
      invoice_id: inv.id, user_id: ctx.userId, amount_paise: amount, tds_paise: 0,
      method: parseMethod(input.method), utr, paid_on: parsePaidOn(input.paid_on), reported_by: "client", status: "reported",
    });
    if (error) throw error;
    await logEvent(ctx, String(inv.id), "payment_reported", { amount_paise: amount, utr });
    return { ok: true };
  } catch (e) {
    if (e instanceof DuesError) return { ok: false, field: e.field, error: e.message };
    if (e instanceof Error && e.name === "InputError") return { ok: false, field: "amount_rupees", error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Reported payments across all invoices: the dashboard's "Needs your confirmation". */
export async function pendingReports(ctx: Ctx) {
  const rows = check(
    await db().from("payments").select("id, invoice_id, amount_paise, utr, paid_on, method, created_at").eq("user_id", ctx.userId).eq("status", "reported").order("created_at", { ascending: false }),
  ) as PaymentRow[];
  if (!rows.length) return [];
  const invs = check(
    await db().from("invoice_view").select("id, number, client_name, total_paise, subtotal_paise, balance_paise").in("id", [...new Set(rows.map((r) => r.invoice_id))]),
  ) as { id: string; number: string; client_name: string; total_paise: number; subtotal_paise: number; balance_paise: number }[];
  const byId = new Map(invs.map((i) => [i.id, i]));
  return rows.map((p) => {
    const inv = byId.get(p.invoice_id)!;
    const amount = Number(p.amount_paise);
    return {
      ...p,
      amount_paise: amount,
      number: inv?.number,
      client_name: inv?.client_name,
      total_paise: Number(inv?.total_paise),
      balance_paise: Number(inv?.balance_paise),
      tds_suggestion: inv ? suggestTds(Number(inv.subtotal_paise), Number(inv.balance_paise), amount) : null,
    };
  });
}

export async function decideReport(
  ctx: Ctx,
  paymentId: string,
  decision: "confirm" | "reject",
  adjust: { amount_rupees?: number | string | null; tds_rupees?: number | string | null } = {},
): Promise<{ invoice: InvoiceRow; message: string }> {
  const p = check(await db().from("payments").select("*").eq("id", paymentId).eq("user_id", ctx.userId).maybeSingle()) as PaymentRow | null;
  if (!p) throw new DuesError("not_found", "That payment report doesn't exist.");
  if (p.status !== "reported") throw new DuesError("not_allowed", `This report was already ${p.status}.`);
  const inv = await findInvoice(ctx, p.invoice_id);
  const now = new Date().toISOString();

  if (decision === "reject") {
    check(await db().from("payments").update({ status: "rejected", decided_at: now }).eq("id", p.id).eq("status", "reported"));
    await logEvent(ctx, inv.id, "payment_rejected", { amount_paise: Number(p.amount_paise), utr: p.utr });
    const after = await findInvoice(ctx, inv.id);
    return { invoice: after, message: `Report rejected. ${inv.number} is now "${after.status.replace("_", " ")}".` };
  }

  const amount = adjust.amount_rupees != null && adjust.amount_rupees !== "" ? rupeesToPaise(adjust.amount_rupees, "Amount") : Number(p.amount_paise);
  const tds = adjust.tds_rupees != null && adjust.tds_rupees !== "" ? rupeesToPaise(adjust.tds_rupees, "TDS") : 0;
  if (amount < 0 || tds < 0 || amount + tds <= 0) throw new DuesError("invalid_input", "Amounts must be more than ₹0.");
  if (amount + tds > inv.balance_paise + CLAIM_TOLERANCE_PAISE) {
    throw new DuesError("overpayment", `That's more than the balance due (${formatINR(inv.balance_paise)}). Check the amount and TDS.`);
  }
  const res = await db().from("payments").update({ status: "confirmed", decided_at: now, amount_paise: amount, tds_paise: tds }).eq("id", p.id).eq("status", "reported").select("id");
  if (!check(res)?.length) throw new DuesError("not_allowed", "This report was already handled.");
  await logEvent(ctx, inv.id, "payment_confirmed", { amount_paise: amount, tds_paise: tds, utr: p.utr, reported_amount_paise: Number(p.amount_paise) });
  const after = await afterPayment(ctx, inv);
  return {
    invoice: after,
    message: after.status === "paid" ? `Confirmed. ${inv.number} is fully paid.` : `Confirmed. ${formatINR(after.balance_paise)} still due on ${inv.number}.`,
  };
}

export function describePayment(p: PaymentRow) {
  return {
    amount: formatINR(Number(p.amount_paise)),
    tds: formatINR(Number(p.tds_paise)),
    method: p.method,
    utr: p.utr,
    paid_on: formatDate(p.paid_on),
    status: p.status,
  };
}
