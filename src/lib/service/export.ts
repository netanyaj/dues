// D22: CSV for the accountant. One row per sent or cancelled invoice (drafts aren't tax documents).
import { stateName } from "@/lib/domain/gst";
import { paiseToDecimalString } from "@/lib/domain/money";
import { STATUS_LABEL } from "@/lib/domain/status";
import { isValidDate } from "@/lib/domain/dates";
import { DuesError, type Ctx, check, db } from "./core";

const HEADERS = ["Invoice number", "Issue date", "Client", "Client GSTIN", "Place of supply", "Taxable value", "CGST", "SGST", "IGST", "Total", "TDS", "Amount received", "Balance", "Status"];

function cell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  // Quote everything; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function exportInvoicesCsv(ctx: Ctx, from: string, to: string): Promise<string> {
  if (!isValidDate(from) || !isValidDate(to)) throw new DuesError("invalid_input", "Pick a valid date range.");
  if (from > to) throw new DuesError("invalid_input", "The start date is after the end date.");
  const rows = check(
    await db().from("invoice_view").select("*").eq("user_id", ctx.userId).neq("stage", "draft").gte("issue_date", from).lte("issue_date", to).order("issue_date").order("seq"),
  ) as Record<string, unknown>[];
  const lines = [HEADERS.map(cell).join(",")];
  for (const r of rows) {
    const b = (r.buyer_snapshot ?? {}) as Record<string, string | null>;
    const n = (k: string) => paiseToDecimalString(Number(r[k] ?? 0));
    lines.push([
      r.number as string, r.issue_date as string, r.client_name as string, b.gstin ?? "",
      `${stateName(b.state_code)} (${b.state_code ?? ""})`,
      n("subtotal_paise"), n("cgst_paise"), n("sgst_paise"), n("igst_paise"), n("total_paise"),
      n("tds_total_paise"), n("confirmed_paise"), r.stage === "cancelled" ? "0.00" : n("balance_paise"),
      STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? String(r.status),
    ].map(cell).join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM so Excel reads ₹ and names correctly
}
