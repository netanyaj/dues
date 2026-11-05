import { paiseToDecimalString } from "./money";

const UPI_RE = /^[a-zA-Z0-9._-]{2,200}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

export function validateUpiId(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = raw.trim();
  if (!UPI_RE.test(v)) return { ok: false, error: `"${raw}" isn't a UPI ID. It should look like name@bank, e.g. priya@okicici.` };
  return { ok: true, value: v };
}

/** UPI person-to-person per-transaction limit. Above this we show bank transfer only (DECISIONS.md D6). */
export const UPI_QR_LIMIT_PAISE = 1_00_000_00;

export function upiEligible(upiId: string | null | undefined, amountPaise: number): boolean {
  return !!upiId && amountPaise > 0 && amountPaise <= UPI_QR_LIMIT_PAISE;
}

export function upiUri(args: { upiId: string; payeeName: string; amountPaise: number; note: string }): string {
  const q = [
    `pa=${encodeURIComponent(args.upiId)}`,
    `pn=${encodeURIComponent(args.payeeName)}`,
    `am=${paiseToDecimalString(args.amountPaise)}`,
    `tn=${encodeURIComponent(args.note)}`,
    `cu=INR`,
  ];
  return `upi://pay?${q.join("&")}`;
}

/** Normalise an Indian phone number for wa.me: digits only, with 91 prefix for 10-digit numbers. */
export function waPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  if (d.length >= 8 && d.length <= 15) return d;
  return null;
}

export function whatsappLink(phone: string | null | undefined, text: string): string {
  const p = waPhone(phone);
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(email: string | null | undefined, subject: string, body: string): string {
  return `mailto:${email ? encodeURIComponent(email) : ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
