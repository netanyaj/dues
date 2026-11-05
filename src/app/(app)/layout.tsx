import Link from "next/link";
import { PlusIcon, SignOutIcon } from "@phosphor-icons/react/dist/ssr";
import { requireCtx } from "@/lib/auth";
import { getProfile, setupGaps } from "@/lib/service/profile";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { logout } from "../(auth)/actions";
import { SideNav, TabBar } from "./nav-links";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireCtx();
  const profile = await getProfile(ctx);
  const gaps = setupGaps(profile);
  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-sidebar p-3 text-sidebar-foreground md:flex print:hidden">
        <Link href="/dashboard" className="mb-6 rounded-lg px-2 py-2 focus-visible:outline-white" aria-label="Dues dashboard">
          <Logo inverted />
        </Link>
        <Button asChild className="mb-4 justify-start bg-white text-foreground hover:bg-[#e8e8e8] focus-visible:outline-white">
          <Link href="/invoices/new"><PlusIcon aria-hidden weight="bold" />New invoice</Link>
        </Button>
        <SideNav />
        <div className="mt-auto space-y-2 px-2">
          <p className="caption-5 truncate text-sidebar-muted" title={ctx.email ?? ""}>{ctx.email}</p>
          <form action={logout}>
            <button type="submit" className="flex items-center gap-2 rounded-md body-5 text-sidebar-muted hover:text-sidebar-foreground focus-visible:outline-white">
              <SignOutIcon aria-hidden className="size-4" />Log out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4 md:hidden print:hidden">
          <Link href="/dashboard" aria-label="Dues dashboard"><Logo /></Link>
          <Button asChild size="sm" className="ml-auto"><Link href="/invoices/new"><PlusIcon aria-hidden weight="bold" />New invoice</Link></Button>
        </header>
        {profile.is_demo && (
          <div className="border-b bg-card px-4 py-2 caption-5 text-muted-foreground md:px-8 print:hidden">
            Demo account with sample data. A few settings are locked here. <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">Create your own account</Link> to try everything.
          </div>
        )}
        {gaps.length > 0 && (
          <div className="border-b border-attention-border bg-attention-soft px-4 py-2 body-6 text-attention md:px-8 print:hidden">
            Finish setup before you can send invoices: add your {gaps.join(", ")}.{" "}
            <Link href="/settings" className="font-semibold underline underline-offset-4">Open settings</Link>
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>
      <TabBar />
    </div>
  );
}
