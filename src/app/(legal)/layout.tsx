import Link from "next/link";
import { Logo } from "@/components/logo";

export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Link href="/" aria-label="Dues home"><Logo /></Link>
      <article className="mt-8 flex flex-col gap-4 rounded-xl border bg-card p-6 body-6 [&_h1]:heading-6 [&_h2]:mt-2 [&_h2]:title-3 [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">{children}</article>
    </main>
  );
}
