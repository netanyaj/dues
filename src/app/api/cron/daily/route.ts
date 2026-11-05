// Vercel Cron, daily (vercel.json). Protected by CRON_SECRET (Vercel sends it as a Bearer token).
// Status is derived (D4), so this changes no state: it logs one "became_overdue" event per invoice.
import { timingSafeEqual } from "node:crypto";
import { runDailyOverdue } from "@/lib/service/summary";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Not authorised." }, { status: 401 });
  const started = Date.now();
  const r = await runDailyOverdue();
  return Response.json({ ok: true, ...r, ms: Date.now() - started });
}
