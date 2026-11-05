import Link from "next/link";
import { Logo } from "@/components/logo";

export default function InvoiceNotFound() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16">
      <Logo />
      <h1 className="heading-6">This invoice link doesn&apos;t work</h1>
      <p className="body-6 text-muted-foreground">
        The link may be mistyped, or the invoice may not have been sent yet. Ask the person who sent it to share the link again, and check the full link was copied.
      </p>
      <p className="body-6 text-muted-foreground">Please don&apos;t pay anyone from an invoice you can&apos;t open here.</p>
      <Link href="/" className="body-5 underline underline-offset-4">What is Dues?</Link>
    </main>
  );
}
