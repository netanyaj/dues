import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Fraunces, IBM_Plex_Sans } from "next/font/google";
import { ArrowRightIcon, CheckIcon, MinusIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { sessionUser } from "@/lib/auth";
import { ClientPagePreview } from "@/components/landing/client-page-preview";
import { InvoiceWalkthrough } from "@/components/landing/invoice-walkthrough";

// D51: the landing page has its own pairing. Fraunces (a characterful serif) for headings, IBM Plex
// Sans for body. Both include ₹, and Plex has true tabular figures for money. The app keeps Geist.
const display = Fraunces({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-display", display: "swap" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: { absolute: "Dues · Get paid on time, with correct GST on every invoice" },
  description: "For Indian freelancers. Dues tracks who owes you and tells you when to chase. Make GST correct invoices by asking your Claude; your client pays by bank transfer or UPI.",
};

// Six rows, side by side: what Dues enforces in code, and what it deliberately doesn't do.
const COMPARE: [string, string, string, string][] = [
  ["GST split", "CGST and SGST for a client in your state, IGST for one outside it, worked out from both states.", "No AI inside Dues", "Your Claude does the writing. Dues itself runs plain code, so the same input always gives the same invoice."],
  ["Numbering", "INV/2026–27/0001 onwards, given only when you send, with no gaps and a fresh series each April.", "It doesn't send messages for you", "Reminders open in your own WhatsApp or email, so they come from you."],
  ["Claude's maths", "If Claude expected a different total by more than ₹1, the draft is flagged until you check it.", "It can't see your bank", "When a client says they paid, you check your bank and confirm. Claude can never confirm a payment."],
  ["GSTIN and PAN", "Format, checksum and state code are checked before anything is saved.", "It doesn't verify payees yet", "Client pages say so plainly. Bank and GSTIN verification is planned as a paid add-on."],
  ["UPI limit", "QR and pay button only for balances up to ₹1,00,000. Larger amounts show bank details.", "It doesn't take a cut", "Money goes straight from your client to your account. Dues never touches it."],
  ["MSME 45 days", "Registered on Udyam? Invoices state the MSMED Act terms and warn if you allow more than 45 days.", "It doesn't file your GST return", "Export CSV gives your GST split, TDS and payments for whoever files it."],
];

const QUOTES: [string, string][] = [
  ["“Send an invoice, wait, forget about it, realise it's overdue, figure out what to say.”", "r/freelancing, describing the loop"],
  ["The client replies to work messages instantly. A payment reminder gets “seen mode on WhatsApp”.", "r/indianstartups, on clients paying late"],
  ["“Tracking my income in WhatsApp messages and random notes. Missed payments, forgot GST.”", "r/notioncreations, an Indian freelancer"],
];

const SETUP = [
  "Sign up, add your business details, then open Settings → Claude connection and create a token. It's shown once.",
  "In Claude, go to Customize → Connectors → Add custom connector. Paste the server URL, choose No sign in, and add the Authorization header.",
  "Start a new chat and ask Claude to invoice a client. The draft appears in Dues within seconds.",
];

const FAQ = [
  ["Do I need a paid Claude plan?", "Custom connectors work on Claude's free and paid plans. You can also use Dues without Claude: every invoice can be made by hand in the app."],
  ["Does my client need an account?", "No. They open a link, see the invoice, pay with their own bank or UPI app, and tap “Notify as paid” with the reference number."],
  ["Does Dues take a cut of payments?", "No. Money goes straight from your client to your account. Dues never touches it."],
  ["Is it a valid GST invoice?", "It has the fields a tax invoice needs: your GSTIN, the client's, place of supply, SAC codes, the tax split and a serial number per financial year."],
  ["What can Claude change?", "Drafts, clients and reminders. Sending an invoice, confirming a payment, cancelling or deleting only happen when you press the button in Dues."],
  ["What if I'm not GST registered?", "Leave the GSTIN blank. Invoices say “GST not applicable” and add no tax."],
];

export default async function Home() {
  if (await sessionUser()) redirect("/dashboard");
  return (
    <div className={`landing ${display.variable} ${body.variable} flex flex-1 flex-col bg-background`}>
      <header className="sticky top-3 z-40 mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-5xl items-center gap-4 rounded-xl border bg-card/90 px-4 py-2 backdrop-blur-md">
        <Link href="/" aria-label="Dues home"><Logo /></Link>
        <nav aria-label="Sections" className="ml-4 hidden gap-6 body-5 text-muted-foreground md:flex">
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
        {/* Hero: text and the client page, on the flat base colour */}
        <section className="mx-auto grid max-w-5xl items-center gap-12 px-4 pb-20 pt-16 md:grid-cols-[1fr_auto] md:pt-24">
          <div className="max-w-[680px]">
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
              Get paid on time.<br />Correct GST on every invoice.
            </h1>
            <p className="mt-6 max-w-[560px] body-3 text-muted-foreground">
              For Indian freelancers and small studios. Dues tracks who owes you and tells you when to chase. Make invoices by asking your Claude: Dues works out the GST, numbers them in order and gives your client a page to pay by bank transfer or UPI.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button asChild size="lg"><Link href="/signup">Create a free account<ArrowRightIcon aria-hidden /></Link></Button>
              <a href="#how" className="body-5 underline underline-offset-4 hover:text-brand">See how it works</a>
            </div>
            <p className="mt-4 caption-5 text-muted-foreground">Free for up to 50 invoices · No fees on payments · No card needed</p>
          </div>
          <ClientPagePreview />
        </section>

        {/* Problem: pull quotes between rules, then one big number. No cards. */}
        <section className="border-t bg-card">
          <div className="mx-auto max-w-5xl px-4 py-20">
            <h2 className="max-w-[680px] text-3xl leading-tight font-semibold sm:text-4xl">Making the invoice is the easy part. Getting paid is the second job.</h2>
            <p className="mt-10 caption-3 text-muted-foreground">What freelancers say on Reddit</p>
            <div className="mt-4 grid divide-y border-y md:grid-cols-3 md:divide-x md:divide-y-0">
              {QUOTES.map(([q, src]) => (
                <figure key={src} className="py-6 md:px-6 md:first:pl-0 md:last:pr-0">
                  <blockquote className="text-xl leading-snug font-medium">{q}</blockquote>
                  <figcaption className="mt-3 caption-5 text-muted-foreground">{src}</figcaption>
                </figure>
              ))}
            </div>
            <div className="mt-16 grid items-start gap-6 md:grid-cols-[auto_1fr] md:gap-12">
              <p className="amount font-[family-name:var(--font-display)] text-7xl leading-none font-semibold text-brand sm:text-8xl">45<span className="ml-2 text-2xl text-foreground">days</span></p>
              <div>
                <h3 className="text-2xl font-semibold">The rule most clients forget</h3>
                <p className="mt-3 max-w-[600px] body-3 text-muted-foreground">
                  If you&apos;re registered on Udyam as a micro or small enterprise, buyers must pay within 45 days under the MSMED Act, or owe compound interest at three times the RBI bank rate. Under Section 43B(h), a late buyer can&apos;t deduct the expense until they pay. Dues prints this on your invoice, in plain words, and warns you if your terms go past 45 days.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works: one annotated invoice instead of three cards */}
        <section id="how" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-20">
          <h2 className="text-3xl font-semibold sm:text-4xl">How it works</h2>
          <InvoiceWalkthrough />
        </section>

        {/* Tagline: one plain line on flat ink */}
        <section className="bg-sidebar px-4 py-24 text-center text-white">
          <p className="mx-auto max-w-[920px] font-[family-name:var(--font-display)] text-3xl leading-tight font-semibold sm:text-6xl sm:leading-[1.05]">
            Claude drafts.<br />Code checks every rupee.<br />You send, and you confirm.
          </p>
        </section>

        {/* Checks: one comparison table */}
        <section id="checks" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-20">
          <div className="max-w-[640px]">
            <h2 className="text-3xl font-semibold sm:text-4xl">What Dues checks, and what it doesn&apos;t do</h2>
            <p className="mt-3 body-3 text-muted-foreground">Claude is good at understanding what you mean. Rules about money shouldn&apos;t depend on that, so Dues enforces them itself, and says plainly where it stops.</p>
          </div>
          <div className="mt-10 overflow-hidden rounded-xl border bg-card">
            <table className="hidden w-full table-fixed text-left sm:table">
              <caption className="sr-only">What Dues checks in code, next to what Dues doesn&apos;t do</caption>
              <thead className="border-b bg-muted/50">
                <tr>
                  <th scope="col" className="px-6 py-3 body-4"><span className="inline-flex items-center gap-2"><CheckIcon aria-hidden weight="bold" className="size-4 text-brand" />Dues checks</span></th>
                  <th scope="col" className="border-l px-6 py-3 body-4"><span className="inline-flex items-center gap-2"><MinusIcon aria-hidden weight="bold" className="size-4 text-muted-foreground" />Dues doesn&apos;t</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {COMPARE.map(([t1, d1, t2, d2]) => (
                  <tr key={t1} className="align-top">
                    <td className="px-6 py-4"><p className="title-3">{t1}</p><p className="mt-1 body-6 text-muted-foreground">{d1}</p></td>
                    <td className="border-l px-6 py-4"><p className="title-3">{t2}</p><p className="mt-1 body-6 text-muted-foreground">{d2}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Phones: the same rows as two short lists, so nothing is squeezed into half a screen */}
            <div className="divide-y sm:hidden">
              {[["Dues checks", 0], ["Dues doesn't", 2]].map(([label, col]) => (
                <div key={label as string} className="p-4">
                  <p className="flex items-center gap-2 body-4">{col === 0 ? <CheckIcon aria-hidden weight="bold" className="size-4 text-brand" /> : <MinusIcon aria-hidden weight="bold" className="size-4 text-muted-foreground" />}{label}</p>
                  <ul className="mt-3 flex flex-col gap-3">
                    {COMPARE.map((row) => (
                      <li key={row[col as number]}><p className="title-4">{row[col as number]}</p><p className="mt-0.5 body-6 text-muted-foreground">{row[(col as number) + 1]}</p></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Works with your Claude: text beside a plain numbered list */}
        <section className="border-y bg-card">
          <div className="mx-auto grid max-w-5xl gap-10 px-4 py-20 md:grid-cols-[2fr_3fr] md:gap-16">
            <div>
              <h2 className="text-3xl font-semibold sm:text-4xl">Works with your Claude</h2>
              <p className="mt-3 body-3 text-muted-foreground">Ask Claude in plain words and the draft appears in Dues. Claude writes; Dues checks every number in code and never runs AI itself. You can also make every invoice by hand.</p>
            </div>
            <ol className="flex list-decimal flex-col gap-4 pl-6 body-3 marker:font-semibold marker:text-brand">
              {SETUP.map((s) => <li key={s} className="pl-2">{s}</li>)}
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-20">
          <h2 className="text-3xl font-semibold sm:text-4xl">Pricing</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="flex flex-col rounded-xl border-2 border-foreground bg-card p-6">
              <p className="heading-6">Free</p>
              <p className="amount mt-2 heading-4">₹0</p>
              <ul className="mt-6 flex flex-col gap-2 body-6">
                {["Up to 50 invoices", "Claude connection", "Client payment pages with bank and UPI", "Chase list and reminder drafts", "Export CSV"].map((f) => (
                  <li key={f} className="flex gap-2"><CheckIcon aria-hidden weight="bold" className="mt-0.5 size-4 shrink-0 text-brand" />{f}</li>
                ))}
              </ul>
              <Button asChild size="lg" className="mt-8"><Link href="/signup">Create a free account</Link></Button>
            </div>
            <div className="flex flex-col rounded-xl border bg-muted/40 p-6">
              <p className="heading-6">Pro <span className="ml-1 caption-4 text-muted-foreground">planned, not available yet</span></p>
              <p className="amount mt-2 heading-4">₹299<span className="body-6 text-muted-foreground"> a month</span></p>
              <ul className="mt-6 flex flex-col gap-2 body-6 text-muted-foreground">
                {["Unlimited invoices", "Payments confirmed automatically through your own Razorpay or Cashfree", "Reminders sent on a schedule by email", "Recurring invoices and credit notes", "Verified business badge on client pages"].map((f) => (
                  <li key={f} className="flex gap-2"><MinusIcon aria-hidden className="mt-0.5 size-4 shrink-0" />{f}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ: heading on the left, answers on the right */}
        <section id="faq" className="scroll-mt-24 border-t bg-card">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 py-20 md:grid-cols-[1fr_2fr] md:gap-16">
            <h2 className="text-3xl font-semibold sm:text-4xl">Questions</h2>
            <div className="divide-y border-y">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 title-3 [&::-webkit-details-marker]:hidden">
                    {q}<span aria-hidden className="text-muted-foreground transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none">+</span>
                  </summary>
                  <p className="mt-2 body-6 text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action: flat ink */}
        <section className="mx-auto w-full max-w-5xl px-4 py-20">
          <div className="rounded-2xl bg-sidebar px-6 py-16 text-center text-white">
            <h2 className="mx-auto max-w-[680px] text-3xl leading-tight font-semibold sm:text-4xl">Send your next invoice from Claude, and know when it&apos;s paid.</h2>
            <div className="mt-8 flex justify-center"><Button asChild size="lg" variant="secondary" className="bg-white text-foreground hover:bg-[#ebebeb]"><Link href="/signup">Create a free account<ArrowRightIcon aria-hidden /></Link></Button></div>
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
