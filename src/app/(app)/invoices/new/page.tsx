import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth";
import { listClients } from "@/lib/service/clients";
import { getProfile } from "@/lib/service/profile";
import { addDays, istToday } from "@/lib/domain/dates";
import { InvoiceForm } from "../invoice-form";
import { PageHeader } from "@/components/ds";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoice({ searchParams }: PageProps<"/invoices/new">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const [profile, clients] = await Promise.all([getProfile(ctx), listClients(ctx)]);
  const today = istToday();
  const preset = typeof sp.client === "string" && clients.some((c) => c.id === sp.client) ? sp.client : "";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New invoice" description="Or ask Claude to draft it. Dues applies the same tax and numbering rules either way." />
      <InvoiceForm
        invoiceId={null}
        clients={clients.map((c) => ({ id: c.id, name: c.name, state_code: c.state_code, gstin: c.gstin }))}
        supplier={{ state_code: profile.state_code, hasGstin: !!profile.gstin, default_sac: profile.default_sac, msmeCovered: !!profile.udyam_number && (profile.msme_category === "micro" || profile.msme_category === "small") }}
        initial={{ client_id: preset, items: [], gst_rate: profile.gstin ? (profile.default_gst_rate ?? 18) : 0, issue_date: today, due_date: addDays(today, profile.default_due_days ?? 15), notes: profile.default_notes ?? "" }}
      />
    </div>
  );
}
