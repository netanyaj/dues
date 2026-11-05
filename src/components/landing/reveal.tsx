"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Sections rise 32px and fade in once, when they enter the viewport (landing-page-design B7). */
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.dataset.shown = "1"; return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.dataset.shown = "1"; io.disconnect(); } }, { rootMargin: "0px 0px -10% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`translate-y-8 opacity-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] data-[shown]:translate-y-0 data-[shown]:opacity-100 ${className}`}>
      {children}
    </div>
  );
}
