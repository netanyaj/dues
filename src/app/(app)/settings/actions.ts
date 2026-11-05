"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { db, toDuesError } from "@/lib/service/core";
import { DEMO_DISABLED, getProfile, regenerateMcpToken, updateProfileSection, type ProfileInput } from "@/lib/service/profile";
import { supabaseServer } from "@/lib/supabase/server";
import { SECTIONS, type FormSection } from "./sections";

export type SectionState = { ok?: string; error?: string; errors?: Record<string, string>; values?: Record<string, string>; nonce?: number };

/** Save one Settings section. Only that section's fields are read and written (D29). */
export async function saveSectionAction(section: FormSection, _: SectionState, fd: FormData): Promise<SectionState> {
  const ctx = await requireCtx();
  const keys = SECTIONS.find((s) => s.slug === section)!.keys as readonly (keyof ProfileInput)[];
  const patch: ProfileInput = {};
  const values: Record<string, string> = {};
  for (const k of keys) {
    if (k === "show_upi_qr") values[k] = fd.get(k) === "on" ? "true" : "false";
    else values[k] = String(fd.get(k) ?? "");
    patch[k] = values[k];
  }
  // "Not GST-registered" clears the GSTIN, which is how Dues already decides "no GST" (D3).
  if (section === "tax" && fd.get("gst_registered") !== "on") { patch.gstin = ""; values.gstin = ""; }
  try {
    const res = await updateProfileSection(ctx, keys, patch);
    if (!res.ok) return { errors: res.errors, values, error: "Some fields need fixing. See the note under each one.", nonce: Date.now() };
    revalidatePath("/", "layout");
    const saved = res.profile as unknown as Record<string, unknown>;
    return { ok: "Saved", values: Object.fromEntries([...keys, "pan", "upi_name"].map((k) => [k, saved[k] == null ? "" : String(saved[k])])), nonce: Date.now() };
  } catch (e) {
    return { error: toDuesError(e).message, values, nonce: Date.now() };
  }
}

/** D25 + D28: returns the plain token exactly once. Only its hash is stored. */
export async function regenerateTokenAction(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const ctx = await requireCtx();
  try {
    const token = await regenerateMcpToken(ctx);
    revalidatePath("/settings/claude");
    return { ok: true, token };
  } catch (e) {
    return { ok: false, error: toDuesError(e).message };
  }
}

export async function changePasswordAction(_: SectionState, fd: FormData): Promise<SectionState> {
  const ctx = await requireCtx();
  const profile = await getProfile(ctx);
  if (profile.is_demo) return { error: DEMO_DISABLED };
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 8) return { errors: { password: "Use at least 8 characters." } };
  if (password !== confirm) return { errors: { confirm: "The two passwords don't match." } };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: /different|same/i.test(error.message) ? "That's your current password. Choose a new one." : "We couldn't change your password. Please try again." };
  return { ok: "Password changed. Use it next time you log in.", nonce: Date.now() };
}

/** Permanently deletes the account and everything in it (all tables cascade from auth.users). */
export async function deleteAccountAction(_: SectionState, fd: FormData): Promise<SectionState> {
  const ctx = await requireCtx();
  const profile = await getProfile(ctx);
  if (profile.is_demo) return { error: DEMO_DISABLED };
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") return { errors: { confirm: "Type DELETE to confirm." } };
  const supabase = await supabaseServer();
  const { error } = await db().auth.admin.deleteUser(ctx.userId);
  if (error) return { error: "We couldn't delete your account. Please try again." };
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
