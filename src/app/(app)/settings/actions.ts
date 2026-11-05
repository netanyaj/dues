"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/auth";
import { toDuesError } from "@/lib/service/core";
import { mcpUrl, regenerateMcpToken, updateProfile, type ProfileInput } from "@/lib/service/profile";

export type ProfileState = { ok?: string; error?: string; errors?: Record<string, string>; values?: Record<string, string>; nonce?: number };

const FIELDS = ["business_name", "address", "gstin", "pan", "state_code", "default_sac", "upi_id", "upi_name", "bank_account_name", "bank_account_number", "bank_ifsc", "invoice_prefix", "udyam_number", "msme_category"] as const;

export async function saveProfileAction(_: ProfileState, fd: FormData): Promise<ProfileState> {
  const ctx = await requireCtx();
  const input: ProfileInput = {};
  const values: Record<string, string> = {};
  for (const f of FIELDS) {
    values[f] = String(fd.get(f) ?? "");
    input[f] = values[f];
  }
  try {
    const res = await updateProfile(ctx, input);
    if (!res.ok) return { errors: res.errors, values, error: "Some fields need fixing. See the notes below each one.", nonce: Date.now() };
    revalidatePath("/", "layout");
    return { ok: "Saved.", values: Object.fromEntries(FIELDS.map((k) => [k, res.profile[k] == null ? "" : String(res.profile[k])])), nonce: Date.now() };
  } catch (e) {
    return { error: toDuesError(e).message, values, nonce: Date.now() };
  }
}

/** D25: returns the plain link exactly once. Only its hash is stored. */
export async function regenerateLinkAction(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx = await requireCtx();
  try {
    const token = await regenerateMcpToken(ctx);
    revalidatePath("/settings");
    return { ok: true, url: mcpUrl(token) };
  } catch (e) {
    return { ok: false, error: toDuesError(e).message };
  }
}
