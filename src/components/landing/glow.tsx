// Decorative drifting glows (D45). aria-hidden, pointer-events off, clipped by the parent (overflow-hidden).
export function Glow({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const strong = tone === "dark";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className={`glow-a absolute -left-1/4 -top-1/2 h-[140%] w-[70%] rounded-full blur-3xl ${strong ? "bg-[#da5cc7]/45" : "bg-[#da5cc7]/20"}`} />
      <div className={`glow-b absolute -right-1/4 -bottom-1/2 h-[140%] w-[70%] rounded-full blur-3xl ${strong ? "bg-[#7c5cf0]/40" : "bg-[#7c5cf0]/15"}`} />
      {strong && <div className="glow-pulse absolute inset-x-1/4 top-1/4 h-1/2 rounded-full bg-[#ff9ad8]/15 blur-3xl" />}
    </div>
  );
}
