import { divRoundHalfUp, formatINR, lineAmountPaise } from "./money";
import type { GstRate } from "./gst";

export type LineInput = { qtyMilli: number; ratePaise: number };

export type TaxMode = "intra" | "inter" | "none";

export type Totals = {
  lineAmounts: number[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  mode: TaxMode;
  gstApplicable: boolean;
};

/**
 * Rule 1 of the spec. Tax is computed once on the subtotal.
 * - Supplier has no GSTIN: no tax ("GST not applicable").
 * - Same state: CGST = SGST = half; an odd paisa goes to CGST.
 * - Different state: IGST = full tax.
 */
export function computeTotals(args: {
  lines: LineInput[];
  gstRate: GstRate;
  supplierState: string;
  clientState: string;
  supplierHasGstin: boolean;
}): Totals {
  const lineAmounts = args.lines.map((l) => lineAmountPaise(l.qtyMilli, l.ratePaise));
  const subtotal = lineAmounts.reduce((a, b) => a + b, 0);

  if (!args.supplierHasGstin) {
    return { lineAmounts, subtotal, cgst: 0, sgst: 0, igst: 0, total: subtotal, mode: "none", gstApplicable: false };
  }

  const tax = Number(divRoundHalfUp(BigInt(subtotal) * BigInt(args.gstRate), 100n));
  if (args.supplierState === args.clientState) {
    const sgst = Math.floor(tax / 2);
    const cgst = tax - sgst;
    return { lineAmounts, subtotal, cgst, sgst, igst: 0, total: subtotal + tax, mode: "intra", gstApplicable: true };
  }
  return { lineAmounts, subtotal, cgst: 0, sgst: 0, igst: tax, total: subtotal + tax, mode: "inter", gstApplicable: true };
}

/** Rule 2: Claude's number check. Tolerance ₹1 (100 paise). */
export const CLAIM_TOLERANCE_PAISE = 100;

export function checkClaimedTotal(computed: number, claimed: number | null | undefined): { needsReview: boolean; reason: string | null } {
  if (claimed == null) return { needsReview: false, reason: null };
  if (Math.abs(computed - claimed) > CLAIM_TOLERANCE_PAISE) {
    return { needsReview: true, reason: `Claude said ${formatINR(claimed, { decimals: "auto" })}, Dues computed ${formatINR(computed, { decimals: "auto" })}` };
  }
  return { needsReview: false, reason: null };
}

/** DECISIONS.md D5: does the shortfall look like TDS on the pre-GST subtotal? */
/** 194J (10% professional / 2% technical), 194C (1% / 2% contracts). DECISIONS.md D5. */
export const TDS_RATES = [10, 2, 1] as const;

export function suggestTds(subtotal: number, balance: number, amountPaid: number): { rate: number; tdsPaise: number } | null {
  const shortfall = balance - amountPaid;
  if (shortfall <= 0) return null;
  for (const rate of TDS_RATES) {
    const tds = Number(divRoundHalfUp(BigInt(subtotal) * BigInt(rate), 100n));
    if (Math.abs(tds - shortfall) <= CLAIM_TOLERANCE_PAISE) return { rate, tdsPaise: shortfall };
  }
  return null;
}
