import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Ctx } from "@/lib/service/core";

/** The logged-in user's id, verified from the session JWT, or null. */
export async function sessionUser(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;
  return { id: sub, email: (data.claims.email as string | undefined) ?? null };
}

/** For pages and server actions: the service-layer context for the logged-in user, or redirect to /login. */
export async function requireCtx(): Promise<Ctx & { email: string | null }> {
  const u = await sessionUser();
  if (!u) redirect("/login");
  return { userId: u.id, actor: "user", email: u.email };
}
