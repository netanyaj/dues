import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ title, children, action, icon, className }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card px-6 py-10 text-center", className)}>
      {icon && <div className="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</div>}
      <p className="title-3">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-md body-6 text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
