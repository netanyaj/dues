// Turns service-layer rows into what screens show. No business rules here.
import type { DocData, DocParty } from "@/components/invoice-document";
import { formatINR } from "@/lib/domain/money";
import { msmeLine } from "@/lib/domain/gst";
import { STAGE_LABEL, type ReminderStage } from "@/lib/domain/status";
import { formatDate, formatDateTime } from "@/lib/domain/dates";

/** D37: "Viewed 3 times · last 6 Nov, 2:14 pm", or "Not opened yet". */
export function viewedText(count: number | null | undefined, last: string | null | undefined): string {
  if (!count) return "Not opened yet";
  return `Viewed ${count} time${count === 1 ? "" : "s"}${last ? ` · last ${formatDateTime(last)}` : ""}`;
}
import type { Client } from "@/lib/service/clients";
import type { EventRow, InvoiceRow, ItemRow } from "@/lib/service/invoices";
import type { Profile } from "@/lib/service/profile";

export function docFromInvoice(inv: InvoiceRow, items: ItemRow[], live?: { profile: Profile; client: Client | null }): DocData {
  const s = inv.seller_snapshot as Record<string, string | null> | null;
  const b = inv.buyer_snapshot as Record<string, string | null> | null;
  const seller: DocParty = s
    ? { name: s.business_name, address: s.address, gstin: s.gstin, pan: s.pan, state_code: s.state_code }
    : { name: live?.profile.business_name ?? null, address: live?.profile.address ?? null, gstin: live?.profile.gstin ?? null, pan: live?.profile.pan, state_code: live?.profile.state_code ?? null };
  const buyer: DocParty = b
    ? { name: b.name, address: b.address, gstin: b.gstin, state_code: b.state_code }
    : { name: live?.client?.name ?? inv.client_name, address: live?.client?.address ?? null, gstin: live?.client?.gstin ?? null, state_code: live?.client?.state_code ?? null };
  return {
    number: inv.number,
    fy: inv.fy,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    original_due_date: inv.original_due_date,
    seller,
    buyer,
    items,
    gst_rate: inv.gst_rate,
    gst_applicable: inv.gst_applicable,
    subtotal_paise: inv.subtotal_paise,
    cgst_paise: inv.cgst_paise,
    sgst_paise: inv.sgst_paise,
    igst_paise: inv.igst_paise,
    total_paise: inv.total_paise,
    notes: inv.notes,
    msme_line: s
      ? msmeLine(s.business_name ?? "", s.udyam_number, s.msme_category)
      : msmeLine(live?.profile.business_name ?? "", live?.profile.udyam_number, live?.profile.msme_category),
    draft: inv.stage === "draft",
    cancelled: inv.stage === "cancelled",
  };
}

const ACTOR: Record<string, string> = { claude: "Claude", user: "You", client: "Client", system: "Dues" };

export function describeEvent(e: EventRow): { who: string; what: string } {
  const p = e.payload as Record<string, unknown>;
  const money = (k: string) => (typeof p[k] === "number" ? formatINR(p[k] as number) : "");
  const who = ACTOR[e.actor] ?? e.actor;
  const what: Record<string, string> = {
    draft_created: `created a draft for ${money("total_paise")}`,
    draft_updated: `edited the draft (total now ${money("total_paise")})`,
    flagged_for_review: `flagged the totals: ${p.reason ?? ""}`,
    review_cleared: "cleared the totals flag (they now match)",
    viewed: p.n === 1 ? "opened the invoice for the first time" : `opened the invoice (view ${p.n ?? ""})`,
    totals_confirmed: "confirmed the totals",
    sent: `sent it as ${p.number ?? ""}`,
    cancelled: `cancelled it${p.reason ? `: ${p.reason}` : ""}`,
    payment_reported: `said they paid ${money("amount_paise")} (UTR ${p.utr ?? "—"})`,
    payment_confirmed: `confirmed ${money("amount_paise")}${(p.tds_paise as number) > 0 ? ` + ${money("tds_paise")} TDS` : ""}`,
    payment_rejected: `rejected a reported payment of ${money("amount_paise")}`,
    payment_recorded: `recorded ${money("amount_paise")}${(p.tds_paise as number) > 0 ? ` + ${money("tds_paise")} TDS` : ""}`,
    paid: "Invoice fully paid",
    became_overdue: `marked it overdue (balance ${p.balance ?? ""})`,
    reminder_saved: `saved a ${p.stage ? `${STAGE_LABEL[p.stage as ReminderStage].toLowerCase()} ` : ""}${p.channel === "email" ? "email" : "WhatsApp"} reminder`,
    marked_ready: "marked it ready to send",
    reminder_sent: `opened the ${p.channel === "email" ? "email" : "WhatsApp"} reminder to send`,
    due_date_extended: `extended the due date from ${formatDate(String(p.from ?? ""))} to ${formatDate(String(p.to ?? ""))}${p.reason ? ` (${p.reason})` : ""}`,
    notes_updated: "edited the notes",
    abuse_reported: "reported this invoice as suspicious",
  };
  return { who: e.type === "paid" ? "" : who, what: what[e.type] ?? e.type.replace(/_/g, " ") };
}
