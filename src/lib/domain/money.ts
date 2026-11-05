// Money is integer paise. Never multiply rupee floats.
// Inputs are parsed from their decimal text so 1.005 can't turn into 1.00499...

export class InputError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = "InputError";
  }
}

/** Parse a decimal (number or string) into an integer scaled by 10^places. Exact. */
export function parseScaled(value: number | string, places: number, field: string): bigint {
  let s = typeof value === "number" ? numberToPlainString(value) : String(value).trim();
  s = s.replace(/,/g, "").replace(/^₹\s*/, "");
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
    throw new InputError(field, `${field} must be a number, got "${value}".`);
  }
  const [, neg, int, frac = ""] = m;
  if (frac.length > places) {
    const trimmed = frac.replace(/0+$/, "");
    if (trimmed.length > places) {
      throw new InputError(field, `${field} can have at most ${places} decimal places, got "${value}".`);
    }
  }
  const fracPadded = (frac + "0".repeat(places)).slice(0, places);
  const n = BigInt((int || "0") + fracPadded);
  return neg ? -n : n;
}

function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) return "NaN";
  // Avoid exponent notation for very small/large numbers.
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

export function rupeesToPaise(value: number | string, field = "Amount"): number {
  const p = parseScaled(value, 2, field);
  if (p > BigInt(Number.MAX_SAFE_INTEGER)) throw new InputError(field, `${field} is too large.`);
  return Number(p);
}

/** Quantity in thousandths (3 decimal places). */
export function parseQtyMilli(value: number | string, field = "Quantity"): number {
  return Number(parseScaled(value, 3, field));
}

/** Round a / b to nearest integer, halves away from zero. a, b non-negative bigints. */
export function divRoundHalfUp(a: bigint, b: bigint): bigint {
  return (a * 2n + b) / (b * 2n);
}

/** amount = round(qty × rate), with qty in thousandths. */
export function lineAmountPaise(qtyMilli: number, ratePaise: number): number {
  return Number(divRoundHalfUp(BigInt(qtyMilli) * BigInt(ratePaise), 1000n));
}

export function qtyMilliToString(qtyMilli: number): string {
  const int = Math.floor(qtyMilli / 1000);
  const frac = String(qtyMilli % 1000).padStart(3, "0").replace(/0+$/, "");
  return frac ? `${int}.${frac}` : String(int);
}

/** Indian grouping: 1,00,000.00. Deterministic, no ICU dependency. */
export function groupIndian(intStr: string): string {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

export function formatINR(paise: number, opts: { symbol?: boolean; decimals?: "always" | "auto" } = {}): string {
  const { symbol = true, decimals = "always" } = opts;
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const fracPart = decimals === "auto" && p === 0 ? "" : `.${String(p).padStart(2, "0")}`;
  return `${neg ? "-" : ""}${symbol ? "₹" : ""}${groupIndian(String(rupees))}${fracPart}`;
}

/** For UPI `am` param: plain "1234.50". */
export function paiseToDecimalString(paise: number): string {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}
