import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/lib/service/core";
import { confirmTotals, createDraft, findInvoice, sendInvoice, updateDraft } from "@/lib/service/invoices";

const enabled = !!process.env.SUPABASE_SECRET_KEY;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://x", process.env.SUPABASE_SECRET_KEY ?? "x", { auth: { persistSession: false } });

describe.skipIf(!enabled)("confirmed totals stay confirmed (TESTING T4 bug)", () => {
  let userId = "";
  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({ email: `review-${randomBytes(4).toString("hex")}@example.com`, password: `R!${randomBytes(12).toString("hex")}`, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    await admin.from("profiles").update({ business_name: "Review Test", state_code: "29", gstin: null }).eq("user_id", userId);
  });
  afterAll(async () => { if (userId) await admin.auth.admin.deleteUser(userId); });

  it("save after confirm keeps the flag off; changing the total re-checks", async () => {
    const claude: Ctx = { userId, actor: "claude" };
    const user: Ctx = { userId, actor: "user" };
    const items = [{ description: "Deck", qty: 1, rate_rupees: 30000 }];
    const d = await createDraft(claude, { client_name: "Acme", client_state: "29", items, gst_rate: 0, expected_total_rupees: 35040 });
    expect(d.invoice.needs_review).toBe(true);
    await confirmTotals(user, d.invoice.id);
    await updateDraft(user, d.invoice.id, { items, notes: "Thanks" });
    expect((await findInvoice(user, d.invoice.id)).needs_review).toBe(false);
    await updateDraft(user, d.invoice.id, { items: [{ description: "Deck", qty: 1, rate_rupees: 31000 }] });
    expect((await findInvoice(user, d.invoice.id)).needs_review).toBe(true);
  });

  it("D55: restating expected_total alone never clears the flag; a real fix or Confirm totals does", async () => {
    const claude: Ctx = { userId, actor: "claude" };
    const user: Ctx = { userId, actor: "user" };
    const items = [{ description: "Deck", qty: 1, rate_rupees: 30000 }];
    const d = await createDraft(claude, { client_name: "Acme", client_state: "29", items, gst_rate: 0, expected_total_rupees: 35040, allow_duplicate: true });
    expect(d.invoice.needs_review).toBe(true);
    // Claude restates a total that now matches Dues (₹30,000 at 0%): still flagged.
    await updateDraft(claude, d.invoice.id, { expected_total_rupees: 30000 });
    expect((await findInvoice(user, d.invoice.id)).needs_review).toBe(true);
    // A real change whose new total matches the claim clears it.
    await updateDraft(claude, d.invoice.id, { items: [{ description: "Deck", qty: 1, rate_rupees: 35040 }], expected_total_rupees: 35040 });
    expect((await findInvoice(user, d.invoice.id)).needs_review).toBe(false);
    // Flag again, then the freelancer's Confirm totals clears it.
    await updateDraft(claude, d.invoice.id, { expected_total_rupees: 99999 });
    expect((await findInvoice(user, d.invoice.id)).needs_review).toBe(true);
    await confirmTotals(user, d.invoice.id);
    expect((await findInvoice(user, d.invoice.id)).needs_review).toBe(false);
  });

  it("D35: Send is refused without bank details, even if the UI is bypassed", async () => {
    const user: Ctx = { userId, actor: "user" };
    await admin.from("profiles").update({ address: "1 MG Road", upi_id: "review.test@okicici" }).eq("user_id", userId);
    const d = await createDraft(user, { client_name: "Bankless Co", client_state: "29", items: [{ description: "Work", qty: 1, rate_rupees: 1000 }], gst_rate: 0 });
    await expect(sendInvoice(user, d.invoice.id)).rejects.toMatchObject({ code: "bank_details_required" });
    expect((await findInvoice(user, d.invoice.id)).stage).toBe("draft");
  });
});
