import { NextResponse, type NextRequest } from "next/server";
import { sessionUser } from "@/lib/auth";
import { toDuesError } from "@/lib/service/core";
import { exportInvoicesCsv } from "@/lib/service/export";

// D22: CSV export for the logged-in freelancer.
export async function GET(req: NextRequest) {
  const user = await sessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  try {
    const csv = await exportInvoicesCsv({ userId: user.id, actor: "user" }, from, to);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dues-invoices-${from}-to-${to}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return new NextResponse(toDuesError(e).message, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
