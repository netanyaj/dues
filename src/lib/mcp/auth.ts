/** "Bearer <token>" → token. Anything else → null. Never log the header. */
export function bearerToken(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+([0-9a-f]{32,128})\s*$/i);
  return m ? m[1].toLowerCase() : null;
}
