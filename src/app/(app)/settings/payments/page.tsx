import type { Metadata } from "next";
import { SettingsForm } from "../settings-form";
import { SectionHeader } from "../section-header";
import { loadSettings } from "../load";

export const metadata: Metadata = { title: "Getting paid" };

export default async function PaymentSettings({ searchParams }: PageProps<"/settings/payments">) {
  const { initial, welcome } = await loadSettings(searchParams);
  return (
    <>
      <SectionHeader step={welcome ? "Step 3 of 4" : undefined} title="Getting paid" description="Money goes straight to you. Dues never holds it and charges no fees. Add a bank account, a UPI ID, or both." />
      <SettingsForm
        section="payments"
        welcome={welcome}
        next="/settings/claude"
        initial={initial}
        fields={[
          {
            kind: "group", title: "Bank account", description: "Shown first on the client page, with copy buttons.",
            fields: [
              { kind: "text", name: "bank_account_name", label: "Account holder name" },
              { kind: "text", name: "bank_account_number", label: "Account number", inputMode: "numeric" },
              { kind: "text", name: "bank_ifsc", label: "IFSC", caps: true, maxLength: 11, hint: "11 characters, like HDFC0001234." },
            ],
          },
          {
            kind: "group", title: "UPI",
            fields: [
              { kind: "text", name: "upi_id", label: "UPI ID", placeholder: "yourname@okicici" },
              { kind: "text", name: "upi_name", label: "Name shown in UPI apps" },
              { kind: "toggle", name: "show_upi_qr", label: "Show a UPI QR code and pay button", hint: "Only for balances up to ₹1,00,000, the UPI limit per payment. Larger amounts show bank details only." },
            ],
          },
        ]}
        footer={
          <div className="rounded-lg bg-muted px-4 py-3 body-6">
            <p className="title-4">What your client sees about these details</p>
            <p className="mt-1 text-muted-foreground">
              Every client page says: &ldquo;Dues does not verify businesses or bank details&rdquo;, with Business and Bank account marked Not verified. New accounts (under 30 days) and bank details changed in the 7 days before sending get an extra line asking the client to confirm by phone. This protects your clients from fake invoices that copy your name.
            </p>
          </div>
        }
      />
    </>
  );
}
