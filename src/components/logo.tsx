import { cn } from "@/lib/utils";

/** Four tally marks struck through: counted and settled. */
export function LogoMark({ size = 24, className, inverted = false }: { size?: number; className?: string; inverted?: boolean }) {
  // Same brand tile on light and dark surfaces; `inverted` only changes the wordmark colour.
  void inverted;
  const bg = "#e0306e";
  const fg = "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className={cn("shrink-0", className)}>
      <rect width="28" height="28" rx="6" fill={bg} />
      <path d="M8 7v14M12 7v14M16 7v14M20 7v14" stroke={fg} strokeWidth="2" strokeLinecap="round" />
      <path d="M5.5 19 22.5 9" stroke={fg} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, inverted = false, size = 24 }: { className?: string; inverted?: boolean; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} inverted={inverted} />
      <span className="title-3 font-semibold tracking-tight">Dues</span>
    </span>
  );
}
