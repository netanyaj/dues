import { resolveStateCode, stateName, validateGstin } from "@/lib/domain/gst";
import { check, cleanText, db, DuesError, type Ctx } from "./core";
import type { FieldErrors } from "./profile";

export type Client = {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  state_code: string;
  created_at: string;
};

export type ClientInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
  state_code?: string | null; // code or state name
};

export function validateClientInput(input: ClientInput): { values: Omit<Client, "id" | "user_id" | "created_at">; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const safe = (k: keyof ClientInput, max: number) => {
    try { return cleanText(input[k], max); } catch (e) { errors[k] = (e as Error).message; return null; }
  };
  const name = safe("name", 120);
  if (!name) errors.name = "Enter the client's name.";
  const email = safe("email", 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = `"${email}" isn't a valid email address.`;
  const phone = safe("phone", 30);
  if (phone && phone.replace(/\D/g, "").length < 10) errors.phone = "Phone number should have at least 10 digits.";
  const address = safe("address", 400);

  const gstinRaw = safe("gstin", 20);
  let state = resolveStateCode(safe("state_code", 60));
  let gstin: string | null = null;
  if (gstinRaw) {
    // If only the GSTIN is given, take the state from it.
    const g = validateGstin(gstinRaw, state);
    if (g.ok) { gstin = g.value; state = state ?? g.value.slice(0, 2); }
    else errors.gstin = g.error;
  }
  if (!state && !errors.gstin) errors.state_code = "Enter the client's state (e.g. Karnataka or 29). It decides CGST/SGST vs IGST.";
  return { values: { name: name ?? "", email, phone, address, gstin, state_code: state ?? "" }, errors };
}

export async function findClientByName(ctx: Ctx, name: string): Promise<Client | null> {
  const n = name.trim();
  const { data } = await db().from("clients").select("*").eq("user_id", ctx.userId).ilike("name", n.replace(/[%_\\]/g, "\\$&"));
  return (data?.[0] as Client) ?? null;
}

export async function getClient(ctx: Ctx, id: string): Promise<Client | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db().from("clients").select("*").eq("user_id", ctx.userId).eq("id", id).maybeSingle();
  return (data as Client) ?? null;
}

/** Create, or update the existing client with the same name (case-insensitive). Used by MCP. */
export async function upsertClient(ctx: Ctx, input: ClientInput): Promise<{ client: Client; created: boolean }> {
  const existing = input.name ? await findClientByName(ctx, input.name) : null;
  // When updating, keep existing fields that weren't provided.
  const merged: ClientInput = existing
    ? {
        name: existing.name,
        email: input.email ?? existing.email,
        phone: input.phone ?? existing.phone,
        address: input.address ?? existing.address,
        gstin: input.gstin ?? existing.gstin,
        state_code: input.state_code ?? existing.state_code,
      }
    : input;
  const { values, errors } = validateClientInput(merged);
  if (Object.keys(errors).length) {
    throw new DuesError("invalid_input", Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join(" "));
  }
  if (existing) {
    const client = check(await db().from("clients").update({ ...values, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("user_id", ctx.userId).select("*").single()) as Client;
    return { client, created: false };
  }
  const client = check(await db().from("clients").insert({ ...values, user_id: ctx.userId }).select("*").single()) as Client;
  return { client, created: true };
}

export async function saveClient(ctx: Ctx, id: string | null, input: ClientInput): Promise<{ ok: true; client: Client } | { ok: false; errors: FieldErrors }> {
  const { values, errors } = validateClientInput(input);
  if (Object.keys(errors).length) return { ok: false, errors };
  try {
    if (id) {
      const client = check(await db().from("clients").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", ctx.userId).select("*").single()) as Client;
      return { ok: true, client };
    }
    const client = check(await db().from("clients").insert({ ...values, user_id: ctx.userId }).select("*").single()) as Client;
    return { ok: true, client };
  } catch (e) {
    if (e instanceof DuesError && e.field) return { ok: false, errors: { [e.field]: e.message } };
    throw e;
  }
}

export async function listClients(ctx: Ctx): Promise<Client[]> {
  return check(await db().from("clients").select("*").eq("user_id", ctx.userId).order("name")) as Client[];
}

export async function clientStats(ctx: Ctx, clientId: string) {
  const rows = check(
    await db().from("invoice_view").select("status, balance_paise, tds_total_paise").eq("user_id", ctx.userId).eq("client_id", clientId),
  ) as { status: string; balance_paise: number; tds_total_paise: number }[];
  let outstanding = 0, overdue = 0, tds = 0;
  for (const r of rows) {
    tds += Number(r.tds_total_paise);
    if (["sent", "partially_paid", "overdue"].includes(r.status)) outstanding += Number(r.balance_paise);
    if (r.status === "overdue") overdue += Number(r.balance_paise);
  }
  return { outstanding_paise: outstanding, overdue_paise: overdue, tds_paise: tds, invoice_count: rows.length };
}

export function describeClient(c: Client) {
  return { id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address, gstin: c.gstin, state: `${stateName(c.state_code)} (${c.state_code})` };
}
