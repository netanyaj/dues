// All "today" logic is India time. Dates are plain YYYY-MM-DD strings.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function istToday(now: Date = new Date()): string {
  // IST is UTC+5:30 with no DST.
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** Indian financial year, starts 1 April. "2026-27". Same rule as SQL fy_for(). */
export function fyFor(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** "2026–27" for display. */
export function fyLabel(fy: string): string {
  return fy.replace("-", "–");
}

export function formatInvoiceNumber(prefix: string, fy: string, seq: number): string {
  return `${prefix}/${fy}/${String(seq).padStart(4, "0")}`;
}

/** "12 Nov 2026" */
export function formatDate(date: string | null | undefined): string {
  if (!date) return "";
  const d = date.slice(0, 10);
  return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
}

export function formatDateTime(ts: string): string {
  const ist = new Date(Date.parse(ts) + 330 * 60 * 1000).toISOString();
  return `${formatDate(ist.slice(0, 10))}, ${ist.slice(11, 16)}`;
}
