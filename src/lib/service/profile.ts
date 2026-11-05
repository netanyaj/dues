import { randomBytes } from "node:crypto";
import { panFromGstin, resolveStateCode, stateName, validateGstin, validatePan } from "@/lib/domain/gst";
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
  mcp_token: string;
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
  if (!p.upi_id && !(p.bank_account_number && p.bank_ifsc)) gaps.push("a way to get paid (UPI ID or bank account)");
  return gaps;
}

export function isSetupComplete(p: Profile) {
  return setupGaps(p).length === 0;
}

export type ProfileInput = Partial<Record<
  "business_name" | "address" | "gstin" | "pan" | "state_code" | "default_sac" | "upi_id" | "upi_name" |
  "bank_account_name" | "bank_account_number" | "bank_ifsc" | "invoice_prefix", string | null>>;

export type FieldErrors = Record<string, string>;

export function validateProfileInput(input: ProfileInput): { values: Record<string, string | null>; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const v: Record<string, string | null> = {};
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

  if (!v.upi_id && !(acct && ifsc) && !errors.upi_id && !errors.bank_account_number && !errors.bank_ifsc) {
    errors.upi_id = "Add a UPI ID or bank account so clients can pay you.";
  }
  return { values: v, errors };
}

export async function updateProfile(ctx: Ctx, input: ProfileInput): Promise<{ ok: true; profile: Profile } | { ok: false; errors: FieldErrors }> {
  const { values, errors } = validateProfileInput(input);
  if (Object.keys(errors).length) return { ok: false, errors };
  const profile = check(
    await db().from("profiles").update({ ...values, updated_at: new Date().toISOString() }).eq("user_id", ctx.userId).select("*").single(),
  ) as Profile;
  return { ok: true, profile };
}

export async function regenerateMcpToken(ctx: Ctx): Promise<string> {
  const token = randomBytes(24).toString("hex");
  check(await db().from("profiles").update({ mcp_token: token, updated_at: new Date().toISOString() }).eq("user_id", ctx.userId));
  return token;
}

export function mcpUrl(token: string) {
  return `${appUrl()}/api/mcp/${token}`;
}

/** MCP auth: find the user for a token. Constant-shape lookup on a unique index. */
export async function userIdForToken(token: string): Promise<string | null> {
  if (!/^[0-9a-f]{32,128}$/.test(token)) return null;
  const { data } = await db().from("profiles").select("user_id").eq("mcp_token", token).maybeSingle();
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
    setup_complete: gaps.length === 0,
    missing: gaps,
  };
}

export { DuesError };
