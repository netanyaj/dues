"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { reportAbusePublic, reportPaymentPublic } from "@/lib/service/payments";

export type PaidState = { ok?: boolean; error?: string; field?: string; values?: { amount: string; utr: string; method: string } };

export async function reportPaidAction(publicId: string, _: PaidState, fd: FormData): Promise<PaidState> {
  const values = { amount: String(fd.get("amount") ?? ""), utr: String(fd.get("utr") ?? ""), method: String(fd.get("method") ?? "bank_transfer") };
  const r = await reportPaymentPublic(publicId, { amount_rupees: values.amount, utr: values.utr, method: values.method });
  if (!r.ok) return { error: r.error, field: r.field, values };
  revalidatePath(`/i/${publicId}`);
  return { ok: true };
}

export async function reportAbuseAction(publicId: string, reason: string): Promise<{ ok: boolean }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;
  return reportAbusePublic(publicId, reason, ipHash);
}
