"use client";

import { useEffect, useRef } from "react";

/** Words go from muted to full ink one at a time as they cross the middle of the screen. */
export function TaglineReveal({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const words = Array.from(el.querySelectorAll<HTMLSpanElement>("[data-word]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      words.forEach((w) => (w.style.opacity = "1"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { (e.target as HTMLElement).style.opacity = "1"; io.unobserve(e.target); } }),
      { rootMargin: "0px 0px -45% 0px" },
    );
    words.forEach((w) => io.observe(w));
    return () => io.disconnect();
  }, []);
  return (
    <p ref={ref} className="mx-auto max-w-[680px] heading-4 sm:text-5xl sm:leading-none" aria-label={lines.join(" ")}>
      {lines.map((line, i) => (
        <span key={i} className="block" aria-hidden>
          {line.split(" ").map((w, j) => (
            <span key={j} data-word className="inline-block opacity-30 transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">{w}&nbsp;</span>
          ))}
        </span>
      ))}
    </p>
  );
}
