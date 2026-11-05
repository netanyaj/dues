"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GearSixIcon, SquaresFourIcon, UsersIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: SquaresFourIcon, match: ["/dashboard", "/invoices"] },
  { href: "/clients", label: "Clients", icon: UsersIcon, match: ["/clients"] },
  { href: "/settings", label: "Settings", icon: GearSixIcon, match: ["/settings"] },
];

/** Desktop: vertical list in the dark sidebar. */
export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {LINKS.map((l) => {
        const active = l.match.some((m) => path.startsWith(m));
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-2 body-5 transition-colors duration-200 focus-visible:outline-white",
              active ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon aria-hidden className={cn("size-4", active && "text-brand-on-dark")} weight={active ? "fill" : "regular"} />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone: fixed bottom tab bar, 56px tall targets. */
export function TabBar() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
      {LINKS.map((l) => {
        const active = l.match.some((m) => path.startsWith(m));
        const Icon = l.icon;
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
            className={cn("flex h-14 flex-col items-center justify-center gap-0.5 caption-4", active ? "text-foreground" : "text-muted-foreground")}>
            <Icon aria-hidden className={cn("size-5", active && "text-brand")} weight={active ? "fill" : "regular"} />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
