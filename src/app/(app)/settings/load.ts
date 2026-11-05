import { requireCtx } from "@/lib/auth";
import { getProfile, profileAsInput } from "@/lib/service/profile";

export async function loadSettings(searchParams: Promise<Record<string, string | string[] | undefined>>) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const profile = await getProfile(ctx);
  const raw = profileAsInput(profile);
  const initial = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v ?? ""])) as Record<string, string>;
  return { ctx, profile, initial, welcome: sp.welcome === "1" };
}
