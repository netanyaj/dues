import type { Metadata } from "next";
import { SettingsForm } from "../settings-form";
import { SectionHeader } from "../section-header";
import { loadSettings } from "../load";

export const metadata: Metadata = { title: "Tax and compliance" };

export default async function TaxSettings({ searchParams }: PageProps<"/settings/tax">) {
  const { initial, welcome } = await loadSettings(searchParams);
  return (
    <>
      <SectionHeader step={welcome ? "Step 2 of 4" : undefined} title="Tax and compliance" description="Dues checks the format of each number. It doesn't look them up with the government." />
      <SettingsForm
        section="tax"
        gstToggle
        welcome={welcome}
        next="/settings/payments"
        initial={initial}
        fields={[
          { kind: "text", name: "gstin", label: "GSTIN", caps: true, maxLength: 15, hint: "Checked for format, checksum and that it matches your state." },
          { kind: "text", name: "pan", label: "PAN", caps: true, maxLength: 10, hint: "Filled in from your GSTIN if you have one." },
          { kind: "select", name: "default_gst_rate", label: "Default GST rate", hint: "Used for new invoices. You can change it on each one.", options: [["18", "18%"], ["12", "12%"], ["5", "5%"], ["28", "28%"], ["0", "0%"]] },
          { kind: "text", name: "default_sac", label: "Default SAC code", inputMode: "numeric", maxLength: 8, hint: "998391 is specialty design services." },
          {
            kind: "group", title: "MSME registration (optional)",
            description: "If you're a registered micro or small enterprise, invoices state your rights under the MSMED Act, including the 45-day payment limit.",
            fields: [
              { kind: "text", name: "udyam_number", label: "Udyam registration number", caps: true, maxLength: 22, hint: "e.g. UDYAM-KR-03-0012345" },
              { kind: "select", name: "msme_category", label: "Enterprise category", placeholder: "Choose", options: [["micro", "Micro"], ["small", "Small"], ["medium", "Medium"]], hint: "As on your Udyam certificate. The late-payment rules cover micro and small." },
            ],
          },
        ]}
      />
    </>
  );
}
