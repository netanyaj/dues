"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/auth";
import { toDuesError } from "@/lib/service/core";
import { decideReport } from "@/lib/service/payments";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function decideReportAction(paymentId: string, decision: "confirm" | "reject", amount?: string, tds?: string): Promise<ActionResult> {
  const ctx = await requireCtx();
  try {
    const r = await decideReport(ctx, paymentId, decision, { amount_rupees: amount ?? null, tds_rupees: tds ?? null });
    revalidatePath("/dashboard");
    revalidatePath(`/invoices/${r.invoice.id}`);
    return { ok: true, message: r.message };
  } catch (e) {
    return { ok: false, error: toDuesError(e).message };
  }
}
