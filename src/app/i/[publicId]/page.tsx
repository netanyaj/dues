import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getPublicInvoice } from "@/lib/service/payments";
import type { InvoiceRow, ItemRow } from "@/lib/service/invoices";
import { InvoiceDocument } from "@/components/invoice-document";
import { CopyButton } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { docFromInvoice } from "@/lib/view";
import { formatINR, paiseToDecimalString } from "@/lib/domain/money";
import { daysBetween, formatDate } from "@/lib/domain/dates";
import { upiEligible, upiUri, UPI_QR_LIMIT_PAISE } from "@/lib/domain/upi";
import { PaidForm, PrintButton, ReportInvoice } from "./client-bits";

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

const GST_SEARCH = "https://services.gst.gov.in/services/searchtp";

export default async function PublicInvoice({ params }: PageProps<"/i/[publicId]">) {
  const { publicId } = await params;
  const found = await getPublicInvoice(publicId);
  if (!found) notFound();
  const inv = found.invoice as unknown as InvoiceRow;
  const items = (found.items as ItemRow[]).map((i) => ({ ...i, rate_paise: Number(i.rate_paise), amount_paise: Number(i.amount_paise) }));
  for (const k of ["total_paise", "balance_paise", "subtotal_paise", "cgst_paise", "sgst_paise", "igst_paise", "pending_reports"] as const) {
    (inv as Record<string, unknown>)[k] = Number((inv as Record<string, unknown>)[k]);
  }
  const s = (inv.seller_snapshot ?? {}) as Record<string, string | null>;
  const business = s.business_name ?? "the business";
  const cancelled = inv.stage === "cancelled";
  const paid = inv.status === "paid";
  const due = inv.balance_paise;
  const canPay = !cancelled && !paid && due > 0;

  const showUpi = canPay && upiEligible(s.upi_id, due);
  const upiLink = showUpi ? upiUri({ upiId: s.upi_id!, payeeName: s.upi_name || business, amountPaise: due, note: inv.number! }) : null;
  const qr = upiLink ? await QRCode.toDataURL(upiLink, { margin: 1, width: 240, errorCorrectionLevel: "M" }) : null;
  const hasBank = !!(s.bank_account_number && s.bank_ifsc);

  const issuedAt = inv.issued_at ?? inv.created_at;
  const accountAgeDays = s.account_created_at ? daysBetween(String(s.account_created_at).slice(0, 10), issuedAt.slice(0, 10)) : 999;
  const bankChangedRecently = !!s.bank_details_changed_at && daysBetween(String(s.bank_details_changed_at).slice(0, 10), issuedAt.slice(0, 10)) <= 7;
  const pendingReport = found.reports.some((r) => r.status === "reported");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 print:max-w-none print:p-0">
      {/* Summary: what, how much, by when */}
      <section className="rounded-lg border bg-white p-4 print:hidden">
        <p className="text-sm text-muted-foreground">Invoice {inv.number} from</p>
        <h1 className="text-xl font-semibold">{business}</h1>
        {cancelled ? (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 font-medium text-red-800">This invoice was cancelled. Please don&apos;t pay it.</p>
        ) : paid ? (
          <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 font-medium text-emerald-800">Paid in full. Thank you!</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm text-muted-foreground">{due < inv.total_paise ? "Balance due" : "Amount due"}</p>
              <p className="text-3xl font-semibold tabular-nums">{formatINR(due)}</p>
            </div>
            <p className={`text-sm ${inv.status === "overdue" ? "font-medium text-red-700" : "text-muted-foreground"}`}>
              {inv.status === "overdue" ? `Was due ${formatDate(inv.due_date)}` : `Due ${formatDate(inv.due_date)}`}
            </p>
          </div>
        )}
        {inv.original_due_date && inv.original_due_date !== inv.due_date && !cancelled ? (
          <p className="mt-2 text-sm text-blue-900">Due date extended from {formatDate(inv.original_due_date)} to {formatDate(inv.due_date)}.</p>
        ) : null}
        {pendingReport && canPay ? <p className="mt-2 text-sm text-amber-900">We&apos;ve told {business} you&apos;ve paid. They&apos;ll confirm once it arrives.</p> : null}
      </section>

      {canPay && (
        <section className="flex flex-col gap-4 rounded-lg border bg-white p-4 print:hidden" aria-labelledby="pay-h">
          <h2 id="pay-h" className="font-medium">How to pay</h2>
          {hasBank && (
            <div>
              <h3 className="text-sm font-medium">Bank transfer (NEFT / IMPS / RTGS)</h3>
              <dl className="mt-2 flex flex-col gap-2 text-sm">
                {[["Account name", s.bank_account_name], ["Account number", s.bank_account_number], ["IFSC", s.bank_ifsc], ["Amount", paiseToDecimalString(due)]].map(([k, v]) =>
                  v ? (
                    <div key={k} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                      <div className="min-w-0"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-mono break-all">{v}</dd></div>
                      <CopyButton value={String(v)} label="Copy" size="sm" />
                    </div>
                  ) : null,
                )}
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">Use {inv.number} as the payment reference.</p>
            </div>
          )}
          {showUpi && (
            <div className={hasBank ? "border-t pt-4" : ""}>
              <h3 className="text-sm font-medium">UPI</h3>
              <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr!} alt={`UPI QR code to pay ${formatINR(due)} to ${s.upi_id}`} width={200} height={200} className="rounded-md border" />
                <div className="flex w-full flex-col gap-2 text-sm">
                  <Button asChild className="h-11"><a href={upiLink!}>Pay {formatINR(due)} with a UPI app</a></Button>
                  <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                    <div className="min-w-0"><p className="text-xs text-muted-foreground">UPI ID</p><p className="font-mono break-all">{s.upi_id}</p></div>
                    <CopyButton value={s.upi_id!} label="Copy" size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground">If your UPI app won&apos;t fill in the amount, pay {paiseToDecimalString(due)} to the UPI ID above.</p>
                </div>
              </div>
            </div>
          )}
          {!showUpi && s.upi_id && due > UPI_QR_LIMIT_PAISE && (
            <p className="text-sm text-muted-foreground">This amount is above the UPI limit of ₹1,00,000 per payment, so please pay by bank transfer.</p>
          )}
          {!hasBank && !showUpi && <p className="text-sm text-muted-foreground">Contact {business} for payment details.</p>}
          <PaidForm publicId={publicId} due={paiseToDecimalString(due)} />
        </section>
      )}

      {/* D17: claim nothing we can't back up */}
      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 print:hidden" aria-label="About this invoice">
        <p>
          Invoice issued by <b>{business}</b> using Dues. <b>Dues does not verify businesses or bank details.</b> Business: <i>Not verified</i>. Bank account: <i>Not verified</i>.
        </p>
        {accountAgeDays < 30 && <p className="mt-2 font-medium text-amber-900">This is a new Dues account. Confirm the details with {business} by phone before paying.</p>}
        {bankChangedRecently && s.bank_details_changed_at && (
          <p className="mt-2 font-medium text-amber-900">Bank details updated on {formatDate(String(s.bank_details_changed_at).slice(0, 10))}. If you&apos;ve paid {business} before, check the new details with them by phone.</p>
        )}
        {s.gstin && (
          <p className="mt-2">
            GSTIN {s.gstin} is structurally valid (format, checksum, state). Check it&apos;s active on the{" "}
            <a href={GST_SEARCH} target="_blank" rel="noopener noreferrer" className="underline">government GST search</a>.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-3">
          <PrintButton />
          <ReportInvoice publicId={publicId} />
        </div>
      </section>

      <InvoiceDocument d={docFromInvoice(inv, items)} />
      <p className="text-center text-xs text-muted-foreground print:hidden">Made with Dues</p>
    </main>
  );
}
