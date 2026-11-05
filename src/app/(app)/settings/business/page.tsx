import type { Metadata } from "next";
import { STATE_OPTIONS } from "@/lib/domain/gst";
import { SettingsForm } from "../settings-form";
import { SectionHeader } from "../section-header";
import { loadSettings } from "../load";

export const metadata: Metadata = { title: "Business profile" };

export default async function BusinessSettings({ searchParams }: PageProps<"/settings/business">) {
  const { initial, welcome } = await loadSettings(searchParams);
  return (
    <>
      <SectionHeader
        step={welcome ? "Step 1 of 4 · about a minute in all" : undefined}
        title={welcome ? "Set up Dues" : "Business profile"}
        description={welcome ? "These go on every invoice. You can add clients and drafts before you finish; only sending needs this." : "Your name and address as they appear on invoices."}
      />
      <SettingsForm
        section="business"
        welcome={welcome}
        next="/settings/tax"
        initial={initial}
        fields={[
          { kind: "text", name: "business_name", label: "Business or trading name", placeholder: "e.g. Ananya Rao Design" },
          { kind: "select", name: "state_code", label: "State", placeholder: "Choose your state", hint: "Decides CGST + SGST (same state as your client) or IGST.", options: STATE_OPTIONS.map(([c, n]) => [c, `${n} (${c})`]) },
          { kind: "textarea", name: "address", label: "Address", rows: 3, hint: "Required on a GST invoice." },
        ]}
        footer={<p className="caption-5 text-muted-foreground">Logo on invoices is coming in a later version.</p>}
      />
    </>
  );
}
