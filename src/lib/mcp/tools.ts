// The Dues MCP tools. Every tool calls the same service layer as the app (D8).
// D24: no tool here can issue an invoice or confirm a payment. A test enforces it.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { toDuesError, appUrl, type Ctx } from "@/lib/service/core";
import { describeProfile, getProfile, hasBankDetails, setupGaps } from "@/lib/service/profile";
import { describeClient, upsertClient } from "@/lib/service/clients";
import { createDraft, describeInvoice, getInvoiceDetail, listInvoices, markReadyToSend, updateDraft } from "@/lib/service/invoices";
import { recordPayment } from "@/lib/service/payments";
import { describeSummary, receivablesSummary } from "@/lib/service/summary";
import { saveReminder } from "@/lib/service/reminders";
import { ALL_STATUSES, STAGE_LABEL, type ReminderStage } from "@/lib/domain/status";

const NEVER = "Dues never sends invoices or confirms payments from chat; the freelancer does that in the Dues app.";

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

function ok(data: unknown): Result {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

async function run(fn: () => Promise<unknown>): Promise<Result> {
  try {
    return ok(await fn());
  } catch (e) {
    const d = toDuesError(e);
    const hint = d.code === "profile_incomplete" ? ` Finish setup in Dues first: ${appUrl()}/settings` : "";
    return { content: [{ type: "text", text: `Error: ${d.message}${hint}` }], isError: true };
  }
}

const money = z.union([z.number(), z.string()]);
const itemSchema = z.object({
  description: z.string().describe("What was delivered, e.g. \"Logo design\" or \"Design, 12 hours\"."),
  qty: z.union([z.number(), z.string()]).describe("Quantity, up to 3 decimals (e.g. 12 hours, 1.5 days)."),
  rate_rupees: money.describe("Rate per unit in rupees, before GST, up to 2 decimals. Not paise."),
  sac: z.string().optional().describe("Optional 4–8 digit SAC code. Defaults to the freelancer's default SAC."),
});

const clientFields = {
  client_state: z.string().optional().describe("Required only if the client is new: their state name (e.g. \"Karnataka\") or 2-digit GST state code. It decides CGST+SGST vs IGST."),
  client_email: z.string().optional().describe("Optional, for a new client or to fill a blank."),
  client_phone: z.string().optional().describe("Optional, for WhatsApp reminders."),
  client_gstin: z.string().optional().describe("Optional 15-character GSTIN of the client."),
  client_address: z.string().optional(),
};

export function registerDuesTools(server: McpServer, ctx: Ctx) {
  server.registerTool(
    "get_business_profile",
    {
      title: "Get business profile",
      description:
        "Read the freelancer's business details in Dues: name, GSTIN (if GST-registered), state, UPI ID, invoice prefix, MSME status, and whether setup is complete. Call this first in a conversation. If setup_complete is false, tell the user what's missing and give them the settings link; drafts can still be created, but only complete profiles can send.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => run(async () => {
      const p = await getProfile(ctx);
      return { ...describeProfile(p), settings_url: `${appUrl()}/settings`, missing: [...setupGaps(p), ...(hasBankDetails(p) ? [] : ["bank account (the freelancer adds it at their first Send)"])] };
    }),
  );

  server.registerTool(
    "upsert_client",
    {
      title: "Add or update a client",
      description:
        "Create a client, or add missing details to an existing one (matched by name, case-insensitive). You usually don't need this: create_invoice creates new clients itself. For an existing client this only fills in blank fields; it never overwrites a saved phone, email, GSTIN, address or state (the freelancer changes those in the app). GSTINs are checked for format, checksum and state.",
      inputSchema: z.object({
        name: z.string(),
        state_code: z.string().optional().describe("State name or 2-digit GST code. Required for a new client unless gstin is given."),
        email: z.string().optional(),
        phone: z.string().optional(),
        gstin: z.string().optional(),
        address: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (a) => run(async () => {
      const r = await upsertClient(ctx, a);
      return {
        created: r.created,
        client: describeClient(r.client),
        note: r.kept.length ? `Kept the saved ${r.kept.join(", ")}. To change saved details, the freelancer edits the client in the app: ${appUrl()}/clients/${r.client.id}` : undefined,
      };
    }),
  );

  server.registerTool(
    "create_invoice",
    {
      title: "Create a draft invoice",
      description: [
        "Create a DRAFT invoice in Dues. Pass the line items and the GST rate; Dues computes every amount, the CGST/SGST or IGST split and the total.",
        "Do not calculate tax yourself; Dues computes it. Pass expected_total_rupees (your estimate of the final total including GST) only as a cross-check: if it differs from Dues by more than ₹1, the draft is flagged for the freelancer to review and can't be sent until they confirm.",
        "If the client is new, also pass client_state; the client is created in the same step.",
        "Drafts have no invoice number yet; the number is assigned when the freelancer sends it from the app. To change a draft later, use update_draft_invoice. Never create a second invoice to fix the first.",
        "A repeat call with identical details within 10 minutes returns the existing draft instead of creating a duplicate; pass allow_duplicate: true only if the user really wants two identical invoices.",
        NEVER,
      ].join(" "),
      inputSchema: z.object({
        client_name: z.string().optional().describe("Client's name. Use this or client_id."),
        client_id: z.string().optional(),
        ...clientFields,
        items: z.array(itemSchema).min(1).max(50),
        gst_rate: z.union([z.number(), z.string()]).describe("GST rate in percent: 0, 5, 12, 18 or 28. Ignored (no GST) if the freelancer has no GSTIN."),
        issue_date: z.string().optional().describe("YYYY-MM-DD. Defaults to today (India time). Becomes the send date when sent."),
        due_in_days: z.union([z.number(), z.string()]).optional().describe("Payment terms in days, e.g. 15. Use this or due_date. Default 15."),
        due_date: z.string().optional().describe("YYYY-MM-DD."),
        notes: z.string().optional().describe("Shown on the invoice."),
        expected_total_rupees: money.optional().describe("Your estimate of the total including GST, as a cross-check only."),
        allow_duplicate: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (a) => run(async () => {
      const r = await createDraft(ctx, a);
      const { items } = await getInvoiceDetail(ctx, r.invoice.id);
      return {
        ...describeInvoice(r.invoice, items),
        duplicate_returned: r.duplicate ?? false,
        notes_for_you: r.warnings.length ? r.warnings : undefined,
        next_step: r.invoice.needs_review
          ? `Tell the user the totals don't match (${r.invoice.review_reason}) and ask them to check the draft in Dues: ${describeInvoice(r.invoice).edit_url}`
          : `Ask the user to review and send it in Dues: ${describeInvoice(r.invoice).edit_url}. You can call mark_ready_to_send to put it on their "Ready to send" list.`,
      };
    }),
  );

  server.registerTool(
    "update_draft_invoice",
    {
      title: "Update a draft invoice",
      description:
        "Change a DRAFT invoice: any of client, items (replaces all items), gst_rate, dates, notes. Fields you leave out stay as they are. Dues recomputes all amounts. Pass expected_total_rupees again if you want the cross-check. Rejected if the invoice has been sent (sent invoices are locked; the freelancer cancels and reissues in the app). Identify the draft by id (drafts have no number).",
      inputSchema: z.object({
        id: z.string().describe("The draft's id, or a number if it has one."),
        client_name: z.string().optional(),
        client_id: z.string().optional(),
        ...clientFields,
        items: z.array(itemSchema).min(1).max(50).optional(),
        gst_rate: z.union([z.number(), z.string()]).optional(),
        issue_date: z.string().optional(),
        due_in_days: z.union([z.number(), z.string()]).optional(),
        due_date: z.string().optional(),
        notes: z.string().optional(),
        expected_total_rupees: money.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, ...patch }) => run(async () => {
      const r = await updateDraft(ctx, id, patch);
      const { items } = await getInvoiceDetail(ctx, r.invoice.id);
      return { ...describeInvoice(r.invoice, items), notes_for_you: r.warnings.length ? r.warnings : undefined };
    }),
  );

  server.registerTool(
    "list_invoices",
    {
      title: "List invoices",
      description:
        "List invoices, newest first, with number (null for drafts), client, total, balance, status, due date and days overdue. Status is worked out by Dues from confirmed payments and dates: draft, sent, partially_paid, overdue, paid, cancelled. Use status \"outstanding\" for anything still owed, or \"payment_reported\" for invoices with an unconfirmed payment.",
      inputSchema: z.object({
        status: z.enum(["outstanding", "payment_reported", ...ALL_STATUSES]).optional(),
        client: z.string().optional().describe("Client name (partial match) or id."),
        limit: z.number().int().min(1).max(100).optional().describe("Default 20."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (a) => run(async () => {
      const rows = await listInvoices(ctx, { status: a.status as never, client: a.client, limit: a.limit ?? 20 });
      return { count: rows.length, invoices: rows.map((r) => describeInvoice(r)) };
    }),
  );

  server.registerTool(
    "get_receivables_summary",
    {
      title: "Get receivables summary",
      description:
        "What the freelancer is owed: total outstanding, total overdue, overdue by client, paid this month, TDS deducted this month, and invoices to chase today (overdue, or due within 2 days). Each chase item may include suggested_reminder_stage (1 friendly, 2 firm, 3 final, at +3/+7/+14 days overdue). Invoices with an unconfirmed payment report are paused for 2 working days. All figures are computed by Dues; quote them as given.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => run(async () => describeSummary(await receivablesSummary(ctx))),
  );

  server.registerTool(
    "mark_ready_to_send",
    {
      title: "Mark a draft ready to send",
      description:
        "Put a draft on the freelancer's \"Ready to send\" list in Dues. This does NOT send it, give it a number or create a client link: only the freelancer can do that by pressing Send in the app. Returns the link to the draft for them. Refused if the totals are flagged for review. " + NEVER,
      inputSchema: z.object({ id: z.string().describe("The draft's id.") }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => run(async () => {
      const inv = await markReadyToSend(ctx, id);
      return { ...describeInvoice(inv), message: `Marked ready. Ask the user to open it and press Send: ${describeInvoice(inv).edit_url}` };
    }),
  );

  server.registerTool(
    "record_payment",
    {
      title: "Note a payment for the freelancer to confirm",
      description:
        "Note money the user says they received against a sent invoice. It is saved as PENDING and appears under \"Needs your confirmation\" in Dues; it does not count until the freelancer confirms it in the app against their bank statement. Corporate clients often pay the total minus about 10% TDS (deducted on the amount before GST): pass the money received as amount_rupees and the TDS as tds_rupees, so the invoice can count as fully paid once confirmed. A partial payment leaves a balance. Use the invoice number (e.g. INV/2026-27/0007) or id. " + NEVER,
      inputSchema: z.object({
        id: z.string().describe("Invoice number or id."),
        amount_rupees: money.describe("Money actually received, in rupees."),
        tds_rupees: money.optional().describe("TDS the client deducted, in rupees. Default 0."),
        method: z.enum(["upi", "bank_transfer", "other"]).optional(),
        utr: z.string().optional().describe("Bank or UPI transaction reference, if known."),
        paid_on: z.string().optional().describe("YYYY-MM-DD. Default today."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ id, ...p }) => run(async () => {
      const r = await recordPayment(ctx, id, p);
      return { status: "pending_confirmation", message: r.message, invoice: describeInvoice(r.invoice) };
    }),
  );

  server.registerTool(
    "save_reminder",
    {
      title: "Save a payment reminder",
      description:
        "Save a reminder message that you wrote for a sent, unpaid invoice. Dues stores it and returns a one-tap WhatsApp (wa.me) or email (mailto:) link with the text filled in; the freelancer taps it to send from their own phone. Dues never sends it. Use the stage from get_receivables_summary: 1 friendly, 2 firm, 3 final; match the tone. Include the invoice's public_url so the client can pay in one tap, and quote amounts exactly as Dues gives them.",
      inputSchema: z.object({
        id: z.string().describe("Invoice number or id."),
        message: z.string().min(1).max(2000),
        channel: z.enum(["whatsapp", "email"]).optional().describe("Default whatsapp."),
        stage: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (a) => run(async () => {
      const r = await saveReminder(ctx, a.id, a);
      return {
        saved: true,
        stage: r.reminder.stage ? STAGE_LABEL[r.reminder.stage as ReminderStage] : undefined,
        channel: r.reminder.channel,
        link: r.link,
        notes_for_you: r.warnings.length ? r.warnings : undefined,
        tell_the_user: `Saved. Tap to send from your phone: ${r.link}. It's also on the invoice in Dues.`,
      };
    }),
  );

  registerDuesPrompts(server);
}

// D38: prompts show up in Claude's "+" menu. Each is a short template that names the Dues tools
// to use, so the user gets the right flow without remembering tool names. No logic lives here.
const PROMPTS: { name: string; title: string; description: string; args?: Record<string, string>; text: (a: Record<string, string | undefined>) => string }[] = [
  {
    name: "chase_overdue",
    title: "Chase my overdue invoices",
    description: "Find who to chase today and draft reminders in my tone.",
    text: () =>
      "Chase my overdue invoices. Call get_business_profile for my reminder tone and channel, then get_receivables_summary. " +
      "For each invoice in to_chase_today, write a reminder at its suggested_reminder_stage (1 friendly, 2 firm, 3 final) that quotes the balance and due date exactly as Dues gives them and includes the invoice's public_url. " +
      "Mention if the client hasn't opened the invoice yet (client_views is 0). Save each with save_reminder and show me the one-tap links. Don't send anything yourself.",
  },
  {
    name: "what_am_i_owed",
    title: "What am I owed?",
    description: "A short summary of what's outstanding, what's late and what was paid this month.",
    text: () =>
      "What am I owed? Call get_receivables_summary and tell me, in a few lines: total outstanding, total overdue, overdue by client, and what was paid this month (with TDS). " +
      "Then list who to chase today with days overdue and whether they've opened the invoice. Quote every amount exactly as Dues returns it; never add them up yourself.",
  },
  {
    name: "invoice_client",
    title: "Invoice a client",
    description: "Create a GST-correct draft invoice for a client.",
    args: { client: "Who to bill", work: "What you did, with quantities and rates" },
    text: (a) =>
      `Invoice ${a.client || "a client"}${a.work ? ` for: ${a.work}` : ""}. Call get_business_profile first for my defaults (GST rate, due days, SAC). ` +
      "If the client is new, ask me for their state (it decides CGST + SGST or IGST) and use upsert_client. Then call create_invoice with the line items and pass expected_total_rupees with your own estimate. " +
      "Show me the totals Dues computed, not yours, plus the draft link. If Dues flags the totals, tell me why. Remind me that I send it from Dues; you can mark_ready_to_send if I ask.",
  },
];

function registerDuesPrompts(server: McpServer) {
  for (const p of PROMPTS) {
    const argsSchema = p.args ? z.object(Object.fromEntries(Object.entries(p.args).map(([k, d]) => [k, z.string().optional().describe(d)]))) : undefined;
    server.registerPrompt(p.name, { title: p.title, description: p.description, ...(argsSchema ? { argsSchema } : {}) }, (a: Record<string, string | undefined> = {}) => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: p.text(a ?? {}) } }],
    }));
  }
}

export const PROMPT_NAMES = PROMPTS.map((p) => p.name);

export const TOOL_NAMES = [
  "get_business_profile", "upsert_client", "create_invoice", "update_draft_invoice", "list_invoices",
  "get_receivables_summary", "mark_ready_to_send", "record_payment", "save_reminder",
] as const;
