// Static guards for rules that must never regress.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("D24: Claude can't finalise anything", () => {
  const tools = read("src/lib/mcp/tools.ts");
  it("MCP tools never import the functions that issue invoices or confirm payments", () => {
    for (const fn of ["sendInvoice", "decideReport", "confirmTotals", "cancelInvoice", "deleteDraft", "updateIssuedDetails", "regenerateMcpToken"]) {
      expect(tools).not.toMatch(new RegExp(`\\b${fn}\\b`));
    }
  });
  it("the MCP route always acts as Claude", () => {
    expect(read("src/app/api/mcp/route.ts")).toMatch(/actor: "claude"/);
  });
  it("record_payment from Claude is stored as reported, never confirmed", () => {
    expect(read("src/lib/service/payments.ts")).toMatch(/status: fromClaude \? "reported" : "confirmed"/);
  });
});

describe("D25: tokens are never logged or stored in plain text", () => {
  it("the MCP route and profile service don't log", () => {
    for (const f of ["src/app/api/mcp/route.ts", "src/app/api/mcp/[token]/route.ts", "src/lib/mcp/auth.ts", "src/lib/mcp/tools.ts", "src/lib/service/profile.ts", "src/proxy.ts"]) {
      expect(read(f)).not.toMatch(/console\.(log|info|warn|error|debug)/);
    }
  });
  it("verbose MCP logging is off", () => {
    expect(read("src/app/api/mcp/route.ts")).not.toMatch(/verboseLogs:\s*true/);
  });
});

describe("D28: header-only MCP auth", () => {
  it("nothing in src logs request headers", () => {
    const walk = (d: string): string[] => fs.readdirSync(path.join(process.cwd(), d), { withFileTypes: true })
      .flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []);
    for (const f of walk("src")) {
      expect(read(f), f).not.toMatch(/console\.\w+\([^)]*headers/);
      expect(read(f), f).not.toMatch(/console\.\w+\([^)]*authorization/i);
    }
  });
  it("the retired token-in-URL route never reads its token", () => {
    const r = read("src/app/api/mcp/[token]/route.ts");
    expect(r).not.toMatch(/params/);
    expect(r).toMatch(/status: 410/);
  });
  it("the server reads the token only from request headers, never the URL (D28, D41)", () => {
    expect(read("src/app/api/mcp/route.ts")).toMatch(/tokenFromHeaders\(req\.headers\)/);
    expect(read("src/lib/mcp/auth.ts")).toMatch(/h\.get\("authorization"\)/);
    expect(read("src/app/api/mcp/route.ts")).not.toMatch(/searchParams|nextUrl/);
  });
});

import { isLikelyBot } from "@/lib/domain/bots";
describe("D37: client views skip bots and link previews", () => {
  it("treats preview fetchers and scripts as bots", () => {
    for (const ua of ["WhatsApp/2.23.20.0 A", "facebookexternalhit/1.1", "Slackbot-LinkExpanding 1.0", "TelegramBot (like TwitterBot)", "curl/8.4.0", "Mozilla/5.0 (compatible; Googlebot/2.1)", "", null, "Mozilla/5.0 HeadlessChrome/120"]) expect(isLikelyBot(ua), String(ua)).toBe(true);
  });
  it("counts real phone and desktop browsers", () => {
    expect(isLikelyBot("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36")).toBe(false);
    expect(isLikelyBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isLikelyBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36")).toBe(false);
  });
});

import { ageBuckets, bucketOf } from "@/lib/domain/aging";
describe("D39: aging buckets", () => {
  it("puts day 45 in 31–45 and day 46 in over 45", () => {
    expect(bucketOf(0)).toBe("0-15"); expect(bucketOf(15)).toBe("0-15"); expect(bucketOf(16)).toBe("16-30");
    expect(bucketOf(45)).toBe("31-45"); expect(bucketOf(46)).toBe("45+");
  });
  it("sums only open balances", () => {
    const b = ageBuckets([
      { issue_date: "2026-11-01", balance_paise: 100, stage: "issued", status: "sent" },
      { issue_date: "2026-09-01", balance_paise: 300, stage: "issued", status: "overdue" },
      { issue_date: "2026-09-01", balance_paise: 0, stage: "issued", status: "paid" },
      { issue_date: "2026-09-01", balance_paise: 500, stage: "draft", status: "draft" },
    ], "2026-11-06");
    expect(b.map((x) => x.paise)).toEqual([100, 0, 0, 300]);
  });
});

import { checkProof } from "@/lib/domain/proof";
describe("D40: proof of payment files", () => {
  it("accepts images and PDFs by their bytes, refuses others and big files", () => {
    expect(checkProof(10, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({ ok: true, mime: "image/jpeg" });
    expect(checkProof(10, new TextEncoder().encode("%PDF-1.7"))).toMatchObject({ ok: true, ext: "pdf" });
    expect(checkProof(10, new TextEncoder().encode("<script>"))).toMatchObject({ ok: false });
    expect(checkProof(6 * 1024 * 1024, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toMatchObject({ ok: false });
  });
});

import { bearerToken } from "@/lib/mcp/auth";
describe("D41: token header forms claude.ai users actually type", () => {
  const t = "a".repeat(48);
  it("accepts Bearer, bare, pasted full line and quotes", () => {
    for (const v of [`Bearer ${t}`, `bearer ${t}`, t, `Authorization: Bearer ${t}`, ` Bearer  ${t} `, `"${t}"`]) expect(bearerToken(v), v).toBe(t);
  });
  it("refuses junk", () => {
    for (const v of ["Bearer", "Basic abc", "Bearer xyz", "", null]) expect(bearerToken(v as string | null)).toBeNull();
  });
});
