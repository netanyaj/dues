"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getProfile, isSetupComplete } from "@/lib/service/profile";

export type AuthState = { error?: string; fields?: { email?: string } };

function readForm(fd: FormData) {
  return { email: String(fd.get("email") ?? "").trim().toLowerCase(), password: String(fd.get("password") ?? "") };
}

function safeNext(next: unknown): string | null {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : null;
}

async function landing(userId: string, next: string | null): Promise<string> {
  const profile = await getProfile({ userId, actor: "user" });
  if (!isSetupComplete(profile)) return "/settings?welcome=1";
  return next ?? "/dashboard";
}

export async function login(_: AuthState, fd: FormData): Promise<AuthState> {
  const { email, password } = readForm(fd);
  if (!email || !password) return { error: "Enter your email and password.", fields: { email } };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    const msg = /confirm/i.test(error?.message ?? "")
      ? "This email hasn't been confirmed yet."
      : "That email and password don't match. Check them and try again.";
    return { error: msg, fields: { email } };
  }
  redirect(await landing(data.user.id, safeNext(fd.get("next"))));
}

export async function signup(_: AuthState, fd: FormData): Promise<AuthState> {
  const { email, password } = readForm(fd);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address.", fields: { email } };
  if (password.length < 8) return { error: "Use a password of at least 8 characters.", fields: { email } };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("registered") || m.includes("exists")) return { error: "An account with this email already exists. Log in instead.", fields: { email } };
    if (m.includes("rate limit")) return { error: "Too many sign-ups right now. Please wait a minute and try again.", fields: { email } };
    if (m.includes("password")) return { error: error.message, fields: { email } };
    if (m.includes("invalid")) return { error: "That email address can't be used. Try another one.", fields: { email } };
    console.error("signup failed", error);
    return { error: "We couldn't create your account. Please try again.", fields: { email } };
  }
  if (!data.session) {
    // Email confirmation is switched on in Supabase. DECISIONS.md D12 says it should be off.
    return { error: "Account created, but email confirmation is switched on for this project, so you can't log in yet.", fields: { email } };
  }
  redirect("/settings?welcome=1");
}

export async function logout() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
