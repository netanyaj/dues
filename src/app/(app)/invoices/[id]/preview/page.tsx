import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { DuesError } from "@/lib/service/core";
import { getClient } from "@/lib/service/clients";
import { getInvoiceDetail } from "@/lib/service/invoices";
import { getProfile } from "@/lib/service/profile";
import { InvoiceDocument } from "@/components/invoice-document";
import { Button } from "@/components/ui/button";
import { docFromInvoice } from "@/lib/view";

export const metadata: Metadata = { title: "Preview · Dues" };

// Private preview for the logged-in freelancer only (D7). Drafts have no public link.
export default async function Preview({ params }: PageProps<"/invoices/[id]/preview">) {
  const ctx = await requireCtx();
  const { id } = await params;
  let detail;
  try { detail = await getInvoiceDetail(ctx, id); } catch (e) {
    if (e instanceof DuesError && e.code === "invoice_not_found") notFound();
    throw e;
  }
  const [profile, client] = await Promise.all([getProfile(ctx), getClient(ctx, detail.invoice.client_id)]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="print:hidden"><Button asChild variant="outline" size="sm"><Link href={`/invoices/${id}`}>← Back to invoice</Link></Button></div>
      <InvoiceDocument d={docFromInvoice(detail.invoice, detail.items, { profile, client })} />
    </div>
  );
}
