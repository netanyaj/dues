// GST state codes, GSTIN validation (format + checksum + state), PAN.

export const STATES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

/** States sorted by name, for pickers. (Object key order puts "01"–"09" last.) */
export const STATE_OPTIONS: [code: string, name: string][] = Object.entries(STATES).sort((a, b) => a[1].localeCompare(b[1]));

export function stateName(code: string | null | undefined): string {
  return (code && STATES[code]) || "Unknown state";
}

/** Accepts "29", "Karnataka", "karnataka", "KA"-style names loosely. Returns 2-digit code or null. */
export function resolveStateCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^\d{1,2}$/.test(s)) {
    const code = s.padStart(2, "0");
    return STATES[code] ? code : null;
  }
  const lower = s.toLowerCase();
  for (const [code, name] of Object.entries(STATES)) {
    if (name.toLowerCase() === lower) return code;
  }
  const aliases: Record<string, string> = {
    "new delhi": "07", "nct of delhi": "07", "bangalore": "29", "bengaluru": "29", "mumbai": "27",
    "pune": "27", "chennai": "33", "hyderabad": "36", "kolkata": "19", "orissa": "21", "pondicherry": "34",
    "j&k": "01", "jammu & kashmir": "01", "gurgaon": "06", "gurugram": "06", "noida": "09",
  };
  return aliases[lower] ?? null;
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const code = CHARS.indexOf(first14[i]);
    const product = code * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export type GstinCheck = { ok: true; value: string } | { ok: false; error: string };

/**
 * Structural validation only: format, checksum and state. This does NOT check
 * the GSTIN is active on the GST portal (that needs a GSP). See DECISIONS.md D6.
 */
export function validateGstin(raw: string, expectedState?: string | null): GstinCheck {
  const v = raw.trim().toUpperCase();
  if (v.length !== 15) return { ok: false, error: `GSTIN must be 15 characters; "${raw}" has ${v.length}.` };
  if (!GSTIN_RE.test(v)) {
    return { ok: false, error: `"${raw}" isn't in GSTIN format (2-digit state, 10-character PAN, entity number, "Z", check character).` };
  }
  if (!STATES[v.slice(0, 2)]) return { ok: false, error: `GSTIN starts with "${v.slice(0, 2)}", which isn't a GST state code.` };
  const expected = gstinCheckChar(v.slice(0, 14));
  if (v[14] !== expected) return { ok: false, error: `GSTIN "${v}" fails the checksum. Check it for a typo.` };
  if (expectedState && v.slice(0, 2) !== expectedState) {
    return {
      ok: false,
      error: `GSTIN is registered in ${stateName(v.slice(0, 2))} (${v.slice(0, 2)}) but the state is set to ${stateName(expectedState)} (${expectedState}). They must match.`,
    };
  }
  return { ok: true, value: v };
}

export function panFromGstin(gstin: string): string {
  return gstin.slice(2, 12);
}

export function validatePan(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = raw.trim().toUpperCase();
  if (!PAN_RE.test(v)) return { ok: false, error: `"${raw}" isn't a valid PAN (5 letters, 4 digits, 1 letter).` };
  return { ok: true, value: v };
}

export const GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];
