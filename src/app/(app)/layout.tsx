import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { getProfile, setupGaps } from "@/lib/service/profile";
import { Button } from "@/components/ui/button";
import { logout } from "../(auth)/actions";
import { NavLinks } from "./nav-links";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireCtx();
  const profile = await getProfile(ctx);
  const gaps = setupGaps(profile);
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b bg-white print:hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">Dues</Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm"><Link href="/invoices/new">+ New invoice</Link></Button>
            <span className="hidden text-xs text-muted-foreground md:inline">{ctx.email}</span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">Log out</Button>
            </form>
          </div>
        </div>
      </header>
      {gaps.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 print:hidden">
          <div className="mx-auto max-w-6xl px-4 py-2 text-sm text-amber-900">
            Finish setup to send invoices: add your {gaps.join(", ")}.{" "}
            <Link href="/settings" className="font-medium underline underline-offset-4">Go to settings</Link>
          </div>
        </div>
      )}
      {profile.is_demo && (
        <div className="border-b bg-zinc-50 print:hidden">
          <div className="mx-auto max-w-6xl px-4 py-1.5 text-xs text-muted-foreground">
            You&apos;re in a demo account with sample data. Some settings are locked. <Link href="/signup" className="underline">Sign up</Link> to try everything.
          </div>
        </div>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
