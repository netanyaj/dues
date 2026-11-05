import { ImageResponse } from "next/og";
import { getPublicInvoice } from "@/lib/service/payments";
import { formatINR } from "@/lib/domain/money";
import { formatDate } from "@/lib/domain/dates";

// Link preview for WhatsApp, email and Slack. Only what the page itself shows the client:
// business, invoice number, balance, due date. Never the client's own details.
export const alt = "Invoice from Dues";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const found = await getPublicInvoice(publicId);
  const inv = found?.invoice as Record<string, unknown> | undefined;
  const s = (inv?.seller_snapshot ?? {}) as Record<string, string | null>;
  const business = s.business_name ?? "Dues";
  const cancelled = inv?.stage === "cancelled";
  const paid = inv?.status === "paid";
  const line = !inv ? "Invoice not found" : cancelled ? "Cancelled" : paid ? "Paid in full" : `${formatINR(Number(inv.balance_paise))} due ${formatDate(String(inv.due_date))}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#fbf8f6", color: "#17151c", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="56" height="56" viewBox="0 0 28 28"><rect width="28" height="28" rx="6" fill="#e0306e" /><path d="M8 7v14M12 7v14M16 7v14M20 7v14" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><path d="M5.5 19 22.5 9" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
          <span style={{ fontSize: 36, fontWeight: 600 }}>Dues</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ fontSize: 36, color: "#5e5a63" }}>Invoice {String(inv?.number ?? "")} from</span>
          <span style={{ fontSize: 64, fontWeight: 600 }}>{business.slice(0, 40)}</span>
          <span style={{ fontSize: 56, fontWeight: 600, color: inv?.status === "overdue" ? "#b54708" : "#17151c" }}>{line}</span>
        </div>
      </div>
    ),
    size,
  );
}
