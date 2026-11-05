import { workingDaysBetween } from "./dates";

// Mirrors the CASE in invoice_view (supabase/migrations/0004_trust_and_extensions.sql).
// The SQL view is the source of truth for reads; this is used for tests,
// for deciding which actions are allowed, and for labels.

export type Stage = "draft" | "issued" | "cancelled";
export type PaymentStatus = "reported" | "confirmed" | "rejected";
export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "overdue" | "paid" | "cancelled";

export type StatusInput = {
  stage: Stage;
  totalPaise: number;
  dueDate: string;
  today: string;
  payments: { status: PaymentStatus; amountPaise: number; tdsPaise: number }[];
};

/**
 * D16: status is decided by confirmed money only. A client's report is a separate
 * flag (`paymentReported`) and never changes whether an invoice is overdue.
 */
export function deriveStatus(i: StatusInput): { status: InvoiceStatus; balancePaise: number; daysOverdue: number; paymentReported: boolean } {
  const settled = i.payments.filter((p) => p.status === "confirmed").reduce((a, p) => a + p.amountPaise + p.tdsPaise, 0);
  const pending = i.payments.some((p) => p.status === "reported");
  const balancePaise = Math.max(i.totalPaise - settled, 0);
  const pastDue = i.dueDate < i.today;
  const daysOverdue =
    i.stage === "issued" && balancePaise > 0 && pastDue
      ? Math.round((Date.parse(i.today) - Date.parse(i.dueDate)) / 86400000)
      : 0;

  let status: InvoiceStatus;
  if (i.stage === "cancelled") status = "cancelled";
  else if (i.stage === "draft") status = "draft";
  else if (settled >= i.totalPaise) status = "paid";
  else if (pastDue) status = "overdue";
  else if (settled > 0) status = "partially_paid";
  else status = "sent";
  return { status, balancePaise, daysOverdue, paymentReported: pending && i.stage === "issued" && status !== "paid" };
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially paid",
  overdue: "Overdue",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const ALL_STATUSES = Object.keys(STATUS_LABEL) as InvoiceStatus[];

/** "Overdue · payment reported" */
export function statusText(status: InvoiceStatus, pendingReports: number): string {
  return pendingReports > 0 && status !== "paid" && status !== "cancelled" && status !== "draft"
    ? `${STATUS_LABEL[status]} · payment reported`
    : STATUS_LABEL[status];
}

/** D16: a client's report pauses chasing for 2 working days after the report date (IST). */
export const REPORT_PAUSE_WORKING_DAYS = 2;
export function isChasePaused(lastReportIstDate: string | null, today: string): boolean {
  if (!lastReportIstDate) return false;
  return workingDaysBetween(lastReportIstDate, today) <= REPORT_PAUSE_WORKING_DAYS;
}

// ---- Transitions (rule 5 and 6, adapted per DECISIONS.md D4) ---------------

export type Action =
  | "edit_items"      // line items, client, amounts, gst rate
  | "edit_notes_due"  // notes and due date
  | "confirm_totals"
  | "send"
  | "delete_draft"
  | "cancel"
  | "record_payment"
  | "client_report"
  | "decide_report"
  | "save_reminder";

export function allowedActions(a: {
  stage: Stage;
  status: InvoiceStatus;
  needsReview: boolean;
  pendingReports: number;
}): Set<Action> {
  const s = new Set<Action>();
  if (a.stage === "draft") {
    s.add("edit_items").add("edit_notes_due").add("delete_draft");
    if (a.needsReview) s.add("confirm_totals");
    else s.add("send");
    return s;
  }
  if (a.stage === "cancelled") return s;
  // issued
  s.add("edit_notes_due");
  if (a.status !== "paid") {
    s.add("cancel").add("record_payment").add("client_report").add("save_reminder");
  }
  if (a.pendingReports > 0) s.add("decide_report");
  return s;
}

export const ACTION_REFUSAL: Record<Action, string> = {
  edit_items:
    "This invoice has been sent, so its line items, client and amounts are locked. To change the amounts, cancel it and create a new invoice. You can still change the notes and due date.",
  edit_notes_due: "This invoice is cancelled and can't be changed.",
  confirm_totals: "There's nothing to confirm: the totals on this invoice aren't flagged.",
  send: "This invoice can't be sent.",
  delete_draft: "Only drafts can be deleted. A sent invoice keeps its number; cancel it instead.",
  cancel: "Only sent invoices that aren't fully paid can be cancelled.",
  record_payment: "Payments can only be recorded on sent invoices that still have a balance.",
  client_report: "This invoice isn't accepting payment reports.",
  decide_report: "There's no payment report waiting on this invoice.",
  save_reminder: "Reminders can only be saved for sent invoices that still have a balance.",
};

// ---- Reminder stages (D19) -------------------------------------------------

export type ReminderStage = 1 | 2 | 3;
export const STAGE_LABEL: Record<ReminderStage, string> = { 1: "Stage 1 · friendly", 2: "Stage 2 · firm", 3: "Stage 3 · final" };
export const STAGE_AT_DAYS: Record<ReminderStage, number> = { 1: 3, 2: 7, 3: 14 };

/** Highest stage reached by days overdue (+3/+7/+14) that hasn't been saved yet; null if none due. */
export function nextReminderStage(daysOverdue: number, highestSaved: number | null): ReminderStage | null {
  const reached = daysOverdue >= 14 ? 3 : daysOverdue >= 7 ? 2 : daysOverdue >= 3 ? 1 : 0;
  if (reached === 0) return null;
  return reached > (highestSaved ?? 0) ? (reached as ReminderStage) : null;
}
