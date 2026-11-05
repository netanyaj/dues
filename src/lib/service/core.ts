// Shared plumbing for the service layer. Server only: uses the service-role key.
// Every function in src/lib/service takes a Ctx and scopes every query by ctx.userId.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { InputError } from "@/lib/domain/money";

export type Actor = "user" | "claude" | "client" | "system";
export type Ctx = { userId: string; actor: Actor };

let _db: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("service layer is server-only");
  if (_db) return _db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars are missing (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).");
  _db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _db;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** An error whose message is safe and useful to show a person or Claude. */
export class DuesError extends Error {
  constructor(public code: string, message: string, public field?: string) {
    super(message);
    this.name = "DuesError";
  }
}

const DB_ERRORS: Record<string, string> = {
  client_not_found: "That client doesn't exist in Dues. Create them first.",
  invoice_not_found: "No invoice found with that ID or number.",
  invoice_locked:
    "This invoice has been sent, so its line items, client and amounts are locked. To change the amounts, cancel it and create a new invoice.",
  already_issued: "This invoice has already been sent.",
  needs_review: "The totals on this invoice are flagged for review. Open it in Dues and click \"Confirm totals\" before sending.",
  zero_total: "An invoice with a total of ₹0 can't be sent.",
  no_items: "Add at least one line item before sending.",
  profile_incomplete: "Finish your business profile in Settings (business name, address, state) before sending invoices.",
  number_too_long: "Your invoice numbers would exceed 16 characters. Use a shorter prefix in Settings.",
};

/** Turn a Supabase/Postgres error into a DuesError with a human message. Never leak raw codes. */
export function fromDb(error: { message?: string; code?: string } | null): never {
  const msg = error?.message ?? "";
  const m = /DUES:([a-z_]+)/.exec(msg);
  if (m && DB_ERRORS[m[1]]) throw new DuesError(m[1], DB_ERRORS[m[1]]);
  if (error?.code === "23505") {
    if (/clients_user_name_uniq/.test(msg)) throw new DuesError("duplicate_client", "You already have a client with that name.", "name");
    throw new DuesError("duplicate", "That already exists.");
  }
  if (error?.code === "23514") throw new DuesError("invalid", "Some of the values aren't valid. Check the fields and try again.");
  console.error("Unexpected database error", error);
  throw new DuesError("internal", "Something went wrong saving that. Please try again.");
}

export function check<T>(res: { data: T; error: { message?: string; code?: string } | null }): T {
  if (res.error) fromDb(res.error);
  return res.data;
}

export async function logEvent(ctx: Ctx, invoiceId: string | null, type: string, payload: Record<string, unknown> = {}) {
  const { error } = await db().from("events").insert({ invoice_id: invoiceId, user_id: ctx.userId, actor: ctx.actor, type, payload });
  if (error) console.error("event log failed", type, error);
}

export function toDuesError(e: unknown): DuesError {
  if (e instanceof DuesError) return e;
  if (e instanceof InputError) return new DuesError("invalid_input", e.message, e.field);
  console.error(e);
  return new DuesError("internal", "Something went wrong. Please try again.");
}

export function cleanText(v: unknown, max = 500): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > max) throw new DuesError("invalid_input", `That text is too long (max ${max} characters).`);
  return s;
}
