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
    expect(read("src/app/api/mcp/[token]/route.ts")).toMatch(/actor: "claude"/);
  });
  it("record_payment from Claude is stored as reported, never confirmed", () => {
    expect(read("src/lib/service/payments.ts")).toMatch(/status: fromClaude \? "reported" : "confirmed"/);
  });
});

describe("D25: tokens are never logged or stored in plain text", () => {
  it("the MCP route and profile service don't log", () => {
    for (const f of ["src/app/api/mcp/[token]/route.ts", "src/lib/mcp/tools.ts", "src/lib/service/profile.ts"]) {
      expect(read(f)).not.toMatch(/console\.(log|info|warn|error|debug)/);
    }
  });
  it("verbose MCP logging is off", () => {
    expect(read("src/app/api/mcp/[token]/route.ts")).not.toMatch(/verboseLogs:\s*true/);
  });
});
