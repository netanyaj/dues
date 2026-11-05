"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SECTIONS } from "./sections";

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav aria-label="Settings" className="grid grid-cols-2 gap-1 sm:grid-cols-4 md:flex md:flex-col">
      {SECTIONS.map((s) => {
        const active = path === `/settings/${s.slug}`;
        return (
          <Link key={s.slug} href={`/settings/${s.slug}`} aria-current={active ? "page" : undefined}
            className={cn("rounded-lg px-3 py-2 body-5 transition-colors duration-200", active ? "bg-card text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:bg-card/60 hover:text-foreground")}>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
