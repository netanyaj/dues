import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16">
      <Logo />
      <h1 className="heading-6">Page not found</h1>
      <p className="body-6 text-muted-foreground">This page doesn&apos;t exist or has moved. If you were opening an invoice, ask the sender for the link again.</p>
      <div className="flex gap-2">
        <Button asChild><Link href="/dashboard">Go to your dashboard</Link></Button>
        <Button asChild variant="outline"><Link href="/">Home</Link></Button>
      </div>
    </main>
  );
}
