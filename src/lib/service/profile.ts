import { createHash, randomBytes } from "node:crypto";
import { msmeLine, panFromGstin, resolveStateCode, stateName, validateGstin, validatePan, validateUdyam } from "@/lib/domain/gst";
import { validateUpiId } from "@/lib/domain/upi";
import { appUrl, check, cleanText, db, DuesError, type Ctx } from "./core";

export type Profile = {
  user_id: string;
  business_name: string | null;
  address: string | null;
  gstin: string | null;
  pan: string | null;
  state_code: string | null;
  default_sac: string;
  upi_id: string | null;
  upi_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  invoice_prefix: string;
  mcp_token_hash: string | null;
  mcp_token_last4: string | null;
  udyam_number: string | null;
  msme_category: "micro" | "small" | "medium" | null;
  bank_details_changed_at: string | null;
  is_demo: boolean;
  default_gst_rate: number;
  default_due_days: number;
  default_notes: string | null;
  show_upi_qr: boolean;
  reminder_channel: "whatsapp" | "email";
  reminder_tone: string | null;
  mcp_last_used_at: string | null;
  created_at?: string;
};

export async function getProfile(ctx: Ctx): Promise<Profile> {
  const p = check(await db().from("profiles").select("*").eq("user_id", ctx.userId).maybeSingle());
  if (!p) {
    // Trigger should have created it; create defensively.
    return check(await db().from("profiles").insert({ user_id: ctx.userId }).select("*").single()) as Profile;
  }
  return p as Profile;
}

/** What's missing before invoices can be sent and paid. */
export function setupGaps(p: Profile): string[] {
  const gaps: string[] = [];
  if (!p.business_name) gaps.push("business name");
  if (!p.address) gaps.push("business address");
  if (!p.state_code) gaps.push("state");
  return gaps;
}

/** D35: bank details are asked for at the first Send, not at sign-up. UPI stays optional. */
export function hasBankDetails(p: Pick<Profile, "bank_account_number" | "bank_ifsc">): boolean {
  return !!(p.bank_account_number && p.bank_ifsc);
}

export function isSetupComplete(p: Profile) {
  return setupGaps(p).length === 0;
}

export type ProfileInput = Partial<Record<
  "business_name" | "address" | "gstin" | "pan" | "state_code" | "default_sac" | "upi_id" | "upi_name" |
  "bank_account_name" | "bank_account_number" | "bank_ifsc" | "invoice_prefix" | "udyam_number" | "msme_category" |
  "default_gst_rate" | "default_due_days" | "default_notes" | "show_upi_qr" | "reminder_channel" | "reminder_tone", string | null>>;

export const PROFILE_FIELDS = [
  "business_name", "address", "gstin", "pan", "state_code", "default_sac", "upi_id", "upi_name", "bank_account_name",
  "bank_account_number", "bank_ifsc", "invoice_prefix", "udyam_number", "msme_category",
  "default_gst_rate", "default_due_days", "default_notes", "show_upi_qr", "reminder_channel", "reminder_tone",
] as const satisfies readonly (keyof ProfileInput)[];

export type FieldErrors = Record<string, string>;

export function validateProfileInput(input: ProfileInput): { values: Record<string, string | number | boolean | null>; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const v: Record<string, string | null> = {};
  const extra: Record<string, string | number | boolean | null> = {};
  const t = (k: keyof ProfileInput, max = 300) => {
    try { return cleanText(input[k], max); } catch (e) { errors[k] = (e as Error).message; return null; }
  };

  v.business_name = t("business_name", 120);
  if (!v.business_name) errors.business_name = "Enter your business or trading name.";
  v.address = t("address", 400);
  if (!v.address) errors.address = "Enter your business address. It's required on a GST invoice.";

  const stateRaw = t("state_code");
  v.state_code = resolveStateCode(stateRaw);
  if (!v.state_code) errors.state_code = "Pick your state.";

  const gstinRaw = t("gstin", 20);
  v.gstin = null;
  if (gstinRaw) {
    const g = validateGstin(gstinRaw, v.state_code);
    if (g.ok) v.gstin = g.value; else errors.gstin = g.error;
  }

  const panRaw = t("pan", 20);
  v.pan = null;
  if (panRaw) {
    const p = validatePan(panRaw);
    if (!p.ok) errors.pan = p.error;
    else if (v.gstin && panFromGstin(v.gstin) !== p.value) errors.pan = `PAN must match your GSTIN (${panFromGstin(v.gstin)}).`;
    else v.pan = p.value;
  } else if (v.gstin) {
    v.pan = panFromGstin(v.gstin);
  }

  v.default_sac = t("default_sac", 8) ?? "998391";
  if (!/^[0-9]{4,8}$/.test(v.default_sac)) errors.default_sac = "SAC code is 4 to 8 digits, e.g. 998391.";

  const upi = t("upi_id", 100);
  v.upi_id = null;
  if (upi) {
    const u = validateUpiId(upi);
    if (u.ok) v.upi_id = u.value; else errors.upi_id = u.error;
  }
  v.upi_name = t("upi_name", 100);
  if (v.upi_id && !v.upi_name) v.upi_name = v.business_name;

  v.bank_account_name = t("bank_account_name", 120);
  const acct = t("bank_account_number", 30)?.replace(/\s/g, "") ?? null;
  v.bank_account_number = acct;
  if (acct && !/^[0-9]{9,18}$/.test(acct)) errors.bank_account_number = "Account number should be 9 to 18 digits.";
  const ifsc = t("bank_ifsc", 20)?.toUpperCase() ?? null;
  v.bank_ifsc = ifsc;
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) errors.bank_ifsc = "IFSC is 11 characters, like HDFC0001234.";
  if ((acct || ifsc) && !(acct && ifsc)) errors[acct ? "bank_ifsc" : "bank_account_number"] = "Enter both the account number and IFSC, or neither.";

  const prefix = (t("invoice_prefix", 10) ?? "INV").toUpperCase();
  v.invoice_prefix = prefix;
  if (!/^[A-Z0-9]{1,3}$/.test(prefix)) errors.invoice_prefix = "Use 1 to 3 letters or digits, e.g. INV. This keeps invoice numbers within GST's 16-character limit.";

  const udyam = t("udyam_number", 30);
  v.udyam_number = null;
  v.msme_category = null;
  if (udyam) {
    const u = validateUdyam(udyam);
    if (u.ok) v.udyam_number = u.value; else errors.udyam_number = u.error;
    const cat = t("msme_category", 10);
    if (cat === "micro" || cat === "small" || cat === "medium") v.msme_category = cat;
    else errors.msme_category = "Pick your enterprise category from your Udyam certificate.";
  }

  // D35: no "UPI or bank required" rule here. Onboarding can skip Getting paid; sending checks
  // for a bank account (sendInvoice) and asks for it inline at the first Send.

  // Defaults and preferences (D29). Missing input keeps the column default.
  const rate = Number(t("default_gst_rate", 4) ?? 18);
  if (![0, 5, 12, 18, 28].includes(rate)) errors.default_gst_rate = "Pick 0, 5, 12, 18 or 28%.";
  extra.default_gst_rate = rate;
  const daysRaw = t("default_due_days", 4) ?? "15";
  const days = Number(daysRaw);
  if (!/^[0-9]{1,3}$/.test(daysRaw) || days > 180) errors.default_due_days = "Use a whole number of days from 0 to 180.";
  extra.default_due_days = days;
  try { extra.default_notes = cleanText(input.default_notes, 1000); } catch { errors.default_notes = "Keep it under 1,000 characters."; }
  extra.show_upi_qr = (input.show_upi_qr ?? "true") !== "false";
  const ch = t("reminder_channel", 10) ?? "whatsapp";
  if (ch !== "whatsapp" && ch !== "email") errors.reminder_channel = "Pick WhatsApp or email.";
  extra.reminder_channel = ch;
  try { extra.reminder_tone = cleanText(input.reminder_tone, 200); } catch { errors.reminder_tone = "Keep it under 200 characters."; }
  return { values: { ...v, ...extra }, errors };
}

/** Values to merge a partial settings form over: what's saved now, as form strings. */
export function profileAsInput(p: Profile): ProfileInput {
  const out: ProfileInput = {};
  for (const k of PROFILE_FIELDS) {
    const val = (p as unknown as Record<string, unknown>)[k];
    out[k] = val == null ? null : String(val);
  }
  return out;
}

/**
 * Save one Settings section (D29). The whole profile is validated with the same rules as
 * before, but only errors in this section block the save, and only this section's
 * columns are written. So a new account can save its business details before adding a
 * bank account.
 */
export async function updateProfileSection(ctx: Ctx, keys: readonly (keyof ProfileInput)[], patch: ProfileInput): Promise<{ ok: true; profile: Profile } | { ok: false; errors: FieldErrors }> {
  const current = await getProfile(ctx);
  const merged = { ...profileAsInput(current), ...patch };
  const { values, errors } = validateProfileInput(merged);
  const mine = new Set<string>(keys);
  // PAN follows GSTIN, and UPI name follows the UPI ID, so they travel with their section.
  if (mine.has("gstin")) mine.add("pan");
  if (mine.has("upi_id")) mine.add("upi_name");
  const sectionErrors: FieldErrors = Object.fromEntries(Object.entries(errors).filter(([k]) => mine.has(k)));
  if (mine.has("state_code") && !mine.has("gstin") && errors.gstin) {
    sectionErrors.state_code = "Your GSTIN is registered in a different state. Update it under Tax and compliance first.";
  }
  if (Object.keys(sectionErrors).length) return { ok: false, errors: sectionErrors };
  const write = Object.fromEntries(Object.entries(values).filter(([k]) => mine.has(k)));
  const profile = check(
    await db().from("profiles").update({ ...write, updated_at: new Date().toISOString() }).eq("user_id", ctx.userId).select("*").single(),
  ) as Profile;
  return { ok: true, profile };
}

export async function updateProfile(ctx: Ctx, input: ProfileInput): Promise<{ ok: true; profile: Profile } | { ok: false; errors: FieldErrors }> {
  const { values, errors } = validateProfileInput(input);
  if (Object.keys(errors).length) return { ok: false, errors };
  const profile = check(
    await db().from("profiles").update({ ...values, updated_at: new Date().toISOString() }).eq("user_id", ctx.userId).select("*").single(),
  ) as Profile;
  return { ok: true, profile };
}

export const DEMO_DISABLED = "Disabled on demo accounts — sign up to try it.";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * D25: create a new MCP token, store only its hash and last 4 characters, and
 * return the plain token so it can be shown exactly once. Demo accounts can only
 * create a link when they have none (the seed script does this).
 */
export async function regenerateMcpToken(ctx: Ctx, opts: { allowDemo?: boolean } = {}): Promise<string> {
  const p = await getProfile(ctx);
  if (p.is_demo && p.mcp_token_hash && !opts.allowDemo) throw new DuesError("demo_account", DEMO_DISABLED);
  const token = randomBytes(24).toString("hex");
  check(await db().from("profiles").update({ mcp_token_hash: hashToken(token), mcp_token_last4: token.slice(-4), updated_at: new Date().toISOString() }).eq("user_id", ctx.userId));
  return token;
}

/** The one MCP server URL. The token goes in the Authorization header, never the URL (D28). */
export function mcpServerUrl() {
  return `${appUrl()}/api/mcp`;
}

/** Connection status for Settings. Written at most once every 5 minutes per account. */
export async function touchMcpLastUsed(userId: string) {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await db().from("profiles").update({ mcp_last_used_at: new Date().toISOString() }).eq("user_id", userId).or(`mcp_last_used_at.is.null,mcp_last_used_at.lt.${cutoff}`);
}

/** MCP auth: hash the token from the Authorization header and look it up. The plain token is never stored. */
export async function userIdForToken(token: string): Promise<string | null> {
  if (!/^[0-9a-f]{32,128}$/.test(token)) return null;
  const { data } = await db().from("profiles").select("user_id").eq("mcp_token_hash", hashToken(token)).maybeSingle();
  return data?.user_id ?? null;
}

export function describeProfile(p: Profile) {
  const gaps = setupGaps(p);
  return {
    business_name: p.business_name,
    address: p.address,
    gstin: p.gstin,
    gst_registered: !!p.gstin,
    pan: p.pan,
    state: p.state_code ? `${stateName(p.state_code)} (${p.state_code})` : null,
    state_code: p.state_code,
    upi_id: p.upi_id,
    bank_transfer_set_up: !!(p.bank_account_number && p.bank_ifsc),
    invoice_prefix: p.invoice_prefix,
    default_sac: p.default_sac,
    defaults: { gst_rate: p.default_gst_rate ?? 18, due_in_days: p.default_due_days ?? 15, notes: p.default_notes ?? null },
    reminders: {
      channel: p.reminder_channel ?? "whatsapp",
      tone: p.reminder_tone ?? null,
      stages: "Stage 1 friendly at 3 days late, stage 2 firm at 7, stage 3 final at 14.",
    },
    msme: p.udyam_number ? { udyam_number: p.udyam_number, category: p.msme_category, invoice_line: msmeLine(p.business_name ?? "", p.udyam_number, p.msme_category) } : null,
    setup_complete: gaps.length === 0,
    missing: gaps,
  };
}

export { DuesError };
