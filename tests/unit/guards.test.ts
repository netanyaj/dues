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
  it("the server reads the token only from the Authorization header", () => {
    expect(read("src/app/api/mcp/route.ts")).toMatch(/req\.headers\.get\("authorization"\)/);
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
