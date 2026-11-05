import type { Metadata } from "next";
import { db } from "@/lib/service/core";
import { formatInvoiceNumber, fyFor, fyLabel, istToday } from "@/lib/domain/dates";
import { SettingsForm } from "../settings-form";
import { SectionHeader } from "../section-header";
import { loadSettings } from "../load";

export const metadata: Metadata = { title: "Invoice defaults" };

export default async function InvoiceSettings({ searchParams }: PageProps<"/settings/invoices">) {
  const { ctx, profile, initial } = await loadSettings(searchParams);
  const fy = fyFor(istToday());
  const { data } = await db().from("invoice_counters").select("last_seq").eq("user_id", ctx.userId).eq("fy", fy).maybeSingle();
  const nextNumber = formatInvoiceNumber(profile.invoice_prefix, fy, (data?.last_seq ?? 0) + 1);
  return (
    <>
      <SectionHeader title="Invoice defaults" description="Starting values for new invoices, in the app and from Claude. Each invoice can change them." />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-card px-4 py-3"><p className="caption-4 text-muted-foreground">Next invoice number</p><p className="title-3 tabular-nums [overflow-wrap:anywhere]">{nextNumber}</p></div>
        <div className="rounded-xl border bg-card px-4 py-3"><p className="caption-4 text-muted-foreground">Financial year</p><p className="amount title-3">{fyLabel(fy)}</p><p className="caption-5 text-muted-foreground">Numbering restarts on 1 April</p></div>
      </div>
      <SettingsForm
        section="invoices"
        initial={initial}
        fields={[
          { kind: "text", name: "invoice_prefix", label: "Number prefix", caps: true, maxLength: 3, hint: "1 to 3 letters or digits. Keeps numbers within GST's 16-character limit. Changing it doesn't renumber sent invoices." },
          { kind: "text", name: "default_due_days", label: "Due in (days)", inputMode: "numeric", maxLength: 3, hint: "From the send date. For MSME clients, keep it at 45 or under." },
          { kind: "textarea", name: "default_notes", label: "Notes and terms", rows: 3, maxLength: 1000, placeholder: "e.g. Thank you for your business. Payment within 15 days by bank transfer or UPI.", hint: "Printed at the bottom of new invoices." },
        ]}
      />
    </>
  );
}
