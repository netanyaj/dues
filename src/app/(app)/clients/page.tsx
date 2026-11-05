import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { listClients } from "@/lib/service/clients";
import { listInvoices } from "@/lib/service/invoices";
import { stateName } from "@/lib/domain/gst";
import { formatINR } from "@/lib/domain/money";
import { AutoRefresh } from "@/components/bits";
import { EmptyState } from "@/components/empty-state";
import { ClientForm } from "./client-form";
import { PageHeader } from "@/components/ds";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const [clients, invoices] = await Promise.all([listClients(ctx), listInvoices(ctx, { status: "outstanding", limit: 500 })]);
  const owed = new Map<string, number>();
  for (const i of invoices) owed.set(i.client_id, (owed.get(i.client_id) ?? 0) + i.balance_paise);
  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh seconds={15} />
      <PageHeader title="Clients" description="Who you bill, and what each one owes you." />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section>
          {clients.length === 0 ? (
            <EmptyState title="No clients yet">
              Add one here, or ask Claude: &ldquo;Set up my client Acme Corp in Bengaluru, Karnataka.&rdquo;
            </EmptyState>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {clients.map((c) => (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[#fafafa]">
                    <span>
                      <span className="title-4">{c.name}</span>
                      <span className="amount block caption-5 text-muted-foreground">{stateName(c.state_code)}{c.gstin ? ` · ${c.gstin}` : " · no GSTIN"}</span>
                    </span>
                    <span className="amount shrink-0 text-right body-5">{owed.get(c.id) ? <>{formatINR(owed.get(c.id)!, { decimals: "auto" })}<span className="block caption-5 font-normal text-muted-foreground">owed</span></> : <span className="font-normal text-muted-foreground">Nothing owed</span>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border bg-card p-5" id="new">
          <h2 className="mb-4 title-4 font-semibold">{sp.new ? "Add a client to invoice" : "Add a client"}</h2>
          <ClientForm id={null} initial={{}} onDoneHref={sp.new ? "invoice" : undefined} />
        </section>
      </div>
    </div>
  );
}
