import type { Metadata } from "next";
import { requireCtx } from "@/lib/auth";
import { listClients } from "@/lib/service/clients";
import { getProfile } from "@/lib/service/profile";
import { addDays, istToday } from "@/lib/domain/dates";
import { InvoiceForm } from "../invoice-form";

export const metadata: Metadata = { title: "New invoice · Dues" };

export default async function NewInvoice({ searchParams }: PageProps<"/invoices/new">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const [profile, clients] = await Promise.all([getProfile(ctx), listClients(ctx)]);
  const today = istToday();
  const preset = typeof sp.client === "string" && clients.some((c) => c.id === sp.client) ? sp.client : "";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">New invoice</h1>
        <p className="text-sm text-muted-foreground">Or ask Claude: it uses the same rules.</p>
      </div>
      <InvoiceForm
        invoiceId={null}
        clients={clients.map((c) => ({ id: c.id, name: c.name, state_code: c.state_code, gstin: c.gstin }))}
        supplier={{ state_code: profile.state_code, hasGstin: !!profile.gstin, default_sac: profile.default_sac, msmeCovered: !!profile.udyam_number && (profile.msme_category === "micro" || profile.msme_category === "small") }}
        initial={{ client_id: preset, items: [], gst_rate: profile.gstin ? 18 : 0, issue_date: today, due_date: addDays(today, 15), notes: "" }}
      />
    </div>
  );
}
