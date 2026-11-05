/* eslint-disable @typescript-eslint/no-explicit-any */
// MCP integration test: calls every Dues tool over HTTP (Streamable HTTP, JSON-RPC)
// against a running server and checks the results.
//   npm run dev   (in another terminal)
//   npm run test:mcp            # or BASE_URL=https://… npm run test:mcp
// Creates two throwaway users and deletes them at the end.
import { config } from "dotenv";
config({ path: ".env.local" });
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { gstinCheckChar } from "../../src/lib/domain/gst";
import { regenerateMcpToken } from "../../src/lib/service/profile";
import { sendInvoice } from "../../src/lib/service/invoices";
import { pendingReports, reportPaymentPublic } from "../../src/lib/service/payments";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const created: string[] = [];
let passed = 0;

function step(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}

// D28: one URL, token in the Authorization header only.
async function rpc(token: string | null, method: string, params: unknown = {}, id = 1, url = `${BASE}/api/mcp`): Promise<{ result?: any; error?: any; status: number; headers?: Headers }> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  const text = await res.text();
  const json = text.startsWith("{") ? JSON.parse(text) : JSON.parse(text.split("\n").find((l) => l.startsWith("data: "))!.slice(6));
  return { ...json, status: res.status, headers: res.headers };
}

async function call(token: string, tool: string, args: Record<string, unknown> = {}) {
  const r = await rpc(token, "tools/call", { name: tool, arguments: args });
  assert.ok(r.result, `${tool}: no result ${JSON.stringify(r.error)}`);
  const text = r.result.content[0].text as string;
  return { isError: !!r.result.isError, text, data: r.result.isError ? null : JSON.parse(text) };
}

async function makeUser(tag: string) {
  const email = `mcp-${tag}-${stamp}@dues.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: `Mcp!${stamp}${tag}xyz`, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const gstin = "29ABCDE1234F1Z" + gstinCheckChar("29ABCDE1234F1Z");
  await admin.from("profiles").update({
    business_name: `MCP Test ${tag}`, address: "1 MG Road, Bengaluru", state_code: "29", gstin, pan: "ABCDE1234F",
    upi_id: "mcp.test@okicici", bank_account_name: "MCP Test", bank_account_number: "50100123456789", bank_ifsc: "HDFC0001234",
  }).eq("user_id", data.user.id);
  const token = await regenerateMcpToken({ userId: data.user.id, actor: "user" });
  return { userId: data.user.id, token };
}

async function main() {
  console.log(`MCP integration against ${BASE}`);
  const a = await makeUser("a");
  const b = await makeUser("b");

  // Protocol
  const init = await rpc(a.token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "dues-test", version: "1" } });
  assert.equal(init.result.serverInfo.name, "Dues");
  step("initialize");
  const list = await rpc(a.token, "tools/list");
  const names = list.result.tools.map((t: any) => t.name).sort();
  assert.deepEqual(names, ["create_invoice", "get_business_profile", "get_receivables_summary", "list_invoices", "mark_ready_to_send", "record_payment", "save_reminder", "update_draft_invoice", "upsert_client"]);
  assert.ok(!names.includes("mark_invoice_sent"), "no tool may send (D24)");
  const ro = Object.fromEntries(list.result.tools.map((t: any) => [t.name, t.annotations?.readOnlyHint]));
  assert.equal(ro.get_business_profile, true); assert.equal(ro.list_invoices, true); assert.equal(ro.get_receivables_summary, true);
  step("tools/list: 9 tools, no send tool, read-only hints set");

  // get_business_profile
  const prof = await call(a.token, "get_business_profile");
  assert.equal(prof.data.setup_complete, true);
  assert.equal(prof.data.gst_registered, true);
  step("get_business_profile");

  // create_invoice with an inline new client (D21) and the brief's example
  const inv = await call(a.token, "create_invoice", {
    client_name: "Acme Corp", client_state: "Karnataka", client_phone: "9845012345",
    items: [{ description: "Design", qty: 12, rate_rupees: 2500 }], gst_rate: 18, due_in_days: 15, expected_total_rupees: 35400,
  });
  assert.equal(inv.isError, false, inv.text);
  assert.equal(inv.data.total, "₹35,400.00");
  assert.equal(inv.data.tax.cgst, "₹2,700.00");
  assert.equal(inv.data.tax.sgst, "₹2,700.00");
  assert.equal(inv.data.number, null, "drafts have no number (D1)");
  assert.equal(inv.data.needs_review, false);
  assert.ok(inv.data.notes_for_you?.some((n: string) => n.startsWith("Created a new client")));
  step("create_invoice: inline client, ₹30,000 + CGST/SGST ₹2,700 each = ₹35,400, no number");

  // missing state for a new client → actionable error
  const noState = await call(a.token, "create_invoice", { client_name: "Brand New Ltd", items: [{ description: "x", qty: 1, rate_rupees: 100 }], gst_rate: 18 });
  assert.equal(noState.isError, true);
  assert.match(noState.text, /client_state/);
  step("create_invoice: new client without state → asks for client_state");

  // duplicate (D23)
  const dup = await call(a.token, "create_invoice", {
    client_name: "Acme Corp", items: [{ description: "design ", qty: "12", rate_rupees: "2500.00" }], gst_rate: 18, due_in_days: 15,
  });
  assert.equal(dup.data.id, inv.data.id);
  assert.equal(dup.data.duplicate_returned, true);
  const dup2 = await call(a.token, "create_invoice", {
    client_name: "Acme Corp", items: [{ description: "Design", qty: 12, rate_rupees: 2500 }], gst_rate: 18, allow_duplicate: true,
  });
  assert.notEqual(dup2.data.id, inv.data.id);
  step("create_invoice: retry returns the same draft; allow_duplicate creates a second");

  // Claude's number check (rule 2): IGST client, wrong claim
  const mh = await call(a.token, "create_invoice", {
    client_name: "Zen Labs", client_state: "27", items: [{ description: "Retainer", qty: 1, rate_rupees: 30000 }], gst_rate: 18, expected_total_rupees: 35040,
  });
  assert.equal(mh.data.needs_review, true);
  assert.equal(mh.data.review_reason, "Claude said ₹35,040, Dues computed ₹35,400");
  assert.equal(mh.data.tax.igst, "₹5,400.00");
  step("create_invoice: wrong expected_total → needs_review with reason; IGST for Maharashtra");

  const readyRefused = await call(a.token, "mark_ready_to_send", { id: mh.data.id });
  assert.equal(readyRefused.isError, true);
  assert.match(readyRefused.text, /flagged/);
  step("mark_ready_to_send refused while flagged");

  // update_draft_invoice fixes it
  const upd = await call(a.token, "update_draft_invoice", { id: mh.data.id, items: [{ description: "Retainer", qty: 1, rate_rupees: 29694.92 }] });
  assert.equal(upd.isError, false, upd.text);
  assert.equal(upd.data.total, "₹35,040.01"); // 29,694.92 × 1.18 = 35,040.0056; within ₹1 of the claim
  assert.equal(upd.data.needs_review, false, "re-checked against the earlier claim, now matches");
  step("update_draft_invoice: recomputes and clears the flag when totals now match");

  const ready = await call(a.token, "mark_ready_to_send", { id: mh.data.id });
  assert.equal(ready.data.ready_to_send, true);
  assert.equal(ready.data.number, null, "marking ready does not number (D24)");
  const { data: stillDraft } = await admin.from("invoices").select("stage, number, public_id").eq("id", mh.data.id).single();
  assert.deepEqual(stillDraft, { stage: "draft", number: null, public_id: null });
  step("mark_ready_to_send: flagged as ready, still a draft with no number or link");

  // upsert_client: fills blanks, never overwrites (D21/D24)
  const up = await call(a.token, "upsert_client", { name: "acme corp", phone: "9000000000", email: "ap@acme.example" });
  assert.equal(up.data.created, false);
  assert.equal(up.data.client.phone, "9845012345", "saved phone kept");
  assert.equal(up.data.client.email, "ap@acme.example", "blank email filled");
  assert.match(up.data.note, /Kept the saved phone/);
  const badG = await call(a.token, "upsert_client", { name: "Gamma", gstin: "29ABCDE1234F1ZX" });
  assert.equal(badG.isError, true);
  assert.match(badG.text, /checksum|format/);
  step("upsert_client: fills blanks, won't overwrite a saved phone, rejects a bad GSTIN");

  // Human sends in the app (simulated through the service with actor "user")
  const sent = await sendInvoice({ userId: a.userId, actor: "user" }, inv.data.id);
  assert.match(sent.number!, /^INV\/\d{4}-\d{2}\/0001$/);
  step(`(app) person sends the first draft → ${sent.number}`);

  // record_payment from Claude is pending only (D24)
  const pay = await call(a.token, "record_payment", { id: sent.number!, amount_rupees: 32400, tds_rupees: 3000, method: "bank_transfer", utr: "HDFCN52026110512" });
  assert.equal(pay.data.status, "pending_confirmation");
  assert.notEqual(pay.data.invoice.status, "paid");
  const { data: pays } = await admin.from("payments").select("status, reported_by").eq("invoice_id", inv.data.id);
  assert.deepEqual(pays, [{ status: "reported", reported_by: "claude" }]);
  const over = await call(a.token, "record_payment", { id: sent.number!, amount_rupees: 99999 });
  assert.equal(over.isError, true);
  assert.match(over.text, /more than the balance/);
  step("record_payment: saved as pending (not paid); overpayment refused");

  // list + summary
  const li = await call(a.token, "list_invoices", { status: "payment_reported" });
  assert.equal(li.data.count, 1);
  assert.equal(li.data.invoices[0].payment_reported_unconfirmed, true);
  const drafts = await call(a.token, "list_invoices", { status: "draft" });
  assert.equal(drafts.data.count, 2);
  step("list_invoices: filters by derived status and the reported flag");
  const sum = await call(a.token, "get_receivables_summary");
  assert.equal(sum.data.total_outstanding, "₹35,400.00");
  assert.equal(sum.data.total_overdue, "₹0.00");
  step("get_receivables_summary");

  // save_reminder
  const rem = await call(a.token, "save_reminder", { id: sent.number!, message: `Hi Acme, a friendly reminder about ${sent.number}.`, channel: "whatsapp", stage: 1 });
  assert.match(rem.data.link, /^https:\/\/wa\.me\/919845012345\?text=Hi%20Acme/);
  assert.equal(rem.data.stage, "Stage 1 · friendly");
  const remDraft = await call(a.token, "save_reminder", { id: mh.data.id, message: "x" });
  assert.equal(remDraft.isError, true);
  step("save_reminder: wa.me link with the client's number and text; refused for drafts");

  // Locking: Claude can't edit a sent invoice
  const locked = await call(a.token, "update_draft_invoice", { id: sent.number!, notes: "change" });
  assert.equal(locked.isError, true);
  assert.match(locked.text, /locked/);
  step("update_draft_invoice refused on a sent invoice");

  // Isolation: user B's token sees none of A's data
  const bl = await call(b.token, "list_invoices");
  assert.equal(bl.data.count, 0);
  const bget = await call(b.token, "record_payment", { id: sent.number!, amount_rupees: 1 });
  assert.equal(bget.isError, true);
  assert.match(bget.text, /No invoice found/);
  step("another user's token can't see or touch this user's invoices");

  // No MCP call ever issued an invoice or confirmed a payment (D24)
  const { data: evs } = await admin.from("events").select("type, actor").in("user_id", [a.userId, b.userId]);
  assert.ok(!evs!.some((e) => e.actor === "claude" && ["sent", "payment_confirmed", "payment_recorded", "totals_confirmed", "cancelled"].includes(e.type)));
  const { data: conf } = await admin.from("payments").select("id").eq("user_id", a.userId).eq("status", "confirmed");
  assert.equal(conf!.length, 0);
  step("no MCP tool sent an invoice, confirmed totals or confirmed a payment");

  // D28: header-only auth
  const none = await rpc(null, "tools/list");
  assert.equal(none.status, 401);
  assert.match(none.error.message, /No Dues token sent/);
  assert.equal(none.headers?.get("www-authenticate") ?? null, null);
  const wrong = await rpc("f".repeat(48), "tools/list");
  assert.equal(wrong.status, 401);
  assert.match(wrong.error.message, /Token not recognised/);
  const retired = await rpc(null, "tools/list", {}, 1, `${BASE}/api/mcp/${a.token}`);
  assert.equal(retired.status, 410);
  assert.match(retired.error.message, /retired/);
  step("auth: no header → 401, wrong token → 401 (different messages, no WWW-Authenticate), old token-in-URL format → 410");

  // D32: OAuth discovery probes get a JSON 404, never the login page; CORS preflight is answered
  for (const p of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server", "/.well-known/openid-configuration", "/.well-known/oauth-protected-resource/api/mcp"]) {
    const r = await fetch(`${BASE}${p}`, { redirect: "manual" });
    assert.equal(r.status, 404, p);
    assert.match(r.headers.get("content-type") ?? "", /application\/json/, p);
  }
  const pre = await fetch(`${BASE}/api/mcp`, { method: "OPTIONS", headers: { Origin: "https://claude.ai", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization, content-type, mcp-protocol-version" } });
  assert.ok(pre.status === 204 || pre.status === 200);
  assert.match(pre.headers.get("access-control-allow-headers") ?? "", /Authorization/);
  assert.match(pre.headers.get("access-control-allow-headers") ?? "", /Mcp-Session-Id/);
  const junk = await fetch(`${BASE}/no-such-page-${Date.now()}`, { redirect: "manual" });
  assert.equal(junk.status, 404);
  for (const p of ["/icon.png", "/icon.svg", "/favicon.ico", "/apple-icon.png"]) assert.equal((await fetch(`${BASE}${p}`, { redirect: "manual" })).status, 200, p);
  step("/.well-known/* → JSON 404, OPTIONS preflight answered, unknown page → 404, icons public");

  // Regenerate cuts off the old token (D25)
  const fresh = await regenerateMcpToken({ userId: a.userId, actor: "user" });
  const old = await rpc(a.token, "tools/list");
  assert.equal(old.status, 401);
  assert.match(old.error.message, /Token not recognised/);
  const neu = await rpc(fresh, "tools/list");
  assert.equal(neu.result.tools.length, 9);
  const { data: stored } = await admin.from("profiles").select("mcp_token_hash, mcp_token_last4").eq("user_id", a.userId).single();
  assert.notEqual(stored!.mcp_token_hash, fresh);
  assert.equal(stored!.mcp_token_last4, fresh.slice(-4));
  step("regenerate: old token gets a clear 401, new token works, only the hash is stored");

  const hello = await rpc(fresh, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  assert.equal(hello.status, 200);
  assert.equal(hello.result.serverInfo.name, "Dues");
  assert.match(hello.result.serverInfo.icons?.[0]?.src ?? "", /\/icon\.png$/);
  step("initialize: 200 with serverInfo name Dues and an icon");

  // D41: header forms people type into claude.ai, and a JSON-only Accept header
  const initBody = JSON.stringify({ jsonrpc: "2.0", id: 9, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
  for (const [name, value, accept] of [["authorization", fresh, "application/json"], ["authorization", `Authorization: Bearer ${fresh}`, "application/json, text/event-stream"], ["x-api-key", fresh, "application/json, text/event-stream"]]) {
    const r = await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { [name]: value, "Content-Type": "application/json", Accept: accept }, body: initBody });
    assert.equal(r.status, 200, `${name} / ${accept}`);
  }
  step("auth accepts a bare token, a pasted full header line, x-api-key, and JSON-only Accept");

  // D38: prompts
  const pl = await rpc(fresh, "prompts/list");
  assert.deepEqual(pl.result.prompts.map((p: { name: string }) => p.name).sort(), ["chase_overdue", "invoice_client", "what_am_i_owed"]);
  const pg = await rpc(fresh, "prompts/get", { name: "invoice_client", arguments: { client: "Acme", work: "2 logos at ₹5,000" } });
  assert.match(pg.result.messages[0].content.text, /Invoice Acme for: 2 logos/);
  assert.match(pg.result.messages[0].content.text, /create_invoice/);
  step("prompts: chase_overdue, what_am_i_owed, invoice_client listed and filled in");

  // D37: client views are counted (bots and the owner aren't) and exposed to Claude
  const pid = (await admin.from("invoices").select("public_id").eq("id", sent.id).single()).data!.public_id as string;
  await fetch(`${BASE}/i/${pid}`, { headers: { "User-Agent": "WhatsApp/2.23.20.0 A" } });
  await fetch(`${BASE}/i/${pid}`, { headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" } });
  await new Promise((r) => setTimeout(r, 1500));
  const lv = await call(fresh, "list_invoices", { limit: 5 });
  const mine = lv.data.invoices.find((i: { id: string }) => i.id === sent.id);
  assert.equal(mine.client_views.count, 1);
  assert.ok(mine.client_views.last_viewed_at);
  step("client views: a phone browser counts, a WhatsApp preview doesn't; list_invoices shows it");

  // D40: proof of payment, private bucket, signed link for the owner only
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const bad = await reportPaymentPublic(pid, { amount_rupees: "1", utr: "123456789012", method: "upi" }, new File([new TextEncoder().encode("<script>alert(1)</script>")], "x.png", { type: "image/png" }));
  assert.equal(bad.ok, false);
  const good = await reportPaymentPublic(pid, { amount_rupees: "1", utr: "123456789013", method: "upi" }, new File([png], "receipt.png", { type: "image/png" }));
  assert.deepEqual(good, { ok: true, proofSaved: true });
  const pr = (await pendingReports({ userId: a.userId, actor: "user" })).find((r) => r.utr === "123456789013")!;
  assert.ok(pr.proof_url);
  assert.equal((await fetch(pr.proof_url!)).status, 200);
  const publicTry = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/payment-proofs/${pr.proof_path}`);
  assert.notEqual(publicTry.status, 200);
  await admin.storage.from("payment-proofs").remove([pr.proof_path!]);
  step("proof upload: fake image refused; real one stored privately, owner gets a signed link, public URL refused");

  console.log(`\n${passed} checks passed.`);
}

main()
  .catch((e) => {
    console.error("\n✗ FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const id of created) {
      await admin.from("invoices").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });
