// D51: "How it works" as one annotated invoice. Sample business and numbers only; the maths is real
// (12 × ₹2,500 = ₹30,000, CGST + SGST at 9% each = ₹2,700 + ₹2,700, total ₹35,400).
const Marker = ({ n }: { n: number }) => (
  <span aria-hidden className="amount grid size-6 shrink-0 place-items-center rounded-full bg-foreground caption-3 text-background">{n}</span>
);

const CALLOUTS: [string, string][] = [
  ["Tell Claude", "“Invoice Acme in Bengaluru for 12 hours of design at ₹2,500 an hour with 18% GST, due in 15 days.” Claude creates the draft in Dues."],
  ["Check and send in Dues", "Dues computes every number. Press Send and it gets its invoice number and a link for your client. Claude can't send for you."],
  ["Client pays, you confirm", "Your client pays by bank transfer or UPI and taps “Notify as paid” with the reference. You check your bank and confirm."],
];

export function InvoiceWalkthrough() {
  return (
    <div className="mt-10 grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <figure aria-label="A sample invoice made with Dues, with three numbered steps" className="rounded-2xl border bg-card p-6 shadow-[0_24px_48px_-32px_rgba(0,0,0,0.25)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="caption-4 text-muted-foreground">Tax invoice</p>
            <p className="mt-1 flex items-center gap-2 title-2"><span className="amount">INV/2026-27/0014</span><Marker n={2} /></p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 caption-5">
            <dt className="text-muted-foreground">Invoice date</dt><dd className="amount text-right">3 Nov 2026</dd>
            <dt className="text-muted-foreground">Due date</dt><dd className="amount text-right">18 Nov 2026</dd>
            <dt className="text-muted-foreground">Place of supply</dt><dd className="text-right">Karnataka (29)</dd>
          </dl>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 body-6">
          <div><p className="caption-4 text-muted-foreground">From</p><p className="title-4">Ananya Rao Design</p><p className="text-muted-foreground">Bengaluru · GSTIN 29ABCDE1234F1Z5</p></div>
          <div><p className="caption-4 text-muted-foreground">Bill to</p><p className="title-4">Acme Studio</p><p className="text-muted-foreground">Bengaluru · Karnataka (29)</p></div>
        </div>
        <table className="mt-6 w-full body-6">
          <thead className="border-b text-left caption-4 text-muted-foreground">
            <tr><th scope="col" className="py-2 font-medium">Description</th><th scope="col" className="py-2 text-right font-medium">Qty</th><th scope="col" className="py-2 text-right font-medium">Rate</th><th scope="col" className="py-2 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-3"><span className="flex items-center gap-2"><Marker n={1} />Design, 12 hours</span></td>
              <td className="amount py-3 text-right">12</td><td className="amount py-3 text-right">₹2,500.00</td><td className="amount py-3 text-right">₹30,000.00</td>
            </tr>
          </tbody>
        </table>
        <dl className="mt-4 ml-auto grid max-w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1 body-6">
          <dt className="text-muted-foreground">Taxable value</dt><dd className="amount text-right">₹30,000.00</dd>
          <dt className="text-muted-foreground">CGST @ 9%</dt><dd className="amount text-right">₹2,700.00</dd>
          <dt className="text-muted-foreground">SGST @ 9%</dt><dd className="amount text-right">₹2,700.00</dd>
          <dt className="border-t pt-2 title-3">Total</dt><dd className="amount border-t pt-2 text-right title-3">₹35,400.00</dd>
        </dl>
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl bg-muted px-4 py-3 body-6">
          <Marker n={3} />
          <span className="min-w-0 flex-1">Acme says they paid <span className="amount font-medium">₹35,400.00</span> · UTR <span className="amount">412345678901</span></span>
          <span className="rounded-lg bg-foreground px-3 py-1 caption-3 text-background">Confirm</span>
        </div>
      </figure>
      <ol className="flex flex-col gap-6">
        {CALLOUTS.map(([t, d], i) => (
          <li key={t} className="flex gap-4">
            <Marker n={i + 1} />
            <div><p className="title-2">{t}</p><p className="mt-1 body-6 text-muted-foreground">{d}</p></div>
          </li>
        ))}
      </ol>
    </div>
  );
}
