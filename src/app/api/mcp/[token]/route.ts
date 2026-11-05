// Remote MCP server (Streamable HTTP via mcp-handler). One URL per user:
//   https://<app>/api/mcp/<token>
// The token is looked up by its SHA-256 hash (D25). Never log the URL or token.
import { createMcpHandler } from "mcp-handler";
import { userIdForToken } from "@/lib/service/profile";
import { registerDuesTools } from "@/lib/mcp/tools";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const INSTRUCTIONS =
  "Dues is the freelancer's receivables desk: GST-correct invoices, payment tracking and reminders. " +
  "Claude drafts, Dues computes and checks every number, and the freelancer confirms anything irreversible in the app. " +
  "Never calculate tax or totals yourself; quote the figures Dues returns. Drafts get an invoice number only when the freelancer sends them. " +
  "Dues never sends invoices or confirms payments from chat.";

function invalidLink() {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: "This Dues link isn't valid. It may have been regenerated. Get the current link in Dues → Settings → Connect Claude." },
    }),
    { status: 404, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}

async function handle(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await userIdForToken(token);
  if (!userId) return invalidLink();
  const handler = createMcpHandler((server) => registerDuesTools(server, { userId, actor: "claude" }), {
    serverInfo: { name: "Dues", version: "1.0.0" },
    instructions: INSTRUCTIONS,
  });
  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
