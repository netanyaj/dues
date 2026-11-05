"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Re-fetches server data every few seconds while the tab is visible, so Claude's changes appear on their own. */
export function AutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [router, seconds]);
  return null;
}

/** Icon-only copy button. `label` names it for screen readers and the hover tooltip. */
export function CopyButton({ value, label = "Copy", className, variant = "outline", size = "icon-sm" }: {
  value: string; label?: string; className?: string; variant?: "outline" | "default" | "ghost" | "secondary"; size?: "icon" | "icon-sm" | "icon-xs" | "icon-lg";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("shrink-0", className)}
      title={copied ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = value;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      aria-label={label}
    >
      {copied ? <CheckIcon className="text-paid" /> : <CopyIcon />}
      <span aria-live="polite" className="sr-only">{copied ? "Copied" : ""}</span>
    </Button>
  );
}

export function FieldError({ id, error }: { id?: string; error?: string }) {
  if (!error) return null;
  return <p id={id} role="alert" className="text-sm text-destructive">{error}</p>;
}

export function FormMessage({ ok, error, className }: { ok?: string | null; error?: string | null; className?: string }) {
  if (!ok && !error) return null;
  return (
    <p role={error ? "alert" : "status"} className={cn("rounded-md px-3 py-2 text-sm", error ? "border border-danger-border bg-danger-soft text-danger" : "border border-paid-border bg-paid-soft text-paid", className)}>
      {error ?? ok}
    </p>
  );
}
