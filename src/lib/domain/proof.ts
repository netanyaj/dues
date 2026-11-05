// D40: proof of payment files. The type comes from the file's first bytes, not its name or the
// browser's claim, so a renamed script can't be stored as an "image".
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export function sniffProof(bytes: Uint8Array): { mime: string; ext: string } | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  return null;
}

export function checkProof(size: number, bytes: Uint8Array): { ok: true; mime: string; ext: string } | { ok: false; error: string } {
  if (size > PROOF_MAX_BYTES) return { ok: false, error: "The file is over 5 MB. Try a screenshot instead." };
  const t = sniffProof(bytes);
  if (!t) return { ok: false, error: "Attach a JPG, PNG or WebP image, or a PDF." };
  return { ok: true, ...t };
}
