// Seed a fully populated demo account (D13). Re-runnable: wipes and rebuilds that account's data.
//
//   npm run seed -- sandeep@dues.test rosh@dues.test maneeshwar@dues.test spare@dues.test
//   npm run seed -- reviewer@dues.test --reset-password --new-link
//
// New accounts get a strong random password and a Claude link. Both are written ONLY to
// .demo-accounts.local.txt (gitignored), never printed to logs or committed. On re-runs the
// password and link are kept unless --reset-password / --new-link are passed
// (the link can't be shown again: only its hash is stored, D25).
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { gstinCheckChar } from "../src/lib/domain/gst";
import { addDays, formatDate, istToday } from "../src/lib/domain/dates";
import type { Ctx } from "../src/lib/service/core";
import { upsertClient } from "../src/lib/service/clients";
import { createDraft, markReadyToSend, cancelInvoice } from "../src/lib/service/invoices";
import { decideReport, recordPayment, reportPaymentPublic } from "../src/lib/service/payments";
import { saveReminder } from "../src/lib/service/reminders";
import { mcpUrl, regenerateMcpToken } from "../src/lib/service/profile";

const args = process.argv.slice(2);
const emails = args.filter((a) => a.includes("@"));
const resetPassword = args.includes("--reset-password");
const newLink = args.includes("--new-link");
if (!emails.length) {
  console.error("Usage: npm run seed -- <email> [more emails] [--reset-password] [--new-link]");
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const OUT = ".demo-accounts.local.txt";
const today = istToday();
const withCheck = (b: string) => b + gstinCheckChar(b);

async function findUser(email: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Send with a chosen "today" so seeded invoices can be overdue. Same DB function the app uses. */
async function issueOn(ctx: Ctx, id: string, day: string) {
  const { error } = await admin.rpc("issue_invoice", { p_user: ctx.userId, p_invoice: id, p_today: day, p_actor: "user" });
  if (error) throw error;
  const { data } = await admin.from("invoices").select("number, public_id").eq("id", id).single();
  return data as { number: string; public_id: string };
}

async function seedOne(email: string) {
  const name = email.split("@")[0].replace(/[^a-z]/gi, " ").trim();
  const display = name.charAt(0).toUpperCase() + name.slice(1);
  let user = await findUser(email);
  let password: string | null = null;
  if (!user) {
    password = `Dues-${randomBytes(12).toString("base64url")}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
  } else if (resetPassword) {
    password = `Dues-${randomBytes(12).toString("base64url")}`;
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
  }
  const userId = user.id;
  const ctx: Ctx = { userId, actor: "user" };
  const claude: Ctx = { userId, actor: "claude" };

  // Wipe this account's data (order matters for FKs). Numbering restarts at 0001.
  await admin.from("invoices").delete().eq("user_id", userId);
  await admin.from("clients").delete().eq("user_id", userId);
  await admin.from("invoice_counters").delete().eq("user_id", userId);
  await admin.from("events").delete().eq("user_id", userId);

  const gstin = withCheck("29AAPFD1234K1Z");
  const { error: pe } = await admin.from("profiles").update({
    business_name: `${display} Design Studio`,
    address: "2nd Floor, 14 Indiranagar 100 Feet Road, Bengaluru 560038",
    state_code: "29", gstin, pan: gstin.slice(2, 12), default_sac: "998391",
    upi_id: "dues.demo@okicici", upi_name: `${display} Design Studio`,
    bank_account_name: `${display} Design Studio`, bank_account_number: "50100234567890", bank_ifsc: "HDFC0000123",
    invoice_prefix: "INV", udyam_number: "UDYAM-KR-03-0012345", msme_category: "micro",
    is_demo: true, bank_details_changed_at: null, updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  if (pe) throw pe;

  // Three clients: Karnataka (CGST+SGST), Maharashtra (IGST), no GSTIN.
  const { client: brightline } = await upsertClient(ctx, { name: "Brightline Media", state_code: "29", gstin: withCheck("29AACCB4321M1Z"), email: "accounts@brightline.example", phone: "9845012345", address: "MG Road, Bengaluru 560001" });
  const { client: zen } = await upsertClient(ctx, { name: "Zen Labs Pvt Ltd", state_code: "27", gstin: withCheck("27AABCZ5678L1Z"), email: "ap@zenlabs.example", phone: "9820012345", address: "Lower Parel, Mumbai 400013" });
  const { client: meera } = await upsertClient(ctx, { name: "Meera Iyer", state_code: "32", phone: "9447012345", email: "meera@example.com" });

  const item = (description: string, qty: number | string, rate: number | string) => ({ description, qty, rate_rupees: rate });

  // 1. Paid in full with 10% TDS (corporate client).
  const paid = await createDraft(claude, { client_id: zen.id, items: [item("Brand identity system", 1, 60000)], gst_rate: 18, issue_date: addDays(today, -45), due_in_days: 15, allow_duplicate: true });
  await issueOn(ctx, paid.invoice.id, addDays(today, -45));
  await recordPayment(ctx, paid.invoice.id, { amount_rupees: 64800, tds_rupees: 6000, method: "bank_transfer", utr: "HDFCN52026100512", paid_on: addDays(today, -32) });

  // 2. Overdue by ~22 days, with a stage-1 reminder already saved (next suggestion: stage 3).
  const od = await createDraft(claude, { client_id: brightline.id, items: [item("Social media creatives, October", 20, 1500), item("Campaign landing page", 1, 18000)], gst_rate: 18, issue_date: addDays(today, -37), due_in_days: 15, allow_duplicate: true });
  const odIssued = await issueOn(ctx, od.invoice.id, addDays(today, -37));
  await saveReminder(claude, od.invoice.id, { channel: "whatsapp", stage: 1, message: `Hi Brightline team, a friendly reminder that invoice ${odIssued.number} for ₹56,640.00 was due on ${formatDate(addDays(today, -22))}. You can view and pay it here: ${process.env.NEXT_PUBLIC_APP_URL}/i/${odIssued.public_id}. Thank you!` });

  // 3. Overdue ~8 days, partially paid (stage 2 suggested).
  const part = await createDraft(claude, { client_id: meera.id, items: [item("Wedding invitation design", 1, 25000)], gst_rate: 18, issue_date: addDays(today, -23), due_in_days: 15, allow_duplicate: true });
  await issueOn(ctx, part.invoice.id, addDays(today, -23));
  await recordPayment(ctx, part.invoice.id, { amount_rupees: 10000, method: "upi", utr: "412345678901", paid_on: addDays(today, -12) });

  // 4. Sent, client has reported payment (needs confirmation), shortfall looks like 10% TDS.
  const rep = await createDraft(claude, { client_id: zen.id, items: [item("UX audit, 12 hours", 12, 2500)], gst_rate: 18, issue_date: addDays(today, -6), due_in_days: 15, allow_duplicate: true });
  const repIssued = await issueOn(ctx, rep.invoice.id, addDays(today, -6));
  await reportPaymentPublic(repIssued.public_id, { amount_rupees: "32400", utr: "ICICN52026110312", method: "bank_transfer" });

  // 5. Sent, not yet due.
  const sent = await createDraft(ctx, { client_id: brightline.id, items: [item("Monthly design retainer, November", 1, 40000)], gst_rate: 18, issue_date: addDays(today, -2), due_in_days: 30, allow_duplicate: true });
  await issueOn(ctx, sent.invoice.id, addDays(today, -2));

  // 6. Draft flagged for review: Claude's total doesn't match (rule 2).
  await createDraft(claude, { client_id: zen.id, items: [item("Pitch deck design", 1, 30000)], gst_rate: 18, due_in_days: 15, expected_total_rupees: 35040, allow_duplicate: true });

  // 7. Draft Claude marked ready to send.
  const ready = await createDraft(claude, { client_id: meera.id, items: [item("Save-the-date cards", 50, 120)], gst_rate: 18, due_in_days: 7, allow_duplicate: true });
  await markReadyToSend(claude, ready.invoice.id);

  // 8. Plain draft created in the app.
  await createDraft(ctx, { client_id: brightline.id, items: [item("Photo retouching", 15, 800)], gst_rate: 18, due_in_days: 15, allow_duplicate: true });

  // 9. Cancelled (its number stays used).
  const cx = await createDraft(ctx, { client_id: meera.id, items: [item("Logo refresh (wrong rate)", 1, 9000)], gst_rate: 18, issue_date: addDays(today, -10), due_in_days: 15, allow_duplicate: true });
  await issueOn(ctx, cx.invoice.id, addDays(today, -10));
  await cancelInvoice(ctx, cx.invoice.id, "Wrong rate; reissued");

  // A Claude-noted payment waiting for confirmation on the retainer (D24).
  await recordPayment(claude, sent.invoice.id, { amount_rupees: 20000, method: "bank_transfer", utr: "SBIN52026110412", paid_on: today });
  void decideReport;

  // Mark overdue events as the cron would.
  const { runDailyOverdue } = await import("../src/lib/service/summary");
  await runDailyOverdue();

  // Claude link: only issue a new one when there's none or --new-link (can't be shown again).
  const { data: prof } = await admin.from("profiles").select("mcp_token_hash").eq("user_id", userId).single();
  let link: string | null = null;
  if (!prof?.mcp_token_hash || newLink) link = mcpUrl(await regenerateMcpToken(ctx, { allowDemo: true }));

  const lines = [
    `# ${email}  (seeded ${new Date().toISOString()})`,
    password ? `password: ${password}` : "password: (unchanged; use --reset-password to set a new one)",
    link ? `claude link: ${link}` : "claude link: (unchanged; use --new-link to issue a new one)",
    "",
  ];
  fs.appendFileSync(OUT, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(`✓ ${email}: 3 clients, 9 invoices, reminders, payments. ${password ? "New password" : "Password kept"}; ${link ? "new link" : "link kept"} → ${OUT}`);
}

for (const e of emails) await seedOne(e);
console.log(`\nCredentials and links are in ${OUT} (gitignored). Copy them into the submission form, then delete the file.`);
