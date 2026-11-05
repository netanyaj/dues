import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie and sends logged-out visitors to /login, but only on app
// pages. This is an optimistic check only; every page and action re-checks the user on the server.
// D32: anything else (unknown paths, /.well-known/*) must NOT redirect to the login page. MCP
// clients probe /.well-known/oauth-* and break if they get an HTML page instead of a JSON 404.

const APP_PREFIXES = ["/dashboard", "/invoices", "/clients", "/settings"];

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/.well-known/")) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isApp = APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  if (!data?.claims && isApp) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path !== "/dashboard" ? `?next=${encodeURIComponent(path)}` : "";
    return NextResponse.redirect(url);
  }
  if (data?.claims && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Skip static files, icons, the public invoice page and every API route (none use the session).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|i/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)"],
};
