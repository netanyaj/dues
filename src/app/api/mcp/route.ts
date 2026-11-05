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

function unauthorized(message: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message } }), {
    status: 401,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "WWW-Authenticate": 'Bearer realm="Dues"' },
  });
}

async function handle(req: Request) {
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return unauthorized("Add your Dues token as an Authorization header: Bearer <token>. See Dues → Settings → Claude connection.");
  const userId = await userIdForToken(token);
  if (!userId) return unauthorized("This Dues token isn't valid. It may have been regenerated. Get a new one in Dues → Settings → Claude connection.");
  await touchMcpLastUsed(userId);
  const handler = createMcpHandler((server) => registerDuesTools(server, { userId, actor: "claude" }), {
    serverInfo: { name: "Dues", version: "1.1.0" },
    instructions: INSTRUCTIONS,
  });
  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
