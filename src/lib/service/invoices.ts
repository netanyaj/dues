import { GST_RATES, stateName, type GstRate } from "@/lib/domain/gst";
import { formatINR, parseQtyMilli, qtyMilliToString, rupeesToPaise } from "@/lib/domain/money";
import { checkClaimedTotal, computeTotals } from "@/lib/domain/tax";
import { addDays, daysBetween, formatDate, istToday, isValidDate } from "@/lib/domain/dates";
import { ACTION_REFUSAL, allowedActions, statusText, type Action, type InvoiceStatus, type Stage } from "@/lib/domain/status";
import { appUrl, check, cleanText, db, DuesError, fromDb, logEvent, type Ctx } from "./core";
import { getProfile, hasBankDetails, setupGaps, type Profile } from "./profile";
import { findClientByName, getClient, upsertClient, type Client } from "./clients";

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
  last_report_at: string | null;
  days_overdue: number;
  original_due_date: string | null;
  ready_to_send_at: string | null;
  view_count: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
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
  proof_path?: string | null;
};

export type EventRow = { id: number; actor: string; type: string; payload: Record<string, unknown>; created_at: string };
export type ReminderRow = { id: string; message: string; channel: "whatsapp" | "email"; stage: number | null; created_by: string; created_at: string; sent_marked_at: string | null };

export type ItemInput = { description?: string | null; qty?: number | string | null; rate_rupees?: number | string | null; sac?: string | null };

export type DraftInput = {
  client_id?: string | null;
  client_name?: string | null;
  /** D21: details for creating the client in the same step (state is required for a new client). */
  client_state?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_gstin?: string | null;
  client_address?: string | null;
  /** D23: set true to create an identical draft on purpose. */
  allow_duplicate?: boolean | null;
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

export type ListFilters = { status?: InvoiceStatus | "outstanding" | "payment_reported" | null; client?: string | null; q?: string | null; limit?: number };

export async function listInvoices(ctx: Ctx, f: ListFilters = {}): Promise<InvoiceRow[]> {
  let q = db().from("invoice_view").select("*").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(Math.min(Math.max(f.limit ?? 100, 1), 500));
  if (f.status === "outstanding") q = q.in("status", ["sent", "partially_paid", "overdue"]);
  else if (f.status === "payment_reported") q = q.gt("pending_reports", 0).in("status", ["sent", "partially_paid", "overdue"]);
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

async function resolveClient(ctx: Ctx, input: DraftInput, warnings: string[]): Promise<Client> {
  if (input.client_id) {
    const c = await getClient(ctx, input.client_id);
    if (c) return c;
    throw new DuesError("client_not_found", `No client with id "${input.client_id}". Pass client_name (and client_state for a new client) instead.`, "client_id");
  }
  const name = cleanText(input.client_name, 120);
  if (!name) throw new DuesError("invalid_input", "Say which client this invoice is for (client_name).", "client_id");
  // D21: find or create the client in this same step. Existing clients only get blank fields filled (D24).
  const existing = await findClientByName(ctx, name);
  const extra = { email: input.client_email, phone: input.client_phone, gstin: input.client_gstin, address: input.client_address };
  const hasExtra = Object.values(extra).some((v) => v != null && v !== "") || !!input.client_state;
  if (!existing && !input.client_state && !input.client_gstin) {
    throw new DuesError(
      "client_state_needed",
      `"${name}" is a new client. Add client_state (their state name, e.g. "Karnataka", or 2-digit GST code) and Dues will create them with this invoice. Email, phone and GSTIN are optional.`,
      "client_state",
    );
  }
  if (existing && !hasExtra) return existing;
  const r = await upsertClient(ctx, { name, state_code: input.client_state ?? null, ...extra });
  if (r.created) warnings.push(`Created a new client, ${r.client.name} (${stateName(r.client.state_code)}).`);
  if (r.kept.length) warnings.push(`Kept ${r.client.name}'s saved ${r.kept.join(", ")}. To change saved details, edit the client in the Dues app.`);
  return r.client;
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
  const warnings: string[] = [];
  const client = await resolveClient(ctx, input, warnings);

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

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

/** D23: a draft identical to this one (same client, rate, items, total) from the last 10 minutes, if any. */
async function findRecentDuplicate(ctx: Ctx, p: Prepared): Promise<string | null> {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await db().from("invoices").select("id").eq("user_id", ctx.userId).eq("client_id", p.client.id).eq("stage", "draft")
    .eq("gst_rate", p.gstRate).eq("total_paise", p.totals.total).gte("created_at", since).order("created_at", { ascending: false }).limit(5);
  const want = p.items.map((i) => `${norm(i.description)}|${i.qtyMilli}|${i.rate_paise}`).join("\n");
  for (const row of data ?? []) {
    const { data: items } = await db().from("invoice_items").select("description, qty, rate_paise").eq("invoice_id", row.id).order("position");
    const have = (items ?? []).map((i) => `${norm(i.description)}|${parseQtyMilli(String(i.qty))}|${Number(i.rate_paise)}`).join("\n");
    if (have === want) return row.id;
  }
  return null;
}

export const DUPLICATE_NOTE = "This invoice was already created a moment ago; returning the existing draft. Pass allow_duplicate: true if you really want a second identical invoice.";

export async function createDraft(ctx: Ctx, input: DraftInput): Promise<DraftResult & { duplicate?: boolean }> {
  const profile = await getProfile(ctx);
  const p = await prepareDraft(ctx, profile, input, null);
  if (!input.allow_duplicate) {
    const dup = await findRecentDuplicate(ctx, p);
    if (dup) return { invoice: await findInvoice(ctx, dup), warnings: [DUPLICATE_NOTE], duplicate: true };
  }
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
  // The freelancer already confirmed this total (flag off, reason kept). Saving again without
  // changing the total, or a new claim, must not raise the flag again.
  const confirmedEarlier = !invoice.needs_review && invoice.review_reason != null;
  if (confirmedEarlier && p.review.needsReview && p.totals.total === invoice.total_paise && patch.expected_total_rupees == null) {
    p.review = { needsReview: false, reason: invoice.review_reason };
  }
  // D55: a flagged draft is only cleared by a real change (total, GST rate or client) whose new
  // total matches, or by the freelancer's Confirm totals. Re-sending expected_total alone, even a
  // matching one, must not clear it: otherwise Claude could clear its own flag by restating a number.
  const realChange = p.totals.total !== invoice.total_paise || p.gstRate !== invoice.gst_rate || p.client.id !== invoice.client_id;
  if (invoice.needs_review && !p.review.needsReview && !realChange) {
    p.review = { needsReview: true, reason: invoice.review_reason };
  }
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

/**
 * D24: Claude can flag a draft as ready; only a person pressing Send in the app issues it.
 * No number, no lock, no public link.
 */
export async function markReadyToSend(ctx: Ctx, ref: string): Promise<InvoiceRow> {
  const inv = await findInvoice(ctx, ref);
  if (inv.stage !== "draft") throw new DuesError("not_allowed", `This invoice was already sent as ${inv.number}.`);
  if (inv.needs_review) {
    throw new DuesError("needs_review", `The totals are flagged (${inv.review_reason}). Fix the line items with update_draft_invoice, or the freelancer can confirm the totals in the app: ${editUrl(inv.id)}`);
  }
  check(await db().from("invoices").update({ ready_to_send_at: new Date().toISOString() }).eq("id", inv.id).eq("user_id", ctx.userId).eq("stage", "draft"));
  await logEvent(ctx, inv.id, "marked_ready", {});
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
  // D35: never issue an invoice the client can't pay. Checked here, not only in the UI.
  const profile = await getProfile(ctx);
  const gaps = setupGaps(profile);
  if (gaps.length) throw new DuesError("setup_incomplete", `Add your ${gaps.join(", ")} in Settings before sending.`);
  if (!hasBankDetails(profile)) throw new DuesError("bank_details_required", "Add your bank account before sending, so your client can pay you.");
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

/**
 * After sending, only notes and the due date can change (rule 5).
 * D18: the due date can only be extended, with a reason; original_due_date never changes.
 */
export async function updateIssuedDetails(ctx: Ctx, ref: string, patch: { notes?: string | null; due_date?: string | null; reason?: string | null }): Promise<InvoiceRow> {
  const inv = await findInvoice(ctx, ref);
  assertAllowed(inv, "edit_notes_due");
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const events: [string, Record<string, unknown>][] = [];
  if (patch.due_date && patch.due_date !== inv.due_date) {
    const d = String(patch.due_date).slice(0, 10);
    if (!isValidDate(d)) throw new DuesError("invalid_input", "That due date isn't valid. Use YYYY-MM-DD.", "due_date");
    if (d < inv.due_date) {
      throw new DuesError("invalid_input", `A sent invoice's due date can only be extended, not brought forward (currently ${formatDate(inv.due_date)}).`, "due_date");
    }
    const reason = cleanText(patch.reason, 200);
    if (!reason) throw new DuesError("invalid_input", "Add a short reason for the extension, e.g. \"Client asked for 30 days\".", "reason");
    update.due_date = d;
    events.push(["due_date_extended", { from: inv.due_date, to: d, original: inv.original_due_date, reason }]);
  }
  if (patch.notes !== undefined) {
    const n = cleanText(patch.notes, 1000);
    if (n !== inv.notes) { update.notes = n; events.push(["notes_updated", {}]); }
  }
  if (events.length === 0) return inv;
  check(await db().from("invoices").update(update).eq("id", inv.id).eq("user_id", ctx.userId));
  for (const [type, payload] of events) await logEvent(ctx, inv.id, type, payload);
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
    status_label: statusText(inv.status, inv.pending_reports),
    payment_reported_unconfirmed: inv.pending_reports > 0,
    client: inv.client_name,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    original_due_date: inv.original_due_date ?? undefined,
    days_overdue: inv.days_overdue,
    subtotal: r(inv.subtotal_paise),
    tax,
    total: r(inv.total_paise),
    paid_so_far: r(inv.confirmed_paise),
    tds_deducted: r(inv.tds_total_paise),
    balance_due: r(inv.balance_paise),
    needs_review: inv.needs_review,
    review_reason: inv.needs_review ? inv.review_reason : null,
    ready_to_send: inv.stage === "draft" ? !!inv.ready_to_send_at : undefined,
    // D37: opens of the client page, excluding the freelancer and link-preview bots.
    client_views: inv.stage === "draft" ? undefined : { count: inv.view_count ?? 0, first_viewed_at: inv.first_viewed_at ?? null, last_viewed_at: inv.last_viewed_at ?? null },
    created_by: inv.source,
    notes: inv.notes,
    items: items?.map((i) => ({ description: i.description, sac: i.sac, qty: String(i.qty), rate: r(i.rate_paise), amount: r(i.amount_paise) })),
    edit_url: editUrl(inv.id),
    public_url: publicUrl(inv.public_id),
    place_of_supply: inv.buyer_snapshot?.state_code ? stateName(inv.buyer_snapshot.state_code) : undefined,
  };
}
