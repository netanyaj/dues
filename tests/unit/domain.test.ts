import { describe, expect, it } from "vitest";
import { formatINR, lineAmountPaise, parseQtyMilli, rupeesToPaise, InputError } from "@/lib/domain/money";
import { computeTotals, checkClaimedTotal, suggestTds } from "@/lib/domain/tax";
import { gstinCheckChar, validateGstin, resolveStateCode, panFromGstin } from "@/lib/domain/gst";
import { addDays, formatDate, formatInvoiceNumber, fyFor, istToday } from "@/lib/domain/dates";
import { allowedActions, deriveStatus, isChasePaused, statusText } from "@/lib/domain/status";
import { upiEligible, upiUri, utrLooksUsual, validateUpiId, waPhone } from "@/lib/domain/upi";

const withCheck = (first14: string) => first14 + gstinCheckChar(first14);
const KA_GSTIN = withCheck("29ABCDE1234F1Z");
const MH_GSTIN = withCheck("27AAPFU0939F1Z");

describe("money parsing", () => {
  it("parses rupees exactly from numbers and strings", () => {
    expect(rupeesToPaise(2500)).toBe(250000);
    expect(rupeesToPaise("2,500.50")).toBe(250050);
    expect(rupeesToPaise(2500.5)).toBe(250050);
  });
  it("refuses float noise instead of silently rounding it", () => {
    expect(() => rupeesToPaise(0.1 + 0.2)).toThrow(/at most 2 decimal places/);
    expect(rupeesToPaise(0.3)).toBe(30);
  });
  it("rejects more than 2 decimals with a human error", () => {
    expect(() => rupeesToPaise("12.345")).toThrow(InputError);
    expect(() => rupeesToPaise("12.345")).toThrow(/at most 2 decimal places/);
    expect(rupeesToPaise("12.340")).toBe(1234);
  });
  it("rejects garbage", () => {
    expect(() => rupeesToPaise("abc")).toThrow(/must be a number/);
    expect(() => rupeesToPaise("")).toThrow();
  });
  it("parses qty to 3 decimals", () => {
    expect(parseQtyMilli(12)).toBe(12000);
    expect(parseQtyMilli("1.5")).toBe(1500);
    expect(parseQtyMilli(0.333)).toBe(333);
    expect(() => parseQtyMilli("0.3333")).toThrow();
  });
});

describe("rounding", () => {
  it("amount = round(qty × rate), half up", () => {
    expect(lineAmountPaise(12000, 250000)).toBe(3000000);
    // 0.333 × ₹100.01 = 33.30333 rupees -> 3330 paise
    expect(lineAmountPaise(333, 10001)).toBe(3330);
    // 1.5 × 1 paisa = 1.5 -> 2
    expect(lineAmountPaise(1500, 1)).toBe(2);
    // 0.5 x 1 paisa -> 1 (half up)
    expect(lineAmountPaise(500, 1)).toBe(1);
    expect(lineAmountPaise(499, 1)).toBe(0);
  });
  it("formats Indian grouping", () => {
    expect(formatINR(1_00_000_00)).toBe("₹1,00,000.00");
    expect(formatINR(3540000, { decimals: "auto" })).toBe("₹35,400");
    expect(formatINR(12_34_56_789)).toBe("₹12,34,567.89");
    expect(formatINR(99)).toBe("₹0.99");
  });
});

describe("tax", () => {
  const base = { supplierState: "29", supplierHasGstin: true } as const;
  it("12 h × ₹2,500 at 18%, same state: CGST/SGST 2,700 each", () => {
    const t = computeTotals({ ...base, lines: [{ qtyMilli: 12000, ratePaise: 250000 }], gstRate: 18, clientState: "29" });
    expect(t).toMatchObject({ subtotal: 3000000, cgst: 270000, sgst: 270000, igst: 0, total: 3540000, mode: "intra" });
  });
  it("different state: IGST", () => {
    const t = computeTotals({ ...base, lines: [{ qtyMilli: 12000, ratePaise: 250000 }], gstRate: 18, clientState: "27" });
    expect(t).toMatchObject({ cgst: 0, sgst: 0, igst: 540000, total: 3540000, mode: "inter" });
  });
  it("odd paisa of tax goes to CGST", () => {
    // subtotal 1 paisa... use 5% of 10 paise = 0.5 -> 1 paisa tax
    const t = computeTotals({ ...base, lines: [{ qtyMilli: 1000, ratePaise: 10 }], gstRate: 5, clientState: "29" });
    expect(t.cgst + t.sgst).toBe(1);
    expect(t.cgst).toBe(1);
    expect(t.sgst).toBe(0);
    const t2 = computeTotals({ ...base, lines: [{ qtyMilli: 1000, ratePaise: 1234567 }], gstRate: 18, clientState: "29" });
    // 12345.67 × 18% = 2222.2206 -> 222222 paise; halves 111111/111111
    expect(t2.cgst + t2.sgst).toBe(222222);
    expect(t2.cgst - t2.sgst).toBeLessThanOrEqual(1);
    expect(t2.cgst).toBeGreaterThanOrEqual(t2.sgst);
    const t3 = computeTotals({ ...base, lines: [{ qtyMilli: 1000, ratePaise: 1235 }], gstRate: 18, clientState: "29" });
    // 1235 × 0.18 = 222.3 -> 222 -> 111/111 ; try 1239*0.18=223.02 -> 223 -> 112/111
    expect(t3.cgst + t3.sgst).toBe(222);
    const t4 = computeTotals({ ...base, lines: [{ qtyMilli: 1000, ratePaise: 1239 }], gstRate: 18, clientState: "29" });
    expect([t4.cgst, t4.sgst]).toEqual([112, 111]);
  });
  it("no GSTIN: no tax", () => {
    const t = computeTotals({ lines: [{ qtyMilli: 2000, ratePaise: 100000 }], gstRate: 18, supplierState: "29", clientState: "27", supplierHasGstin: false });
    expect(t).toMatchObject({ subtotal: 200000, total: 200000, cgst: 0, sgst: 0, igst: 0, mode: "none", gstApplicable: false });
  });
  it("totals always add up across many random lines", () => {
    for (let i = 0; i < 500; i++) {
      const lines = Array.from({ length: 1 + (i % 5) }, (_, j) => ({ qtyMilli: 1 + ((i * 7919 + j * 31) % 100000), ratePaise: (i * 104729 + j) % 10000000 }));
      const t = computeTotals({ ...base, lines, gstRate: [0, 5, 12, 18, 28][i % 5] as 0, clientState: i % 2 ? "29" : "27" });
      expect(t.total).toBe(t.subtotal + t.cgst + t.sgst + t.igst);
      expect(t.lineAmounts.reduce((a, b) => a + b, 0)).toBe(t.subtotal);
    }
  });
});

describe("Claude's number check", () => {
  it("flags a difference over ₹1 with a readable reason", () => {
    expect(checkClaimedTotal(3504000, 3540000)).toEqual({ needsReview: true, reason: "Claude said ₹35,400, Dues computed ₹35,040" });
  });
  it("allows ₹1 of slack and missing claims", () => {
    expect(checkClaimedTotal(3540000, 3540100).needsReview).toBe(false);
    expect(checkClaimedTotal(3540000, 3540101).needsReview).toBe(true);
    expect(checkClaimedTotal(3540000, null).needsReview).toBe(false);
  });
});

describe("TDS suggestion", () => {
  it("spots 10% TDS on the pre-GST subtotal", () => {
    // ₹30,000 + 18% = ₹35,400; client pays ₹32,400
    expect(suggestTds(3000000, 3540000, 3240000)).toEqual({ rate: 10, tdsPaise: 300000 });
    expect(suggestTds(3000000, 3540000, 3480000)).toEqual({ rate: 2, tdsPaise: 60000 });
  });
  it("doesn't guess on random shortfalls", () => {
    expect(suggestTds(3000000, 3540000, 3000000)).toBeNull();
    expect(suggestTds(3000000, 3540000, 3540000)).toBeNull();
  });
});

describe("GSTIN", () => {
  it("accepts valid GSTINs and normalises case", () => {
    expect(validateGstin(KA_GSTIN.toLowerCase(), "29")).toEqual({ ok: true, value: KA_GSTIN });
    expect(validateGstin(MH_GSTIN, "27").ok).toBe(true);
  });
  it("rejects wrong length, format, checksum and state with human errors", () => {
    expect(validateGstin("29ABCDE1234F1Z")).toMatchObject({ ok: false, error: expect.stringMatching(/15 characters/) });
    expect(validateGstin("29ABCDE1234F1X5")).toMatchObject({ ok: false, error: expect.stringMatching(/format/) });
    const bad = KA_GSTIN.slice(0, 14) + (KA_GSTIN[14] === "A" ? "B" : "A");
    expect(validateGstin(bad)).toMatchObject({ ok: false, error: expect.stringMatching(/checksum/) });
    expect(validateGstin(KA_GSTIN, "27")).toMatchObject({ ok: false, error: expect.stringMatching(/Karnataka.*Maharashtra/) });
    expect(validateGstin(withCheck("25ABCDE1234F1Z"))).toMatchObject({ ok: false, error: expect.stringMatching(/state code/) });
  });
  it("checks a known real-format GSTIN checksum", () => {
    // Widely published sample GSTIN
    expect(validateGstin("27AAPFU0939F1ZV").ok).toBe(true);
  });
  it("derives PAN and resolves states", () => {
    expect(panFromGstin(KA_GSTIN)).toBe("ABCDE1234F");
    expect(resolveStateCode("Karnataka")).toBe("29");
    expect(resolveStateCode("bengaluru")).toBe("29");
    expect(resolveStateCode("27")).toBe("27");
    expect(resolveStateCode("Atlantis")).toBeNull();
  });
});

describe("dates and numbering", () => {
  it("financial year starts 1 April", () => {
    expect(fyFor("2026-03-31")).toBe("2025-26");
    expect(fyFor("2026-04-01")).toBe("2026-27");
    expect(fyFor("2099-12-31")).toBe("2099-00");
  });
  it("formats numbers ≤ 16 chars with 3-char prefix", () => {
    const n = formatInvoiceNumber("INV", "2026-27", 7);
    expect(n).toBe("INV/2026-27/0007");
    expect(n.length).toBeLessThanOrEqual(16);
    expect(formatInvoiceNumber("ABC", "2026-27", 9999).length).toBe(16);
  });
  it("IST today rolls over at 18:30 UTC", () => {
    expect(istToday(new Date("2026-11-05T18:29:00Z"))).toBe("2026-11-05");
    expect(istToday(new Date("2026-11-05T18:30:00Z"))).toBe("2026-11-06");
  });
  it("formats dates the Indian way", () => {
    expect(formatDate("2026-11-12")).toBe("12 Nov 2026");
    expect(addDays("2026-11-20", 15)).toBe("2026-12-05");
  });
});

describe("derived status", () => {
  const base = { stage: "issued" as const, totalPaise: 3540000, dueDate: "2026-11-20", today: "2026-11-10", payments: [] };
  it("sent → overdue by date alone", () => {
    expect(deriveStatus(base).status).toBe("sent");
    expect(deriveStatus({ ...base, today: "2026-11-21" })).toMatchObject({ status: "overdue", daysOverdue: 1 });
    expect(deriveStatus({ ...base, today: "2026-11-20" }).status).toBe("sent"); // due today is not overdue
  });
  it("a client report is a flag; it never hides overdue (D16)", () => {
    const reported = { status: "reported" as const, amountPaise: 3540000, tdsPaise: 0 };
    expect(deriveStatus({ ...base, today: "2026-11-25", payments: [reported] })).toMatchObject({ status: "overdue", paymentReported: true });
    expect(deriveStatus({ ...base, payments: [reported] })).toMatchObject({ status: "sent", paymentReported: true });
    expect(deriveStatus({ ...base, today: "2026-11-25", payments: [{ ...reported, status: "rejected" }] })).toMatchObject({ status: "overdue", paymentReported: false });
    expect(statusText("overdue", 1)).toBe("Overdue · payment reported");
    expect(statusText("paid", 1)).toBe("Paid");
  });
  it("a report pauses chasing for 2 working days, skipping weekends (D16)", () => {
    // Thu 2026-11-05 report
    expect(isChasePaused("2026-11-05", "2026-11-05")).toBe(true);
    expect(isChasePaused("2026-11-05", "2026-11-06")).toBe(true); // Fri = 1
    expect(isChasePaused("2026-11-05", "2026-11-08")).toBe(true); // Sun, still 1
    expect(isChasePaused("2026-11-05", "2026-11-09")).toBe(true); // Mon = 2
    expect(isChasePaused("2026-11-05", "2026-11-10")).toBe(false); // Tue = 3, back on the list
    expect(isChasePaused(null, "2026-11-10")).toBe(false);
  });
  it("flags unusual reference formats", () => {
    expect(utrLooksUsual("412345678901")).toBe(true);
    expect(utrLooksUsual("HDFCN52026110512")).toBe(true);
    expect(utrLooksUsual("T2311051234567890123456")).toBe(false);
    expect(utrLooksUsual("ABC123")).toBe(false);
  });
  it("partial payments keep a balance; TDS counts toward paid", () => {
    const part = deriveStatus({ ...base, payments: [{ status: "confirmed", amountPaise: 3000000, tdsPaise: 0 }] });
    expect(part).toMatchObject({ status: "partially_paid", balancePaise: 540000 });
    const overduePart = deriveStatus({ ...base, today: "2026-12-01", payments: [{ status: "confirmed", amountPaise: 3000000, tdsPaise: 0 }] });
    expect(overduePart.status).toBe("overdue");
    const tds = deriveStatus({ ...base, today: "2026-12-01", payments: [{ status: "confirmed", amountPaise: 3240000, tdsPaise: 300000 }] });
    expect(tds).toMatchObject({ status: "paid", balancePaise: 0, daysOverdue: 0 });
  });
  it("cancelled and draft win over everything", () => {
    expect(deriveStatus({ ...base, stage: "cancelled", today: "2027-01-01" }).status).toBe("cancelled");
    expect(deriveStatus({ ...base, stage: "draft", today: "2027-01-01" })).toMatchObject({ status: "draft", daysOverdue: 0 });
  });
});

describe("allowed actions (locking + transitions)", () => {
  it("drafts are editable; flagged drafts can't be sent", () => {
    const a = allowedActions({ stage: "draft", status: "draft", needsReview: false, pendingReports: 0 });
    expect([...a]).toEqual(expect.arrayContaining(["edit_items", "send", "delete_draft"]));
    const r = allowedActions({ stage: "draft", status: "draft", needsReview: true, pendingReports: 0 });
    expect(r.has("send")).toBe(false);
    expect(r.has("confirm_totals")).toBe(true);
  });
  it("issued invoices lock items but allow notes/due date and cancel", () => {
    const a = allowedActions({ stage: "issued", status: "sent", needsReview: false, pendingReports: 0 });
    expect(a.has("edit_items")).toBe(false);
    expect(a.has("edit_notes_due")).toBe(true);
    expect(a.has("cancel")).toBe(true);
    expect(a.has("delete_draft")).toBe(false);
    expect(a.has("send")).toBe(false);
  });
  it("paid can't be cancelled; cancelled can't do anything", () => {
    expect(allowedActions({ stage: "issued", status: "paid", needsReview: false, pendingReports: 0 }).has("cancel")).toBe(false);
    expect(allowedActions({ stage: "cancelled", status: "cancelled", needsReview: false, pendingReports: 0 }).size).toBe(0);
  });
});

describe("UPI", () => {
  it("validates UPI IDs", () => {
    expect(validateUpiId("dues.demo@okicici").ok).toBe(true);
    expect(validateUpiId("not-an-id").ok).toBe(false);
  });
  it("builds the deep link with amount and note", () => {
    expect(upiUri({ upiId: "dues.demo@okicici", payeeName: "Asha Studio", amountPaise: 3540000, note: "INV/2026-27/0007" })).toBe(
      "upi://pay?pa=dues.demo@okicici&pn=Asha%20Studio&am=35400.00&tn=INV%2F2026-27%2F0007&cu=INR",
    );
  });
  it("hides the QR above ₹1 lakh", () => {
    expect(upiEligible("a@b1", 1_00_000_00)).toBe(true);
    expect(upiEligible("a@b1", 1_00_000_01)).toBe(false);
    expect(upiEligible(null, 100)).toBe(false);
  });
  it("normalises phone numbers for WhatsApp", () => {
    expect(waPhone("98450 12345")).toBe("919845012345");
    expect(waPhone("+91-98450-12345")).toBe("919845012345");
    expect(waPhone("abc")).toBeNull();
  });
});
