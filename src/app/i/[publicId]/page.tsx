import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { headers } from "next/headers";
import { after } from "next/server";
import { sessionUser } from "@/lib/auth";
import { getPublicInvoice, recordPublicView } from "@/lib/service/payments";
import type { InvoiceRow, ItemRow } from "@/lib/service/invoices";
import { InvoiceDocument } from "@/components/invoice-document";
import { CopyButton } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ds";
import { LogoMark } from "@/components/logo";
import { docFromInvoice } from "@/lib/view";
import { formatINR, paiseToDecimalString } from "@/lib/domain/money";
import { daysBetween, formatDate } from "@/lib/domain/dates";
import { upiEligible, upiUri, UPI_QR_LIMIT_PAISE } from "@/lib/domain/upi";
import { PaidForm, PrintButton, ReportInvoice } from "./client-bits";

export async function generateMetadata({ params }: PageProps<"/i/[publicId]">): Promise<Metadata> {
  const { publicId } = await params;
  const found = await getPublicInvoice(publicId);
  const robots = { index: false, follow: false };
  if (!found) return { title: "Invoice not found", robots };
  const inv = found.invoice as Record<string, unknown>;
  const business = ((inv.seller_snapshot ?? {}) as Record<string, string | null>).business_name ?? "a freelancer";
  const title = `Invoice ${inv.number} from ${business}`;
  const description = inv.stage === "cancelled" ? "This invoice was cancelled." : inv.status === "paid" ? "Paid in full." : `${formatINR(Number(inv.balance_paise))} due ${formatDate(String(inv.due_date))}`;
  return { title: { absolute: title }, description, robots, openGraph: { title, description, type: "website" }, twitter: { card: "summary_large_image", title, description } };
}

const GST_SEARCH = "https://services.gst.gov.in/services/searchtp";

export default async function PublicInvoice({ params }: PageProps<"/i/[publicId]">) {
  const { publicId } = await params;
  const found = await getPublicInvoice(publicId);
  if (!found) notFound();
  const ua = (await headers()).get("user-agent");
  const viewer = await sessionUser().catch(() => null);
  after(() => recordPublicView(found, ua, viewer?.id ?? null));
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

  const showUpi = canPay && found.showUpiQr && upiEligible(s.upi_id, due);
  const upiLink = showUpi ? upiUri({ upiId: s.upi_id!, payeeName: s.upi_name || business, amountPaise: due, note: inv.number! }) : null;
  const qr = upiLink ? await QRCode.toDataURL(upiLink, { margin: 1, width: 240, errorCorrectionLevel: "M" }) : null;
  const hasBank = !!(s.bank_account_number && s.bank_ifsc);

  const issuedAt = inv.issued_at ?? inv.created_at;
  const accountAgeDays = s.account_created_at ? daysBetween(String(s.account_created_at).slice(0, 10), issuedAt.slice(0, 10)) : 999;
  // D17/D55: warn only when the bank details changed in the 7 days *before* this invoice was sent.
  const bankGap = s.bank_details_changed_at ? daysBetween(String(s.bank_details_changed_at).slice(0, 10), issuedAt.slice(0, 10)) : null;
  const bankChangedRecently = bankGap != null && bankGap >= 0 && bankGap <= 7;
  const pendingReport = found.reports.some((r) => r.status === "reported");
  // Closes the loop on a rejected report (FLOWS.md flow 6): the latest one, if nothing newer is pending.
  const lastReport = found.reports[0] as { status: string; amount_paise: number } | undefined;
  const rejected = !pendingReport && lastReport?.status === "rejected" ? Number(lastReport.amount_paise) : null;

  const row = (label: string, value: string | null | undefined, copy = true) =>
    value ? (
      <div key={label} className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <dt className="caption-4 text-muted-foreground">{label}</dt>
          <dd className="amount body-5 break-all whitespace-normal">{value}</dd>
        </div>
        {copy && <CopyButton value={String(value)} label={`Copy ${/^[A-Z]{2,}/.test(label) ? label : label.toLowerCase()}`} variant="ghost" />}
      </div>
    ) : null;

  return (
    <main id="main" className="mx-auto grid w-full max-w-xl grid-cols-1 gap-4 px-4 py-6 sm:py-10 lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6 print:block print:max-w-none print:p-0">
      {/* Phones: summary, pay, trust, then the document. Desktop: document left, the paying column right. */}
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1 print:hidden">
      {/* Summary: who, how much, by when */}
      <section className="rounded-xl border bg-card p-6 print:hidden">
        <p className="body-6 text-muted-foreground">{business} has sent you an invoice</p>
        <p className="amount caption-4 text-muted-foreground">{inv.number} · {formatDate(inv.issue_date)}</p>
        {cancelled ? (
          <div className="mt-4"><Banner tone="error" title="This invoice was cancelled">Please don&apos;t pay it. Ask {business} for the correct invoice.</Banner></div>
        ) : paid ? (
          <div className="mt-4"><Banner tone="success" title="Paid in full">Nothing more to pay. Thank you.</Banner></div>
        ) : (
          <>
            <p className="mt-6 caption-4 text-muted-foreground">{due < inv.total_paise ? "Balance due" : "Amount due"}</p>
            <p className="amount mt-1 heading-3">{formatINR(due)}</p>
            <p className={`mt-1 body-6 ${inv.status === "overdue" ? "font-medium text-late" : "text-muted-foreground"}`}>
              {inv.status === "overdue" ? `Was due on ${formatDate(inv.due_date)}` : `Due on ${formatDate(inv.due_date)}`}
              {due < inv.total_paise ? <span className="text-muted-foreground"> · invoice total {formatINR(inv.total_paise)}</span> : null}
            </p>
          </>
        )}
        {inv.original_due_date && inv.original_due_date !== inv.due_date && !cancelled ? (
          <p className="mt-2 body-6">{business} moved the due date from {formatDate(inv.original_due_date)} to {formatDate(inv.due_date)}.</p>
        ) : null}
        {rejected != null && canPay ? <div className="mt-4"><Banner tone="warning" title={`Payment of ${formatINR(rejected)} not found yet`}>Check the reference, or contact {business}.</Banner></div> : null}
        {pendingReport && canPay ? <div className="mt-4"><Banner title="Payment reported">{business} will confirm once it arrives.</Banner></div> : null}
        {/* D43: the two actions sit with the amount, so nobody has to scroll past bank details to find them. */}
        {canPay && (
          <div className="mt-6 flex flex-col gap-2">
            {showUpi && <Button asChild size="lg" className="w-full"><a href={upiLink!}>Pay with UPI</a></Button>}
            <PaidForm publicId={publicId} due={paiseToDecimalString(due)} business={business} primary={!showUpi} />
            {hasBank && <a href="#pay-h" className="mx-auto caption-4 text-muted-foreground underline underline-offset-4 hover:text-foreground">Bank transfer details below</a>}
          </div>
        )}
      </section>

      {canPay && (
        <section className="flex flex-col gap-6 rounded-xl border bg-card p-6 print:hidden" aria-labelledby="pay-h">
          <h2 id="pay-h" className="scroll-mt-6 body-1">How to pay</h2>
          {hasBank && (
            <div>
              <h3 className="title-4">Bank transfer (NEFT, IMPS or RTGS)</h3>
              <dl className="mt-1 divide-y border-y">
                {row("Account name", s.bank_account_name, false)}
                {row("Account number", s.bank_account_number)}
                {row("IFSC", s.bank_ifsc)}
                {row("Amount", paiseToDecimalString(due))}
              </dl>
              <p className="mt-2 caption-5 text-muted-foreground">Write <span className="amount font-medium text-foreground">{inv.number}</span> in the remarks so they can match your payment.</p>
            </div>
          )}
          {showUpi && (
            <div className={hasBank ? "border-t pt-6" : ""}>
              <h3 className="title-4">UPI</h3>
              <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start lg:flex-col lg:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr!} alt={`UPI QR code to pay ${formatINR(due)} to ${s.upi_id}`} width={176} height={176} className="rounded-lg border" />
                <div className="flex w-full min-w-0 flex-col gap-2">
                  <dl className="divide-y border-y">{row("UPI ID", s.upi_id)}</dl>
                  <p className="caption-5 text-muted-foreground">No amount filled in? Pay {paiseToDecimalString(due)} to this UPI ID.</p>
                </div>
              </div>
            </div>
          )}
          {!showUpi && found.showUpiQr && s.upi_id && due > UPI_QR_LIMIT_PAISE && (
            <p className="body-6 text-muted-foreground">This is above the UPI limit of ₹1,00,000 per payment, so please pay by bank transfer.</p>
          )}
        </section>
      )}

      {/* D17: claim nothing we can't back up */}
      <section className="rounded-xl border bg-card p-6 body-6 print:hidden" aria-label="About this invoice">
        <p className="title-4">Before you pay</p>
        <p className="mt-1 text-muted-foreground">
          Invoice issued by {business} using Dues. Dues does not verify businesses or bank details.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted px-3 py-2"><dt className="caption-4 text-muted-foreground">Business</dt><dd className="body-5">Not verified</dd></div>
          <div className="rounded-lg bg-muted px-3 py-2"><dt className="caption-4 text-muted-foreground">Bank account</dt><dd className="body-5">Not verified</dd></div>
        </dl>
        {accountAgeDays < 30 && <p className="mt-2 font-medium text-attention">This is a new Dues account. Confirm the details with {business} by phone before paying.</p>}
        {bankChangedRecently && s.bank_details_changed_at && (
          <p className="mt-2 font-medium text-attention">Bank details updated on {formatDate(String(s.bank_details_changed_at).slice(0, 10))}. If you&apos;ve paid {business} before, check the new details with them by phone.</p>
        )}
        {s.gstin && (
          <p className="mt-2 text-muted-foreground">
            GSTIN <span className="amount text-foreground">{s.gstin}</span> is structurally valid (format, checksum, state). Check it&apos;s active on the{" "}
            <a href={GST_SEARCH} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2">government GST search</a>.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          <PrintButton />
          <ReportInvoice publicId={publicId} />
        </div>
      </section>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
        <InvoiceDocument d={docFromInvoice(inv, items)} />
        <Link href="/" className="mx-auto flex items-center gap-2 caption-5 text-muted-foreground hover:text-foreground print:hidden">
          <LogoMark size={16} /> Sent with Dues
        </Link>
      </div>
    </main>
  );
}
