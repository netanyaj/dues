import { STATUS_LABEL, type InvoiceStatus } from "@/lib/domain/status";
import { cn } from "@/lib/utils";

// Colour plus a word, so status never depends on colour alone.
const STYLE: Record<InvoiceStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 ring-zinc-300",
  sent: "bg-blue-50 text-blue-800 ring-blue-200",
  partially_paid: "bg-violet-50 text-violet-800 ring-violet-200",
  overdue: "bg-red-50 text-red-800 ring-red-200",
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cancelled: "bg-white text-zinc-500 ring-zinc-300 line-through decoration-zinc-400",
};

const DOT: Record<InvoiceStatus, string> = {
  draft: "bg-zinc-400",
  sent: "bg-blue-500",
  partially_paid: "bg-violet-500",
  overdue: "bg-red-500",
  paid: "bg-emerald-500",
  cancelled: "bg-zinc-300",
};

export function StatusBadge({ status, pendingReports = 0, className }: { status: InvoiceStatus; pendingReports?: number; className?: string }) {
  const reported = pendingReports > 0 && (status === "sent" || status === "overdue" || status === "partially_paid");
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", STYLE[status], className)}>
        <span aria-hidden className={cn("size-1.5 rounded-full", DOT[status])} />
        {STATUS_LABEL[status]}
      </span>
      {reported && (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-900 ring-1 ring-inset ring-amber-300">
          <span className="sr-only">and </span>Payment reported
        </span>
      )}
    </span>
  );
}

export function ClaudeBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800 ring-1 ring-inset ring-orange-200 whitespace-nowrap">
      Created by Claude
    </span>
  );
}
