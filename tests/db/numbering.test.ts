// Runs against a real Supabase project (needs .env.local). Skipped otherwise.
// Proves: concurrent sends never share a number; RLS isolates users;
// browser roles can't call the server-only functions.
import { config } from "dotenv";
config({ path: ".env.local" });
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gstinCheckChar } from "@/lib/domain/gst";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const enabled = !!(URL && PUBLISHABLE && SECRET);

describe.skipIf(!enabled)("database: numbering, RLS, function grants", () => {
  let admin: SupabaseClient;
  const users: { id: string; email: string; password: string }[] = [];
  const stamp = Date.now();
  let userA = { id: "" };

  async function makeUser(tag: string) {
    const email = `test-${tag}-${stamp}@dues.test`;
    const password = `T3st!${stamp}${tag}xx`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push({ id: data.user.id, email, password });
    const gstin = "29ABCDE1234F1Z" + gstinCheckChar("29ABCDE1234F1Z");
    const { error: pe } = await admin.from("profiles").update({
      business_name: `Test ${tag}`, address: "1 MG Road, Bengaluru", state_code: "29", gstin, invoice_prefix: "TST", upi_id: "test.user@okicici", bank_ifsc: "HDFC0001234", bank_account_number: "50100123456789",
    }).eq("user_id", data.user.id);
    if (pe) throw pe;
    const { data: c, error: ce } = await admin.from("clients").insert({ user_id: data.user.id, name: `Client ${tag}`, state_code: "29" }).select().single();
    if (ce) throw ce;
    return { userId: data.user.id, clientId: c.id as string, email, password };
  }

  async function makeDraft(userId: string, clientId: string) {
    const { data, error } = await admin.rpc("save_draft", {
      p_user: userId,
      p_invoice: {
        client_id: clientId, issue_date: "2026-11-01", due_date: "2026-11-16", gst_rate: 18, gst_applicable: true,
        subtotal_paise: 100000, cgst_paise: 9000, sgst_paise: 9000, igst_paise: 0, total_paise: 118000,
        needs_review: false, source: "app",
      },
      p_items: [{ description: "Design", sac: "998391", qty: 1, rate_paise: 100000, amount_paise: 100000 }],
    });
    if (error) throw error;
    return data as string;
  }

  beforeAll(async () => {
    admin = createClient(URL!, SECRET!, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    for (const u of users) {
      await admin.from("invoices").delete().eq("user_id", u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
  });

  it("sign-up creates a profile with a unique MCP token (trigger)", async () => {
    const email = `dues-signup-test-${stamp}@example.com`;
    const anon = createClient(URL!, PUBLISHABLE!, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signUp({ email, password: `T3st!${stamp}signup` });
    expect(error).toBeNull();
    expect(data.session).not.toBeNull(); // email confirmation must be OFF
    users.push({ id: data.user!.id, email, password: "" });
    const { data: p } = await admin.from("profiles").select("mcp_token, is_demo").eq("user_id", data.user!.id).single();
    expect(p!.mcp_token).toMatch(/^[0-9a-f]{48}$/);
    expect(p!.is_demo).toBe(false);
    // The browser can't change its own profile (no is_demo flipping, no token writes).
    await anon.auth.setSession(data.session!);
    const w = await anon.from("profiles").update({ is_demo: true }).eq("user_id", data.user!.id).select();
    expect(w.data ?? []).toEqual([]);
  });

  it("20 concurrent sends get 20 distinct, consecutive numbers", async () => {
    const a = await makeUser("a");
    userA = { id: a.userId };
    const drafts = await Promise.all(Array.from({ length: 20 }, () => makeDraft(a.userId, a.clientId)));
    const results = await Promise.all(
      drafts.map((id) => admin.rpc("issue_invoice", { p_user: a.userId, p_invoice: id, p_today: "2026-11-05", p_actor: "user" })),
    );
    for (const r of results) expect(r.error).toBeNull();
    const seqs = results.map((r) => (r.data as { seq: number }).seq).sort((x, y) => x - y);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const numbers = new Set(results.map((r) => (r.data as { number: string }).number));
    expect(numbers.size).toBe(20);
    expect([...numbers]).toContain("TST/2026-27/0001");
    // Send moved the dates to "today" and kept 15-day terms
    const first = results[0].data as { issue_date: string; due_date: string; public_id: string };
    expect(first.issue_date).toBe("2026-11-05");
    expect(first.due_date).toBe("2026-11-20");
    expect(first.public_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("sending twice is refused and doesn't burn a number", async () => {
    const u = userA;
    const { data: c } = await admin.from("clients").select("id").eq("user_id", u.id).single();
    const id = await makeDraft(u.id, c!.id);
    const one = await admin.rpc("issue_invoice", { p_user: u.id, p_invoice: id, p_today: "2026-11-05", p_actor: "user" });
    const two = await admin.rpc("issue_invoice", { p_user: u.id, p_invoice: id, p_today: "2026-11-05", p_actor: "user" });
    expect(one.error).toBeNull();
    expect(two.error?.message).toMatch(/already_issued/);
    const { data: counter } = await admin.from("invoice_counters").select("last_seq").eq("user_id", u.id).single();
    expect(counter!.last_seq).toBe(21);
  });

  it("sent invoices are locked against save_draft", async () => {
    const u = userA;
    const { data: inv } = await admin.from("invoices").select("id, client_id").eq("user_id", u.id).eq("stage", "issued").limit(1).single();
    const r = await admin.rpc("save_draft", {
      p_user: u.id,
      p_invoice: { id: inv!.id, client_id: inv!.client_id, issue_date: "2026-11-01", due_date: "2026-11-16", gst_rate: 0, gst_applicable: true, subtotal_paise: 1, cgst_paise: 0, sgst_paise: 0, igst_paise: 0, total_paise: 1, needs_review: false, source: "app" },
      p_items: [],
    });
    expect(r.error?.message).toMatch(/invoice_locked/);
  });

  it("flagged drafts can't be sent", async () => {
    const u = userA;
    const { data: c } = await admin.from("clients").select("id").eq("user_id", u.id).single();
    const id = await makeDraft(u.id, c!.id);
    await admin.from("invoices").update({ needs_review: true, review_reason: "test" }).eq("id", id);
    const r = await admin.rpc("issue_invoice", { p_user: u.id, p_invoice: id, p_today: "2026-11-05", p_actor: "user" });
    expect(r.error?.message).toMatch(/needs_review/);
  });

  it("another user sees none of this user's data, and can't call server functions", async () => {
    const b = await makeUser("b");
    const asB = createClient(URL!, PUBLISHABLE!, { auth: { persistSession: false } });
    const { error: se } = await asB.auth.signInWithPassword({ email: b.email, password: b.password });
    expect(se).toBeNull();
    const aId = userA.id;
    const inv = await asB.from("invoices").select("id").eq("user_id", aId);
    expect(inv.data).toEqual([]);
    const view = await asB.from("invoice_view").select("id").eq("user_id", aId);
    expect(view.data).toEqual([]);
    const prof = await asB.from("profiles").select("mcp_token").eq("user_id", aId);
    expect(prof.data).toEqual([]);
    const own = await asB.from("profiles").select("user_id").single();
    expect(own.data?.user_id).toBe(b.userId);

    const rpc = await asB.rpc("issue_invoice", { p_user: aId, p_invoice: "00000000-0000-0000-0000-000000000000", p_today: "2026-11-05", p_actor: "user" });
    expect(rpc.error).not.toBeNull();
    expect(rpc.error?.message).toMatch(/permission denied/);
    const anon = createClient(URL!, PUBLISHABLE!, { auth: { persistSession: false } });
    const anonRead = await anon.from("invoices").select("id");
    expect(anonRead.data ?? []).toEqual([]);
    // Browser can't write invoices directly even for itself.
    const write = await asB.from("invoices").update({ total_paise: 1 }).eq("user_id", b.userId).select();
    expect(write.data ?? []).toEqual([]);
  });

  it("invoice_view derives overdue and paid", async () => {
    const u = userA;
    const { data: inv } = await admin.from("invoices").select("id, total_paise").eq("user_id", u.id).eq("stage", "issued").order("seq").limit(2);
    const [x, y] = inv!;
    await admin.from("invoices").update({ issue_date: "2026-10-01", due_date: "2026-10-16" }).eq("id", x.id);
    await admin.from("payments").insert({ invoice_id: y.id, user_id: u.id, amount_paise: y.total_paise - 10000, tds_paise: 10000, paid_on: "2026-11-05", reported_by: "user", status: "confirmed" });
    const { data: vx } = await admin.from("invoice_view").select("status, days_overdue").eq("id", x.id).single();
    const { data: vy } = await admin.from("invoice_view").select("status, balance_paise").eq("id", y.id).single();
    expect(vx!.status).toBe("overdue");
    expect(vx!.days_overdue).toBeGreaterThan(0);
    expect(vy).toEqual({ status: "paid", balance_paise: 0 });
  });
});
