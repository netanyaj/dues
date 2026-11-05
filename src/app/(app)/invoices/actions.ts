"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { DuesError, toDuesError } from "@/lib/service/core";
import {
  cancelInvoice, confirmTotals, createDraft, deleteDraft, sendInvoice, updateDraft, updateIssuedDetails, type DraftInput,
} from "@/lib/service/invoices";
import { recordPayment } from "@/lib/service/payments";
import { markReminderSent } from "@/lib/service/reminders";
import { updateProfileSection } from "@/lib/service/profile";

export type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string; field?: string };

function fail(e: unknown): Result {
  const d = toDuesError(e);
  return { ok: false, error: d.message, field: d.field };
}

function refresh(id?: string) {
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/invoices/${id}`);
}

export async function saveDraftAction(id: string | null, input: DraftInput): Promise<Result> {
  const ctx = await requireCtx();
  let newId: string;
  try {
    const r = id ? await updateDraft(ctx, id, input) : await createDraft(ctx, input);
    newId = r.invoice.id;
    refresh(newId);
    if (id) return { ok: true, message: r.warnings[0] ?? "Draft saved.", id: newId };
  } catch (e) {
    return fail(e);
  }
  redirect(`/invoices/${newId}?created=1`);
}

export async function confirmTotalsAction(id: string): Promise<Result> {
  const ctx = await requireCtx();
  try { await confirmTotals(ctx, id); refresh(id); return { ok: true, message: "Totals confirmed. You can send it now." }; } catch (e) { return fail(e); }
}

export async function sendAction(id: string): Promise<Result> {
  const ctx = await requireCtx();
  try {
    const inv = await sendInvoice(ctx, id);
    refresh(id);
    return { ok: true, message: `Sent as ${inv.number}. Copy the link or share it on WhatsApp.` };
  } catch (e) { return fail(e); }
}

/** D35: first Send without bank details. Saves them to the profile (same validation as Settings), then sends. */
export async function saveBankAndSendAction(id: string, f: { name: string; number: string; ifsc: string }): Promise<Result> {
  const ctx = await requireCtx();
  try {
    const saved = await updateProfileSection(ctx, ["bank_account_name", "bank_account_number", "bank_ifsc"], {
      bank_account_name: f.name, bank_account_number: f.number, bank_ifsc: f.ifsc,
    });
    if (!saved.ok) {
      const [field, error] = Object.entries(saved.errors)[0] ?? ["", "Check the bank details."];
      return { ok: false, error, field };
    }
    revalidatePath("/settings", "layout");
    const inv = await sendInvoice(ctx, id);
    refresh(id);
    return { ok: true, message: `Bank details saved. Sent as ${inv.number}.` };
  } catch (e) { return fail(e); }
}

export async function deleteDraftAction(id: string): Promise<Result> {
  const ctx = await requireCtx();
  try { await deleteDraft(ctx, id); } catch (e) { return fail(e); }
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function cancelAction(id: string, reason: string): Promise<Result> {
  const ctx = await requireCtx();
  try { const inv = await cancelInvoice(ctx, id, reason); refresh(id); return { ok: true, message: `${inv.number} cancelled. Its number stays used.` }; } catch (e) { return fail(e); }
}

export async function recordPaymentAction(id: string, f: { amount: string; tds: string; method: string; utr: string; paid_on: string }): Promise<Result> {
  const ctx = await requireCtx();
  try {
    const r = await recordPayment(ctx, id, { amount_rupees: f.amount, tds_rupees: f.tds, method: f.method, utr: f.utr, paid_on: f.paid_on });
    refresh(id);
    return { ok: true, message: r.message };
  } catch (e) { return fail(e); }
}

export async function updateIssuedAction(id: string, f: { notes?: string; due_date?: string; reason?: string }): Promise<Result> {
  const ctx = await requireCtx();
  try {
    await updateIssuedDetails(ctx, id, { notes: f.notes, due_date: f.due_date, reason: f.reason });
    refresh(id);
    return { ok: true, message: "Saved." };
  } catch (e) { return fail(e); }
}

export async function markReminderSentAction(invoiceId: string, reminderId: string): Promise<Result> {
  const ctx = await requireCtx();
  try { await markReminderSent(ctx, reminderId); refresh(invoiceId); return { ok: true }; } catch (e) { return fail(e); }
}

export { DuesError };
