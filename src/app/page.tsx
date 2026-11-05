import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { sessionUser } from "@/lib/auth";

export default async function Home() {
  if (await sessionUser()) redirect("/dashboard");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-16">
      <div className="text-lg font-semibold tracking-tight">Dues</div>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Get paid on time, without leaving Claude.</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Tell Claude who to invoice. Dues creates a GST-correct invoice with the right number and tax, gives your client a page to pay
          by bank transfer or UPI, and keeps track of who still owes you.
        </p>
      </div>
      <ul className="grid gap-3 text-sm sm:grid-cols-3">
        <li className="rounded-lg border p-4"><span className="font-medium">Correct invoices.</span> Dues works out the tax split, numbers each invoice in order and checks Claude&apos;s maths.</li>
        <li className="rounded-lg border p-4"><span className="font-medium">No fees.</span> Money goes straight to your bank account or UPI ID. There&apos;s no payment gateway.</li>
        <li className="rounded-lg border p-4"><span className="font-medium">Know who to chase.</span> See what&apos;s overdue each day, with TDS tracked per client.</li>
      </ul>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg" className="h-11 px-5"><Link href="/signup">Create account</Link></Button>
        <Button asChild size="lg" variant="outline" className="h-11 px-5"><Link href="/login">Log in</Link></Button>
      </div>
    </main>
  );
}
