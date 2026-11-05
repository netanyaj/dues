// D41: claude.ai sends a request-header value exactly as typed, so accept every reasonable form:
// "Bearer <token>", the bare token, or the whole pasted line "Authorization: Bearer <token>".
// Never log the header.
const TOKEN = /^[0-9a-f]{32,128}$/i;

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  let v = header.trim().replace(/^authorization\s*:\s*/i, "").replace(/^bearer\s+/i, "").trim();
  v = v.replace(/^["'<]|["'>]$/g, "");
  return TOKEN.test(v) ? v.toLowerCase() : null;
}

/** The token from Authorization, or from x-api-key / x-auth-token (claude.ai's other allowed names). */
export function tokenFromHeaders(h: Headers): { token: string | null; sent: boolean } {
  const raw = h.get("authorization") ?? h.get("x-api-key") ?? h.get("x-auth-token");
  return { token: bearerToken(raw), sent: raw != null && raw.trim() !== "" };
}
