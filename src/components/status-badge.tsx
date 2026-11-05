import { RobotIcon } from "@phosphor-icons/react/dist/ssr";
import { STATUS_LABEL, type InvoiceStatus } from "@/lib/domain/status";
import { cn } from "@/lib/utils";

// Status is a dot plus a word, never colour alone (D33): amber = overdue, green = paid,
// neutral = payment reported / needs review. Red is for errors only; pink is brand only.
const TONE: Record<InvoiceStatus, { text: string; dot: string }> = {
  draft: { text: "text-muted-foreground", dot: "bg-[#a3a3a3]" },
  sent: { text: "text-foreground", dot: "bg-foreground" },
  partially_paid: { text: "text-foreground", dot: "bg-foreground" },
  overdue: { text: "text-late", dot: "bg-late" },
  paid: { text: "text-paid", dot: "bg-paid" },
  cancelled: { text: "text-muted-foreground line-through", dot: "bg-[#d4d4d4]" },
};

export function StatusBadge({ status, pendingReports = 0, className }: { status: InvoiceStatus; pendingReports?: number; className?: string }) {
  const reported = pendingReports > 0 && (status === "sent" || status === "overdue" || status === "partially_paid");
  const t = TONE[status];
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1 body-5 whitespace-nowrap", className)}>
      <span className={cn("inline-flex items-center gap-1.5", t.text)}>
        <span aria-hidden className={cn("size-1.5 rounded-full", t.dot)} />
        {STATUS_LABEL[status]}
      </span>
      {reported && (
        <span className="inline-flex items-center gap-1.5 text-review">
          <span aria-hidden className="size-1.5 rounded-full bg-review ring-2 ring-review/20" />
          <span className="sr-only">and </span>Payment reported
        </span>
      )}
    </span>
  );
}

/** Quiet marker that Claude drafted this. Icon plus word, no colour. */
export function ClaudeBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 caption-4 text-muted-foreground whitespace-nowrap", className)}>
      <RobotIcon aria-hidden className="size-3.5" />
      Drafted by Claude
    </span>
  );
}
