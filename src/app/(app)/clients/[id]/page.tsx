import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { clientStats, getClient } from "@/lib/service/clients";
import { listInvoices } from "@/lib/service/invoices";
import { formatINR } from "@/lib/domain/money";
import { formatDate } from "@/lib/domain/dates";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ClaudeBadge, StatusBadge } from "@/components/status-badge";
import { ClientForm } from "../client-form";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: PageProps<"/clients/[id]">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const client = await getClient(ctx, id);
  if (!client) notFound();
  const [stats, invoices] = await Promise.all([clientStats(ctx, id), listInvoices(ctx, { client: id, limit: 200 })]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground"><Link href="/clients" className="hover:underline">Clients</Link></p>
          <h1 className="text-2xl font-semibold">{client.name}</h1>
        </div>
        <Button asChild><Link href={`/invoices/new?client=${client.id}`}>+ New invoice for {client.name}</Link></Button>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[["Outstanding", stats.outstanding_paise, ""], ["Overdue", stats.overdue_paise, stats.overdue_paise ? "text-red-700" : ""], ["TDS deducted to date", stats.tds_paise, ""]].map(([label, v, tone]) => (
          <div key={label as string} className="min-w-0 rounded-lg border p-3 sm:p-4">
            <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
            <p className={`mt-1 text-base font-semibold tabular-nums sm:text-2xl ${tone}`}>{formatINR(v as number, { decimals: "auto" })}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
        <section>
          <h2 className="mb-2 font-medium">Invoices</h2>
          {invoices.length === 0 ? (
            <EmptyState title="No invoices for this client yet">Create one here, or ask Claude to invoice {client.name}.</EmptyState>
          ) : (
            <ul className="divide-y rounded-lg border">
              {invoices.map((i) => (
                <li key={i.id}>
                  <Link href={`/invoices/${i.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/40">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{i.number ?? `Draft · ${formatDate(i.created_at.slice(0, 10))}`}</span>
                      {i.source === "claude" && <ClaudeBadge />}
                    </span>
                    <span className="flex items-center gap-3 text-sm">
                      <span className="tabular-nums">{formatINR(i.total_paise)}</span>
                      <StatusBadge status={i.status} pendingReports={i.pending_reports} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="h-fit rounded-lg border p-5">
          <h2 className="mb-4 font-medium">Details</h2>
          <ClientForm id={client.id} initial={{ name: client.name, email: client.email ?? "", phone: client.phone ?? "", address: client.address ?? "", gstin: client.gstin ?? "", state_code: client.state_code }} />
          <p className="mt-3 text-xs text-muted-foreground">Changes apply to drafts and future invoices. Sent invoices keep the details they were sent with.</p>
        </section>
      </div>
    </div>
  );
}
