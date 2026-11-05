// Dues design system primitives (DECISIONS.md D27). Screens compose these instead of
// one-off borders, colours and sizes.
import type { ReactNode } from "react";
import { CheckCircleIcon, InfoIcon, WarningIcon, WarningOctagonIcon } from "@phosphor-icons/react/dist/ssr";
import { formatINR } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="caption-4 text-muted-foreground">{eyebrow}</div>}
        <h1 className="heading-6 sm:heading-5">{title}</h1>
        {description && <div className="body-6 mt-1 text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, count, action, children, className, id }: { title: ReactNode; count?: number; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("min-w-0", className)} aria-label={typeof title === "string" ? title : undefined}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="title-4 font-semibold">{title}</h2>
        {count != null && <span className="caption-3 rounded-md bg-primary px-1.5 text-primary-foreground amount">{count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** White surface on the grey canvas. The only container style in the app. */
export function Panel({ children, className, as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "ul" | "ol" | "dl" }) {
  return <As className={cn("rounded-xl border bg-card", className)}>{children}</As>;
}

/** Every rupee amount goes through here: lakh grouping, tabular figures. */
export function Amount({ paise, className, decimals = "always", muted = false }: { paise: number; className?: string; decimals?: "always" | "auto"; muted?: boolean }) {
  return <span className={cn("amount", muted && "text-muted-foreground", className)}>{formatINR(paise, { decimals })}</span>;
}

const BANNER = {
  info: { box: "bg-card border-border", icon: InfoIcon, iconClass: "text-foreground" },
  warning: { box: "bg-attention-soft border-[#fedf89]", icon: WarningIcon, iconClass: "text-attention" },
  error: { box: "bg-late-soft border-[#fecdca]", icon: WarningOctagonIcon, iconClass: "text-late" },
  success: { box: "bg-paid-soft border-[#abefc6]", icon: CheckCircleIcon, iconClass: "text-paid" },
} as const;

export function Banner({ tone = "info", title, children, action, className, role }: { tone?: keyof typeof BANNER; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; role?: "alert" | "status" }) {
  const b = BANNER[tone];
  const Icon = b.icon;
  return (
    <div role={role ?? (tone === "error" || tone === "warning" ? "alert" : "status")} className={cn("flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3", b.box, className)}>
      <Icon aria-hidden weight="fill" className={cn("mt-0.5 size-5 shrink-0", b.iconClass)} />
      <div className="min-w-0 flex-1 body-6">
        {title && <p className="title-4 font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-foreground/80")}>{children}</div>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/** Label / value rows, e.g. bank details or invoice meta. */
export function DetailList({ rows, className }: { rows: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y", className)}>
      {rows.map((r, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5 body-6">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="text-right font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
