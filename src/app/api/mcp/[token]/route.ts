// Retired: the token used to live in this URL. D28 moved it to the Authorization header.
// Old connections get a 410 with instructions instead of failing silently. The path
// segment is never read, logged or looked up.
export const dynamic = "force-dynamic";

function gone() {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32002, message: "This link format was retired. Reconnect using Dues → Settings → Claude connection: the server URL is now /api/mcp and your token goes in an Authorization header." },
    }),
    { status: 410, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}

export { gone as GET, gone as POST, gone as DELETE };
