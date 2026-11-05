import { daysBetween } from "./dates";

// D39: "Who owes you, by age". Age is days since the invoice date, for anything with a balance.
// 45 days is the MSMED Act limit, so the last bucket is the one that matters for Udyam-registered sellers.
export const AGE_BUCKETS = [
  { key: "0-15", label: "0–15 days", min: 0, max: 15 },
  { key: "16-30", label: "16–30 days", min: 16, max: 30 },
  { key: "31-45", label: "31–45 days", min: 31, max: 45 },
  { key: "45+", label: "Over 45 days", min: 46, max: Infinity },
] as const;
export type AgeKey = (typeof AGE_BUCKETS)[number]["key"];

export function ageOf(issueDate: string, today: string): number {
  return Math.max(0, daysBetween(issueDate, today));
}

export function bucketOf(age: number): AgeKey {
  return AGE_BUCKETS.find((b) => age >= b.min && age <= b.max)!.key;
}

export function ageBuckets(rows: { issue_date: string; balance_paise: number; stage: string; status: string }[], today: string) {
  const out = AGE_BUCKETS.map((b) => ({ ...b, paise: 0, count: 0 }));
  for (const r of rows) {
    if (r.stage !== "issued" || r.status === "paid" || r.balance_paise <= 0) continue;
    const b = out.find((x) => x.key === bucketOf(ageOf(r.issue_date, today)))!;
    b.paise += r.balance_paise;
    b.count += 1;
  }
  return out;
}
