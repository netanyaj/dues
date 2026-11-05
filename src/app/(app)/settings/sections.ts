// Settings structure (DECISIONS.md D29). Shared by the nav, the pages and the save action.
import type { ProfileInput } from "@/lib/service/profile";

export const SECTIONS = [
  { slug: "business", label: "Business profile", keys: ["business_name", "address", "state_code"] },
  { slug: "tax", label: "Tax and compliance", keys: ["gstin", "pan", "udyam_number", "msme_category", "default_sac", "default_gst_rate"] },
  { slug: "payments", label: "Getting paid", keys: ["bank_account_name", "bank_account_number", "bank_ifsc", "upi_id", "upi_name", "show_upi_qr"] },
  { slug: "invoices", label: "Invoice defaults", keys: ["invoice_prefix", "default_due_days", "default_notes"] },
  { slug: "reminders", label: "Reminders", keys: ["reminder_channel", "reminder_tone"] },
  { slug: "claude", label: "Claude connection", keys: [] },
  { slug: "data", label: "Data and export", keys: [] },
  { slug: "account", label: "Account", keys: [] },
] as const satisfies readonly { slug: string; label: string; keys: readonly (keyof ProfileInput)[] }[];

export type SectionSlug = (typeof SECTIONS)[number]["slug"];
export const FORM_SECTIONS = ["business", "tax", "payments", "invoices", "reminders"] as const;
export type FormSection = (typeof FORM_SECTIONS)[number];

/** First-run order (flow 1 in FLOWS.md): each save moves to the next step. */
export const ONBOARDING: Partial<Record<SectionSlug, SectionSlug>> = { business: "tax", tax: "payments", payments: "claude" };
