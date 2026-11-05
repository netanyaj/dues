import { GST_RATES, stateName, type GstRate } from "@/lib/domain/gst";
import { formatINR, parseQtyMilli, qtyMilliToString, rupeesToPaise } from "@/lib/domain/money";
import { checkClaimedTotal, computeTotals } from "@/lib/domain/tax";
import { addDays, daysBetween, formatDate, istToday, isValidDate } from "@/lib/domain/dates";
import { ACTION_REFUSAL, allowedActions, STATUS_LABEL, type Action, type InvoiceStatus, type Stage } from "@/lib/domain/status";
import { appUrl, check, cleanText, db, DuesError, fromDb, logEvent, type Ctx } from "./core";
import { getProfile, type Profile } from "./profile";
import { findClientByName, getClient, type Client } from "./clients";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvoiceRow = {
  id: string;
  user_id: string;
  client_id: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  stage: Stage;
  status: InvoiceStatus;
  number: string | null;
  fy: string | null;
  seq: number | null;
  needs_review: boolean;
  review_reason: string | null;
  issue_date: string;
  due_date: string;
  gst_rate: GstRate;
  gst_applicable: boolean;
  subtotal_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_paise: number;
  claimed_total_paise: number | null;
  confirmed_paise: number;
  tds_total_paise: number;
  balance_paise: number;
  pending_reports: number;
  days_overdue: number;
  public_id: string | null;
  notes: string | null;
  source: "claude" | "app";
  seller_snapshot: Record<string, string | null> | null;
  buyer_snapshot: Record<string, string | null> | null;
  issued_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ItemRow = {
  id: string;
  position: number;
  description: string;
  sac: string;
  qty: string | number;
  rate_paise: number;
  amount_paise: number;
};

export type PaymentRow = {
  id: string;
  invoice_id: string;
  amount_paise: number;
  tds_paise: number;
  method: "upi" | "bank_transfer" | "other";
  utr: string | null;
  paid_on: string;
  reported_by: "client" | "user" | "claude";
  status: "reported" | "confirmed" | "rejected";
  decided_at: string | null;
  created_at: string;
};

export type EventRow = { id: number; actor: string; type: string; payload: Record<string, unknown>; created_at: string };
export type ReminderRow = { id: string; message: string; channel: "whatsapp" | "email"; created_by: string; created_at: string; sent_marked_at: string | null };

export type ItemInput = { description?: string | null; qty?: number | string | null; rate_rupees?: number | string | null; sac?: string | null };

export type DraftInput = {
  client_id?: string | null;
  client_name?: string | null;
  items?: ItemInput[];
  gst_rate?: number | string | null;
  issue_date?: string | null;
  due_date?: string | null;
  due_in_days?: number | string | null;
  notes?: string | null;
  expected_total_rupees?: number | string | null;
};

const NUM = (v: unknown) => Number(v ?? 0);

function normaliseRow(r: Record<string, unknown>): InvoiceRow {
  const n = r as unknown as InvoiceRow;
  for (const k of ["subtotal_paise", "cgst_paise", "sgst_paise", "igst_paise", "total_paise", "confirmed_paise", "tds_total_paise", "balance_paise", "pending_reports", "days_overdue"] as const) {
    (n as Record<string, unknown>)[k] = NUM(r[k]);
  }
  if (r.claimed_total_paise != null) n.claimed_total_paise = NUM(r.claimed_total_paise);
  return n;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Find by UUID or by full invoice number (case-insensitive). */
export async function findInvoice(ctx: Ctx, ref: string): Promise<InvoiceRow> {
  const r = String(ref ?? "").trim();
  if (!r) throw new DuesError("invoice_not_found", "Give an invoice ID or number.");
  const q = db().from("invoice_view").select("*").eq("user_id", ctx.userId);
  const { data, error } = UUID.test(r) ? await q.eq("id", r).maybeSingle() : await q.eq("number", r.toUpperCase()).maybeSingle();
  if (error) fromDb(error);
  if (!data) {
    throw new DuesError(
      "invoice_not_found",
      `No invoice found for "${r}". Drafts have no number yet; use the draft's id. Use list_invoices to see IDs and numbers.`,
    );
  }
  return normaliseRow(data);
}

export async function getInvoiceDetail(ctx: Ctx, id: string) {
  const inv = await findInvoice(ctx, id);
  const [items, payments, events, reminders] = await Promise.all([
    db().from("invoice_items").select("*").eq("invoice_id", inv.id).order("position"),
    db().from("payments").select("*").eq("invoice_id", inv.id).order("created_at"),
    db().from("events").select("id, actor, type, payload, created_at").eq("invoice_id", inv.id).order("created_at"),
    db().from("reminders").select("*").eq("invoice_id", inv.id).order("created_at", { ascending: false }),
  ]);
  return {
    invoice: inv,
    items: (check(items) ?? []).map((i: ItemRow) => ({ ...i, rate_paise: NUM(i.rate_paise), amount_paise: NUM(i.amount_paise) })) as ItemRow[],
    payments: (check(payments) ?? []).map((p: PaymentRow) => ({ ...p, amount_paise: NUM(p.amount_paise), tds_paise: NUM(p.tds_paise) })) as PaymentRow[],
    events: check(events) as EventRow[],
    reminders: check(reminders) as ReminderRow[],
  };
}

export type ListFilters = { status?: InvoiceStatus | "outstanding" | null; client?: string | null; q?: string | null; limit?: number };

export async function listInvoices(ctx: Ctx, f: ListFilters = {}): Promise<InvoiceRow[]> {
  let q = db().from("invoice_view").select("*").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(Math.min(Math.max(f.limit ?? 100, 1), 500));
  if (f.status === "outstanding") q = q.in("status", ["sent", "partially_paid", "overdue", "payment_reported"]);
  else if (f.status) q = q.eq("status", f.status);
  if (f.client) {
    if (UUID.test(f.client)) q = q.eq("client_id", f.client);
    else q = q.ilike("client_name", `%${f.client.replace(/[%_\\]/g, "\\$&")}%`);
  }
  if (f.q) {
    const s = f.q.replace(/[%_\\,()]/g, " ").trim();
    if (s) q = q.or(`number.ilike.%${s}%,client_name.ilike.%${s}%,notes.ilike.%${s}%`);
  }
  return (check(await q) as Record<string, unknown>[]).map(normaliseRow);
}

export function assertAllowed(inv: InvoiceRow, action: Action) {
  const allowed = allowedActions({ stage: inv.stage, status: inv.status, needsReview: inv.needs_review, pendingReports: inv.pending_reports });
  if (!allowed.has(action)) {
    let msg = ACTION_REFUSAL[action];
    if (action === "send" && inv.stage === "draft" && inv.needs_review) {
      msg = `The totals are flagged for review (${inv.review_reason}). The freelancer must open the invoice in Dues and click "Confirm totals" before it can be sent.`;
    } else if (action === "send" && inv.stage !== "draft") msg = `This invoice was already sent as ${inv.number}.`;
    else if (action === "edit_items" && inv.stage === "cancelled") msg = "This invoice is cancelled and can't be changed.";
    else if (action === "cancel" && inv.stage === "draft") msg = "Drafts aren't cancelled; delete the draft instead. It has no invoice number yet.";
    else if (action === "cancel" && inv.status === "paid") msg = "This invoice is fully paid and can't be cancelled.";
    throw new DuesError("not_allowed", msg);
  }
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

type Prepared = {
  client: Client;
  items: { description: string; sac: string; qty: string; qtyMilli: number; rate_paise: number; amount_paise: number }[];
  gstRate: GstRate;
  gstApplicable: boolean;
  issueDate: string;
  dueDate: string;
  notes: string | null;
  claimedPaise: number | null;
  totals: ReturnType<typeof computeTotals>;
  review: { needsReview: boolean; reason: string | null };
  warnings: string[];
};

async function resolveClient(ctx: Ctx, input: DraftInput): Promise<Client> {
  if (input.client_id) {
    const c = await getClient(ctx, input.client_id);
    if (c) return c;
    throw new DuesError("client_not_found", `No client with id "${input.client_id}". Call upsert_client first, or pass client_name.`);
  }
  if (input.client_name) {
    const c = await findClientByName(ctx, input.client_name);
    if (c) return c;
    throw new DuesError(
      "client_not_found",
      `There's no client called "${input.client_name}" yet. Call upsert_client first with name, state_code (state name or 2-digit GST code; required), and optionally email, phone, address and gstin. Then call create_invoice again.`,
    );
  }
  throw new DuesError("invalid_input", "Say which client this invoice is for (client_name or client_id).", "client_id");
}

function prepareDates(input: DraftInput, fallbackIssue: string, fallbackTerms: number | null) {
  const issueDate = input.issue_date ? String(input.issue_date).slice(0, 10) : fallbackIssue;
  if (!isValidDate(issueDate)) throw new DuesError("invalid_input", `issue_date "${input.issue_date}" isn't a valid date. Use YYYY-MM-DD.`, "issue_date");
  let dueDate: string;
  if (input.due_date) {
    dueDate = String(input.due_date).slice(0, 10);
    if (!isValidDate(dueDate)) throw new DuesError("invalid_input", `due_date "${input.due_date}" isn't a valid date. Use YYYY-MM-DD.`, "due_date");
  } else if (input.due_in_days != null && input.due_in_days !== "") {
    const d = Number(input.due_in_days);
    if (!Number.isInteger(d) || d < 0 || d > 365) throw new DuesError("invalid_input", "due_in_days must be a whole number from 0 to 365.", "due_date");
    dueDate = addDays(issueDate, d);
  } else {
    dueDate = addDays(issueDate, fallbackTerms ?? 15);
  }
  if (dueDate < issueDate) throw new DuesError("invalid_input", `The due date (${formatDate(dueDate)}) can't be before the issue date (${formatDate(issueDate)}).`, "due_date");
  return { issueDate, dueDate };
}

async function prepareDraft(ctx: Ctx, profile: Profile, input: DraftInput, prev: { issueDate: string; terms: number; claimed: number | null } | null): Promise<Prepared> {
  if (!profile.state_code) {
    throw new DuesError("profile_incomplete", "Set your business state in Dues Settings first. It's needed to work out CGST/SGST vs IGST.");
  }
  const client = await resolveClient(ctx, input);
  const warnings: string[] = [];

  const rawItems = input.items ?? [];
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new DuesError("invalid_input", "Add at least one line item (description, qty, rate_rupees).", "items");
  if (rawItems.length > 50) throw new DuesError("invalid_input", "An invoice can have at most 50 line items.", "items");
  const items = rawItems.map((it, i) => {
    const n = i + 1;
    const description = cleanText(it?.description, 300);
    if (!description) throw new DuesError("invalid_input", `Line ${n}: add a description.`, `items.${i}.description`);
    if (it?.qty == null || it.qty === "") throw new DuesError("invalid_input", `Line ${n}: add a quantity.`, `items.${i}.qty`);
    const qtyMilli = parseQtyMilli(it.qty, `Line ${n} quantity`);
    if (qtyMilli <= 0) throw new DuesError("invalid_input", `Line ${n}: quantity must be more than 0.`, `items.${i}.qty`);
    if (qtyMilli > 1_000_000_000) throw new DuesError("invalid_input", `Line ${n}: quantity is too large.`, `items.${i}.qty`);
    if (it?.rate_rupees == null || it.rate_rupees === "") throw new DuesError("invalid_input", `Line ${n}: add a rate in rupees.`, `items.${i}.rate_rupees`);
    const ratePaise = rupeesToPaise(it.rate_rupees, `Line ${n} rate`);
    if (ratePaise < 0) throw new DuesError("invalid_input", `Line ${n}: rate can't be negative.`, `items.${i}.rate_rupees`);
    if (ratePaise > 10_00_00_000_00) throw new DuesError("invalid_input", `Line ${n}: rate is too large.`, `items.${i}.rate_rupees`);
    const sac = (cleanText(it?.sac, 8) ?? profile.default_sac).replace(/\s/g, "");
    if (!/^[0-9]{4,8}$/.test(sac)) throw new DuesError("invalid_input", `Line ${n}: SAC code "${sac}" should be 4 to 8 digits, e.g. 998391.`, `items.${i}.sac`);
    return { description, sac, qtyMilli, qty: qtyMilliToString(qtyMilli), rate_paise: ratePaise, amount_paise: 0 };
  });

  const rateNum = Number(input.gst_rate ?? (profile.gstin ? NaN : 0));
  if (!GST_RATES.includes(rateNum as GstRate)) {
    throw new DuesError("invalid_input", `gst_rate must be one of 0, 5, 12, 18 or 28 (got "${input.gst_rate ?? ""}").`, "gst_rate");
  }
  let gstRate = rateNum as GstRate;
  const gstApplicable = !!profile.gstin;
  if (!gstApplicable && gstRate > 0) {
    warnings.push(`You're not GST-registered (no GSTIN in your profile), so no GST was added. The invoice says "GST not applicable".`);
    gstRate = 0;
  }

  const { issueDate, dueDate } = prepareDates(input, prev?.issueDate ?? istToday(), prev?.terms ?? null);

  let notes: string | null;
  try { notes = cleanText(input.notes, 1000); } catch { throw new DuesError("invalid_input", "Notes can be at most 1000 characters.", "notes"); }

  const totals = computeTotals({
    lines: items.map((i) => ({ qtyMilli: i.qtyMilli, ratePaise: i.rate_paise })),
    gstRate,
    supplierState: profile.state_code,
    clientState: client.state_code,
    supplierHasGstin: gstApplicable,
  });
  items.forEach((it, i) => (it.amount_paise = totals.lineAmounts[i]));
  if (totals.total > 100_00_00_000_00) throw new DuesError("invalid_input", "That invoice total is too large.");

  let claimedPaise: number | null = prev?.claimed ?? null;
  if (input.expected_total_rupees != null && input.expected_total_rupees !== "") {
    claimedPaise = rupeesToPaise(input.expected_total_rupees, "expected_total_rupees");
  }
  const review = checkClaimedTotal(totals.total, claimedPaise);

  return { client, items, gstRate, gstApplicable, issueDate, dueDate, notes, claimedPaise, totals, review, warnings };
}

async function writeDraft(ctx: Ctx, id: string | null, p: Prepared, source: "claude" | "app"): Promise<string> {
  const { data, error } = await db().rpc("save_draft", {
    p_user: ctx.userId,
    p_invoice: {
      id: id ?? "",
      client_id: p.client.id,
      issue_date: p.issueDate,
      due_date: p.dueDate,
      gst_rate: p.gstRate,
      gst_applicable: p.gstApplicable,
      subtotal_paise: p.totals.subtotal,
      cgst_paise: p.totals.cgst,
      sgst_paise: p.totals.sgst,
      igst_paise: p.totals.igst,
      total_paise: p.totals.total,
      claimed_total_paise: p.claimedPaise ?? "",
      needs_review: p.review.needsReview,
      review_reason: p.review.reason,
      notes: p.notes,
      source,
    },
    p_items: p.items.map(({ description, sac, qty, rate_paise, amount_paise }) => ({ description, sac, qty, rate_paise, amount_paise })),
  });
  if (error) fromDb(error);
  return data as string;
}

export type DraftResult = { invoice: InvoiceRow; warnings: string[] };

export async function createDraft(ctx: Ctx, input: DraftInput): Promise<DraftResult> {
  const profile = await getProfile(ctx);
  const p = await prepareDraft(ctx, profile, input, null);
  const source = ctx.actor === "claude" ? "claude" : "app";
  const id = await writeDraft(ctx, null, p, source);
  await logEvent(ctx, id, "draft_created", { total_paise: p.totals.total, items: p.items.length });
  if (p.review.needsReview) await logEvent(ctx, id, "flagged_for_review", { reason: p.review.reason });
  return { invoice: await findInvoice(ctx, id), warnings: p.warnings };
}

/**
 * Update a draft. Fields not given keep their current values. If items change and
 * no new expected total is given, the earlier claim is re-checked against the new total.
 */
export async function updateDraft(ctx: Ctx, ref: string, patch: DraftInput): Promise<DraftResult> {
  const { invoice, items } = await getInvoiceDetail(ctx, ref);
  assertAllowed(invoice, "edit_items");
  const profile = await getProfile(ctx);
  const merged: DraftInput = {
    client_id: patch.client_id ?? (patch.client_name ? null : invoice.client_id),
    client_name: patch.client_name ?? null,
    items: patch.items ?? items.map((i) => ({ description: i.description, qty: String(i.qty), rate_rupees: (i.rate_paise / 100).toFixed(2), sac: i.sac })),
    gst_rate: patch.gst_rate ?? invoice.gst_rate,
    issue_date: patch.issue_date ?? invoice.issue_date,
    due_date: patch.due_date ?? (patch.due_in_days != null ? null : patch.issue_date ? null : invoice.due_date),
    due_in_days: patch.due_in_days ?? null,
    notes: patch.notes !== undefined ? patch.notes : invoice.notes,
    expected_total_rupees: patch.expected_total_rupees ?? null,
  };
  const terms = daysBetween(invoice.issue_date, invoice.due_date);
  const p = await prepareDraft(ctx, profile, merged, { issueDate: invoice.issue_date, terms, claimed: invoice.claimed_total_paise });
  await writeDraft(ctx, invoice.id, p, invoice.source);
  await logEvent(ctx, invoice.id, "draft_updated", { total_paise: p.totals.total, previous_total_paise: invoice.total_paise });
  if (p.review.needsReview && !invoice.needs_review) await logEvent(ctx, invoice.id, "flagged_for_review", { reason: p.review.reason });
  if (!p.review.needsReview && invoice.needs_review) await logEvent(ctx, invoice.id, "review_cleared", { reason: "totals now match" });
  return { invoice: await findInvoice(ctx, invoice.id), warnings: p.warnings };
}

export async function confirmTotals(ctx: Ctx, ref: string): Promise<InvoiceRow> {
  const inv = await findInvoice(ctx, ref);
  assertAllowed(inv, "confirm_totals");
  check(await db().from("invoices").update({ needs_review: false, updated_at: new Date().toISOString() }).eq("id", inv.id).eq("user_id", ctx.userId).eq("stage", "draft"));
  await logEvent(ctx, inv.id, "totals_confirmed", { total_paise: inv.total_paise, claimed_total_paise: inv.claimed_total_paise, reason: inv.review_reason });
  return findInvoice(ctx, inv.id);
}

export async function deleteDraft(ctx: Ctx, ref: string): Promise<void> {
  const inv = await findInvoice(ctx, ref);
  assertAllowed(inv, "delete_draft");
  check(await db().from("invoices").delete().eq("id", inv.id).eq("user_id", ctx.userId).eq("stage", "draft"));
}

// ---------------------------------------------------------------------------
// Send, cancel, post-send edits
// ---------------------------------------------------------------------------

export async function sendInvoice(ctx: Ctx, ref: string): Promise<InvoiceRow> {
  const inv = await findInvoice(ctx, ref);
  assertAllowed(inv, "send");
  const { error } = await db().rpc("issue_invoice", { p_user: ctx.userId, p_invoice: inv.id, p_today: istToday(), p_actor: ctx.actor });
  if (error) fromDb(error);
  return findInvoice(ctx, inv.id);
}

export async function cancelInvoice(ctx: Ctx, ref: string, reason?: string | null): Promise<InvoiceRow> {
  const inv = await findInvoice(ctx, ref);
  assertAllowed(inv, "cancel");
  const r = cleanText(reason, 300);
  check(await db().from("invoices").update({ stage: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", inv.id).eq("user_id", ctx.userId).eq("stage", "issued"));
  // Any unconfirmed client reports are closed out.
  await db().from("payments").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("invoice_id", inv.id).eq("status", "reported");
  await logEvent(ctx, inv.id, "cancelled", { number: inv.number, reason: r });
  return findInvoice(ctx, inv.id);
}

/** After sending, only notes and the due date can change (rule 5). */
export async function updateIssuedDetails(ctx: Ctx, ref: string, patch: { notes?: string | null; due_date?: string | null }): Promise<InvoiceRow> {
  const inv = await findInvoice(ctx, ref);
  assertAllowed(inv, "edit_notes_due");
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const changed: Record<string, unknown> = {};
  if (patch.due_date !== undefined && patch.due_date !== null && patch.due_date !== inv.due_date) {
    const d = String(patch.due_date).slice(0, 10);
    if (!isValidDate(d)) throw new DuesError("invalid_input", "That due date isn't valid. Use YYYY-MM-DD.", "due_date");
    if (d < inv.issue_date) throw new DuesError("invalid_input", `The due date can't be before the issue date (${formatDate(inv.issue_date)}).`, "due_date");
    update.due_date = d;
    changed.due_date = { from: inv.due_date, to: d };
  }
  if (patch.notes !== undefined) {
    const n = cleanText(patch.notes, 1000);
    if (n !== inv.notes) { update.notes = n; changed.notes = true; }
  }
  if (Object.keys(changed).length === 0) return inv;
  check(await db().from("invoices").update(update).eq("id", inv.id).eq("user_id", ctx.userId));
  await logEvent(ctx, inv.id, "details_updated", changed);
  return findInvoice(ctx, inv.id);
}

// ---------------------------------------------------------------------------
// Presenting an invoice to Claude (plain values, rupees as text)
// ---------------------------------------------------------------------------

export function editUrl(id: string) {
  return `${appUrl()}/invoices/${id}`;
}
export function publicUrl(publicId: string | null) {
  return publicId ? `${appUrl()}/i/${publicId}` : null;
}

const r = (p: number) => formatINR(p);

export function describeInvoice(inv: InvoiceRow, items?: ItemRow[]) {
  const tax = !inv.gst_applicable
    ? { note: "GST not applicable (supplier has no GSTIN)" }
    : inv.gst_rate === 0
      ? { note: "GST at 0%" }
      : inv.igst_paise > 0
        ? { igst: r(inv.igst_paise), type: `IGST ${inv.gst_rate}% (client in another state)` }
        : { cgst: r(inv.cgst_paise), sgst: r(inv.sgst_paise), type: `CGST ${inv.gst_rate / 2}% + SGST ${inv.gst_rate / 2}% (same state)` };
  return {
    id: inv.id,
    number: inv.number ?? null,
    label: inv.number ?? `Draft · ${formatDate(inv.created_at.slice(0, 10))}`,
    status: inv.status,
    status_label: STATUS_LABEL[inv.status],
    client: inv.client_name,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    days_overdue: inv.days_overdue,
    subtotal: r(inv.subtotal_paise),
    tax,
    total: r(inv.total_paise),
    paid_so_far: r(inv.confirmed_paise),
    tds_deducted: r(inv.tds_total_paise),
    balance_due: r(inv.balance_paise),
    needs_review: inv.needs_review,
    review_reason: inv.needs_review ? inv.review_reason : null,
    created_by: inv.source,
    notes: inv.notes,
    items: items?.map((i) => ({ description: i.description, sac: i.sac, qty: String(i.qty), rate: r(i.rate_paise), amount: r(i.amount_paise) })),
    edit_url: editUrl(inv.id),
    public_url: publicUrl(inv.public_id),
    place_of_supply: inv.buyer_snapshot?.state_code ? stateName(inv.buyer_snapshot.state_code) : undefined,
  };
}
