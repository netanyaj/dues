// A static, faithful copy of the client invoice page, used as the landing hero visual.
// Sample business and numbers only.
export function ClientPagePreview() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-[340px] rounded-[28px] border border-input bg-background p-3 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.25)]">
      <div className="flex flex-col gap-3 rounded-[18px] bg-background">
        <div className="rounded-xl border bg-card p-4">
          <p className="caption-5 text-muted-foreground">Ananya Rao Design has sent you an invoice</p>
          <p className="amount caption-4 text-muted-foreground">INV/2026-27/0014 · 3 Nov 2026</p>
          <p className="mt-4 caption-4 text-muted-foreground">Amount due</p>
          <p className="amount text-3xl font-semibold tracking-tight">₹47,200.00</p>
          <p className="caption-5 text-muted-foreground">Due on 18 Nov 2026</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="title-4">Bank transfer</p>
          <dl className="mt-1 divide-y border-y caption-5">
            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Account number</dt><dd className="amount font-medium">50100234567891</dd></div>
            <div className="flex justify-between py-2"><dt className="text-muted-foreground">IFSC</dt><dd className="amount font-medium">HDFC0001234</dd></div>
          </dl>
          <div className="mt-3 rounded-lg bg-primary py-2 text-center caption-3 text-primary-foreground">Pay with UPI</div>
          <div className="mt-2 rounded-lg border py-2 text-center caption-3">Notify as paid</div>
        </div>
        <div className="rounded-xl border bg-card p-4 caption-5 text-muted-foreground">
          Dues does not verify businesses or bank details. Business: Not verified. Bank account: Not verified.
        </div>
      </div>
    </div>
  );
}
