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

export const metadata: Metadata = { title: "Clients · Dues" };

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const [clients, invoices] = await Promise.all([listClients(ctx), listInvoices(ctx, { status: "outstanding", limit: 500 })]);
  const owed = new Map<string, number>();
  for (const i of invoices) owed.set(i.client_id, (owed.get(i.client_id) ?? 0) + i.balance_paise);
  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh seconds={15} />
      <h1 className="text-2xl font-semibold">Clients</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
        <section>
          {clients.length === 0 ? (
            <EmptyState title="No clients yet">
              Add one here, or ask Claude: &ldquo;Set up my client Acme Corp in Bengaluru, Karnataka.&rdquo;
            </EmptyState>
          ) : (
            <ul className="divide-y rounded-lg border">
              {clients.map((c) => (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/40">
                    <span>
                      <span className="font-medium">{c.name}</span>
                      <span className="block text-sm text-muted-foreground">{stateName(c.state_code)}{c.gstin ? ` · ${c.gstin}` : " · no GSTIN"}</span>
                    </span>
                    <span className="text-sm tabular-nums">{owed.get(c.id) ? `${formatINR(owed.get(c.id)!)} owed` : <span className="text-muted-foreground">Nothing owed</span>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="h-fit rounded-lg border p-5" id="new">
          <h2 className="mb-4 font-medium">{sp.new ? "Add a client to invoice" : "Add a client"}</h2>
          <ClientForm id={null} initial={{}} onDoneHref={sp.new ? "invoice" : undefined} />
        </section>
      </div>
    </div>
  );
}
