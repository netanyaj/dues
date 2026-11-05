import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon, CheckIcon, MinusIcon, QuotesIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { sessionUser } from "@/lib/auth";
import { ClientPagePreview } from "@/components/landing/client-page-preview";
import { TaglineReveal } from "@/components/landing/tagline-reveal";

export const metadata: Metadata = {
  title: { absolute: "Dues · Get paid on time, with correct GST on every invoice" },
  description: "For Indian freelancers. Dues tracks who owes you and tells you when to chase. Make GST correct invoices by asking your Claude; your client pays by bank transfer or UPI.",
};

const CHECKS = [
  ["GST split", "CGST and SGST for a client in your state, IGST for one outside it, worked out from both states."],
  ["Every rupee in paise", "Tax is computed on the taxable value with exact rounding, never with floating point."],
  ["Numbering", "INV/2026–27/0001 onwards, given only when you send, with no gaps and a fresh series each April."],
  ["Claude's maths", "If Claude expected a different total by more than ₹1, the draft is flagged until you check it."],
  ["GSTIN and PAN", "Format, checksum and state code are checked before anything is saved."],
  ["Duplicates", "Claude retrying the same request within 10 minutes returns the same draft, not a second one."],
  ["UPI limit", "QR and pay button only for balances up to ₹1,00,000. Larger amounts show bank details."],
  ["MSME 45 days", "Registered on Udyam? Invoices state the MSMED Act terms and warn if you allow more than 45 days."],
];

const NOT = [
  ["No AI inside Dues", "Your Claude does the writing. Dues itself runs plain code, so the same input always gives the same invoice."],
  ["It doesn't verify payees yet", "Client pages say so plainly. Bank and GSTIN verification is planned as a paid add-on."],
  ["It doesn't send messages for you", "Reminders open in your own WhatsApp or email, so they come from you."],
  ["It can't see your bank", "When a client says they paid, you check your bank and confirm. Claude can never confirm a payment."],
];

const FAQ = [
  ["Do I need a paid Claude plan?", "Custom connectors work on Claude's free and paid plans. You can also use Dues without Claude: every invoice can be made by hand in the app."],
  ["Does my client need an account?", "No. They open a link, see the invoice, pay with their own bank or UPI app, and tap “I've paid” with the reference number."],
  ["Does Dues take a cut of payments?", "No. Money goes straight from your client to your account. Dues never touches it."],
  ["Is it a valid GST invoice?", "It has the fields a tax invoice needs: your GSTIN, the client's, place of supply, SAC codes, the tax split and a serial number per financial year."],
  ["What can Claude change?", "Drafts, clients and reminders. Sending an invoice, confirming a payment, cancelling or deleting only happen when you press the button in Dues."],
  ["What if I'm not GST registered?", "Leave the GSTIN blank. Invoices say “GST not applicable” and add no tax."],
];

export default async function Home() {
  if (await sessionUser()) redirect("/dashboard");
  return (
    <div className="flex flex-1 flex-col bg-card">
      <header className="sticky top-3 z-40 mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-5xl items-center gap-4 rounded-xl border bg-card/85 px-4 py-2 backdrop-blur-md">
        <Link href="/" aria-label="Dues home"><Logo /></Link>
        <nav aria-label="Sections" className="ml-4 hidden gap-5 body-5 text-muted-foreground md:flex">
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#checks" className="hover:text-foreground">What we check</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link href="/login">Log in</Link></Button>
          <Button asChild size="sm"><Link href="/signup">Create account</Link></Button>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="mx-auto grid max-w-5xl items-center gap-12 px-4 pb-20 pt-16 md:grid-cols-[1fr_auto] md:pt-24">
          <div className="max-w-[680px]">
            <p className="inline-flex rounded-full bg-brand-soft px-3 py-1 caption-3 text-brand">For Indian freelancers and small studios</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl sm:leading-none">
              <span className="text-brand-vivid">Get paid on time.</span><br />Correct GST on every invoice.
            </h1>
            <p className="mt-6 max-w-[560px] body-3 text-muted-foreground">
              Dues tracks who owes you and tells you when to chase. Make invoices by asking your Claude: Dues works out the GST, numbers them in order and gives your client a page to pay by bank transfer or UPI.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg"><Link href="/signup">Create a free account<ArrowRightIcon aria-hidden /></Link></Button>
              <a href="#how" className="body-5 text-brand underline underline-offset-4 hover:text-brand-strong">See how it works</a>
            </div>
            <p className="mt-4 caption-5 text-muted-foreground">Free for up to 50 invoices · No fees on payments · No card needed</p>
          </div>
          <ClientPagePreview />
        </section>

        {/* Problem */}
        <section className="border-t bg-background">
          <div className="mx-auto max-w-5xl px-4 py-20">
            <h2 className="max-w-[680px] heading-5 sm:heading-4">Making the invoice is the easy part. Getting paid is the second job.</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <figure className="rounded-xl border bg-card p-5">
                <QuotesIcon aria-hidden weight="fill" className="mb-3 size-6 text-brand" />
                <blockquote className="title-3">&ldquo;Send an invoice, wait, forget about it, realise it&apos;s overdue, figure out what to say.&rdquo;</blockquote>
                <figcaption className="mt-3 caption-5 text-muted-foreground">A freelancer on r/freelancing, describing the loop</figcaption>
              </figure>
              <figure className="rounded-xl border bg-card p-5">
                <QuotesIcon aria-hidden weight="fill" className="mb-3 size-6 text-brand" />
                <blockquote className="title-3">The client replies to work messages instantly. A payment reminder gets &ldquo;seen mode on WhatsApp&rdquo;.</blockquote>
                <figcaption className="mt-3 caption-5 text-muted-foreground">r/indianstartups, on clients paying late</figcaption>
              </figure>
              <figure className="rounded-xl border bg-card p-5">
                <QuotesIcon aria-hidden weight="fill" className="mb-3 size-6 text-brand" />
                <blockquote className="title-3">&ldquo;Tracking my income in WhatsApp messages and random notes. Missed payments, forgot GST.&rdquo;</blockquote>
                <figcaption className="mt-3 caption-5 text-muted-foreground">r/notioncreations, an Indian freelancer</figcaption>
              </figure>
            </div>
            <div className="mt-6 rounded-xl border border-[#f6c6d7] bg-brand-soft p-5 md:flex md:items-start md:gap-6">
              <p className="title-3 font-semibold text-brand md:w-64 md:shrink-0">The 45-day rule most clients forget</p>
              <p className="mt-2 body-6 text-foreground md:mt-0">
                If you&apos;re registered on Udyam as a micro or small enterprise, buyers must pay within 45 days under the MSMED Act, or owe compound interest at three times the RBI bank rate. Under Section 43B(h), a late buyer can&apos;t deduct the expense until they pay. Dues prints this on your invoice, in plain words, and warns you if your terms go past 45 days.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-20">
          <h2 className="heading-5 sm:heading-4">How it works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              ["Tell Claude", "“Invoice Acme in Bengaluru for 12 hours of design at ₹2,500 an hour with 18% GST, due in 15 days.” Claude creates a draft in Dues, and Dues computes every number."],
              ["Check and send in Dues", "Open the draft, fix anything, and press Send. Only then does it get its invoice number and a link for your client. Claude can't send for you."],
              ["Client pays, you confirm", "Your client pays by bank transfer or UPI and taps “I've paid” with the reference. You check your bank and confirm. Late ones show up in your chase list."],
            ].map(([t, d], i) => (
              <li key={t} className="flex flex-col gap-3">
                <span className="amount grid size-8 place-items-center rounded-lg bg-brand-soft caption-3 text-brand">{i + 1}</span>
                <p className="title-2 font-semibold">{t}</p>
                <p className="body-6 text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Tagline */}
        <section className="bg-sidebar px-4 py-24 text-center text-white">
          <TaglineReveal accentLast lines={["Claude drafts.", "Code checks every rupee.", "You send, and you confirm."]} />
        </section>

        {/* Checks */}
        <section id="checks" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-20">
          <h2 className="heading-5 sm:heading-4">What Dues checks in code</h2>
          <p className="mt-3 max-w-[560px] body-3 text-muted-foreground">Claude is good at understanding what you mean. Rules about money shouldn&apos;t depend on that, so Dues enforces them itself.</p>
          <dl className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {CHECKS.map(([t, d]) => (
              <div key={t} className="flex gap-3">
                <CheckIcon aria-hidden weight="bold" className="mt-0.5 size-5 shrink-0 text-brand" />
                <div><dt className="title-3">{t}</dt><dd className="mt-0.5 body-6 text-muted-foreground">{d}</dd></div>
              </div>
            ))}
          </dl>

          <h3 className="mt-16 heading-6">Honest about what it doesn&apos;t do</h3>
          <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {NOT.map(([t, d]) => (
              <div key={t} className="flex gap-3">
                <MinusIcon aria-hidden weight="bold" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div><dt className="title-3">{t}</dt><dd className="mt-0.5 body-6 text-muted-foreground">{d}</dd></div>
              </div>
            ))}
          </dl>
        </section>

        {/* Connect */}
        <section className="border-t bg-background">
          <div className="mx-auto max-w-5xl px-4 py-20">
            <h2 className="heading-5 sm:heading-4">Works with your Claude</h2>
            <p className="mt-3 max-w-[560px] body-3 text-muted-foreground">Ask Claude in plain words and the draft appears in Dues. Claude writes; Dues checks every number in code and never runs AI itself. You can also make every invoice by hand.</p>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {[
                ["Create your token", "Sign up, add your business details, then open Settings → Claude connection and create a token. It's shown once."],
                ["Add Dues to Claude", "In Claude, go to Customize → Connectors → Add custom connector. Paste the server URL, choose No sign in, and add the Authorization header."],
                ["Ask", "Start a new chat and ask Claude to invoice a client. The draft appears in Dues within seconds."],
              ].map(([t, d], i) => (
                <li key={t} className="rounded-xl border bg-card p-5">
                  <p className="amount caption-3 text-brand">Step {i + 1}</p>
                  <p className="mt-1 title-3 font-semibold">{t}</p>
                  <p className="mt-1 body-6 text-muted-foreground">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-20">
          <h2 className="heading-5 sm:heading-4">Pricing</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="flex flex-col rounded-xl border-2 border-brand p-6">
              <p className="title-2 font-semibold">Free <span className="ml-1 rounded-full bg-brand-soft px-2 py-0.5 caption-3 text-brand">Available now</span></p>
              <p className="amount mt-2 heading-4">₹0</p>
              <ul className="mt-6 flex flex-col gap-2 body-6">
                {["Up to 50 invoices", "Claude connection", "Client payment pages with bank and UPI", "Chase list and reminder drafts", "Export CSV"].map((f) => (
                  <li key={f} className="flex gap-2"><CheckIcon aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0 text-brand" />{f}</li>
                ))}
              </ul>
              <Button asChild size="lg" className="mt-8"><Link href="/signup">Create a free account</Link></Button>
            </div>
            <div className="flex flex-col rounded-xl border bg-background p-6">
              <p className="title-2 font-semibold">Pro <span className="ml-1 caption-4 text-muted-foreground">planned, not available yet</span></p>
              <p className="amount mt-2 heading-4">₹299<span className="body-6 text-muted-foreground"> a month</span></p>
              <ul className="mt-6 flex flex-col gap-2 body-6 text-muted-foreground">
                {["Unlimited invoices", "Payments confirmed automatically through your own Razorpay or Cashfree", "Reminders sent on a schedule by email", "Recurring invoices and credit notes", "Verified business badge on client pages"].map((f) => (
                  <li key={f} className="flex gap-2"><MinusIcon aria-hidden className="mt-0.5 size-4 shrink-0" />{f}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t bg-background">
          <div className="mx-auto max-w-3xl scroll-mt-24 px-4 py-20">
            <h2 className="heading-5 sm:heading-4">Questions</h2>
            <div className="mt-8 divide-y rounded-xl border bg-card">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 title-3 [&::-webkit-details-marker]:hidden">
                    {q}<span aria-hidden className="text-muted-foreground transition-transform duration-300 group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 body-6 text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-5xl px-4 py-20">
          <div className="rounded-2xl bg-brand px-6 py-16 text-center text-white">
            <h2 className="mx-auto max-w-[680px] heading-5 sm:heading-4">Send your next invoice from Claude, and know when it&apos;s paid.</h2>
            <div className="mt-8 flex justify-center"><Button asChild size="lg" variant="secondary" className="bg-white hover:bg-brand-soft"><Link href="/signup">Create a free account<ArrowRightIcon aria-hidden /></Link></Button></div>
            <p className="mt-4 caption-5 text-white/80">Free for up to 50 invoices · No card needed</p>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 caption-5 text-muted-foreground">
          <Logo size={20} />
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <span className="ml-auto">Made in India for freelancers who&apos;d rather do the work than chase it.</span>
        </div>
      </footer>
    </div>
  );
}
