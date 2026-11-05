// Remote MCP server (Streamable HTTP via mcp-handler). One URL for everyone:
//   https://<app>/api/mcp   with   Authorization: Bearer <token>
// D-Q12 final (DECISIONS.md D28): header only, so the token never appears in a URL, browser
// history or request logs. The token is looked up by its SHA-256 hash (D25).
// Never log request headers or the token. tests/unit/guards.test.ts enforces this.
import { createMcpHandler } from "mcp-handler";
import { touchMcpLastUsed, userIdForToken } from "@/lib/service/profile";
import { registerDuesTools } from "@/lib/mcp/tools";
import { bearerToken } from "@/lib/mcp/auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const INSTRUCTIONS =
  "Dues is the freelancer's receivables desk: GST-correct invoices, payment tracking and reminders. " +
  "Claude drafts, Dues computes and checks every number, and the freelancer confirms anything irreversible in the app. " +
  "Never calculate tax or totals yourself; quote the figures Dues returns. Drafts get an invoice number only when the freelancer sends them. " +
  "Dues never sends invoices or confirms payments from chat. Call get_business_profile first for the freelancer's defaults and reminder tone.";

// CORS so browser-based MCP clients can call us. The token travels in a header, never a cookie,
// so a wildcard origin doesn't expose anything a caller doesn't already hold.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

// D32: no WWW-Authenticate header. It tells clients to start OAuth discovery, which Dues doesn't offer (v2).
function unauthorized(message: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message } }), {
    status: 401,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS },
  });
}

const MISSING_HEADER = "No Dues token sent. Add the header Authorization: Bearer <token>. Get your token in Dues → Settings → Claude connection.";
const BAD_TOKEN = "Token not recognised. Copy a fresh token from Dues → Settings → Claude connection, or Regenerate it there.";

const ICON = (origin: string) => [
  { src: `${origin}/icon.png`, mimeType: "image/png", sizes: ["512x512"] },
  { src: `${origin}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
];

async function handle(req: Request) {
  const header = req.headers.get("authorization");
  const token = bearerToken(header);
  if (!token) return unauthorized(header ? BAD_TOKEN : MISSING_HEADER);
  const userId = await userIdForToken(token);
  if (!userId) return unauthorized(BAD_TOKEN);
  await touchMcpLastUsed(userId);
  const origin = new URL(req.url).origin;
  const handler = createMcpHandler((server) => registerDuesTools(server, { userId, actor: "claude" }), {
    // `title`, `websiteUrl` and `icons` are part of the MCP Implementation schema; mcp-handler's type only lists name and version.
    serverInfo: { name: "Dues", title: "Dues", version: "1.2.0", websiteUrl: origin, icons: ICON(origin) } as { name: string; version: string },
    instructions: INSTRUCTIONS,
  });
  const res = await handler(req);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}

function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export { handle as GET, handle as POST, handle as DELETE, preflight as OPTIONS };
