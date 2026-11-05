"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/auth";
import { toDuesError } from "@/lib/service/core";
import { saveClient } from "@/lib/service/clients";

export type ClientFormState = { ok?: string; error?: string; errors?: Record<string, string>; values?: Record<string, string>; id?: string; nonce?: number };

const FIELDS = ["name", "email", "phone", "address", "gstin", "state_code"] as const;

export async function saveClientAction(id: string | null, _: ClientFormState, fd: FormData): Promise<ClientFormState> {
  const ctx = await requireCtx();
  const values: Record<string, string> = {};
  for (const f of FIELDS) values[f] = String(fd.get(f) ?? "");
  try {
    const r = await saveClient(ctx, id, values);
    if (!r.ok) return { errors: r.errors, values, error: "Some fields need fixing.", nonce: Date.now() };
    revalidatePath("/clients");
    revalidatePath(`/clients/${r.client.id}`);
    return { ok: id ? "Client saved." : `${r.client.name} added.`, id: r.client.id, values: id ? values : {}, nonce: Date.now() };
  } catch (e) {
    return { error: toDuesError(e).message, values, nonce: Date.now() };
  }
}

/** D36: "+ New client" side panel on the invoice form. Same validation as the Clients page. */
export async function createClientInlineAction(input: { name: string; state_code: string; gstin?: string; email?: string; phone?: string }):
  Promise<{ ok: true; client: { id: string; name: string; state_code: string; gstin: string | null } } | { ok: false; errors: Record<string, string>; error?: string }> {
  const ctx = await requireCtx();
  if (!input.state_code) return { ok: false, errors: { state_code: "Choose their state. It decides CGST + SGST or IGST." } };
  try {
    const r = await saveClient(ctx, null, input);
    if (!r.ok) return { ok: false, errors: r.errors };
    revalidatePath("/clients");
    return { ok: true, client: { id: r.client.id, name: r.client.name, state_code: r.client.state_code, gstin: r.client.gstin } };
  } catch (e) {
    return { ok: false, errors: {}, error: toDuesError(e).message };
  }
}
