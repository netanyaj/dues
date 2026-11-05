import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ds";
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
      <PageHeader
        eyebrow={<Link href="/clients" className="hover:text-foreground hover:underline">Clients</Link>}
        title={client.name}
        actions={<Button asChild><Link href={`/invoices/new?client=${client.id}`}><PlusIcon aria-hidden weight="bold" />New invoice</Link></Button>}
      />
      <dl className="grid grid-cols-3 divide-x rounded-xl border bg-card">
        {[["Still owed", stats.outstanding_paise, ""], ["Late", stats.overdue_paise, stats.overdue_paise ? "text-late" : ""], ["TDS to date", stats.tds_paise, ""]].map(([label, v, tone]) => (
          <div key={label as string} className="min-w-0 px-4 py-3">
            <dt className="caption-4 text-muted-foreground">{label}</dt>
            <dd className={`amount mt-0.5 title-3 font-semibold ${tone}`}>{formatINR(v as number, { decimals: "auto" })}</dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section>
          <h2 className="mb-3 title-4 font-semibold">Invoices</h2>
          {invoices.length === 0 ? (
            <EmptyState title="No invoices for this client yet">Create one here, or ask Claude to invoice {client.name}.</EmptyState>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {invoices.map((i) => (
                <li key={i.id}>
                  <Link href={`/invoices/${i.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[#fafafa]">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="amount title-4">{i.number ?? `Draft · ${formatDate(i.created_at.slice(0, 10))}`}</span>
                      {i.source === "claude" && <ClaudeBadge />}
                    </span>
                    <span className="flex flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                      <span className="amount body-5">{formatINR(i.total_paise)}</span>
                      <StatusBadge status={i.status} pendingReports={i.pending_reports} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 title-4 font-semibold">Details</h2>
          <ClientForm id={client.id} initial={{ name: client.name, email: client.email ?? "", phone: client.phone ?? "", address: client.address ?? "", gstin: client.gstin ?? "", state_code: client.state_code }} />
          <p className="mt-3 caption-5 text-muted-foreground">Changes apply to drafts and future invoices. Sent invoices keep the details they were sent with.</p>
        </section>
      </div>
    </div>
  );
}
