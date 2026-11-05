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
