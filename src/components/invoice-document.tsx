import { stateName } from "@/lib/domain/gst";
import { formatINR, qtyMilliToString, parseQtyMilli } from "@/lib/domain/money";
import { formatDate, fyLabel } from "@/lib/domain/dates";

export type DocParty = {
  name: string | null;
  address: string | null;
  gstin: string | null;
  pan?: string | null;
  state_code: string | null;
};

export type DocData = {
  number: string | null;
  fy: string | null;
  issue_date: string;
  due_date: string;
  original_due_date?: string | null;
  seller: DocParty;
  buyer: DocParty;
  items: { description: string; sac: string; qty: string | number; rate_paise: number; amount_paise: number }[];
  gst_rate: number;
  gst_applicable: boolean;
  subtotal_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_paise: number;
  notes: string | null;
  msme_line?: string | null;
  draft?: boolean;
  cancelled?: boolean;
};

const qty = (q: string | number) => qtyMilliToString(parseQtyMilli(String(q)));

function Party({ title, p }: { title: string; p: DocParty }) {
  return (
    <div className="min-w-0 break-words">
      <p className="caption-4 text-muted-foreground">{title}</p>
      <p className="mt-1 title-4">{p.name}</p>
      {p.address ? <p className="body-6 whitespace-pre-line text-muted-foreground">{p.address}</p> : null}
      <p className="body-6 text-muted-foreground">{stateName(p.state_code)}{p.state_code ? ` (${p.state_code})` : ""}</p>
      <p className="body-6">{p.gstin ? <>GSTIN <span className="amount">{p.gstin}</span></> : <span className="text-muted-foreground">Unregistered (no GSTIN)</span>}</p>
      {p.pan ? <p className="body-6">PAN <span className="amount">{p.pan}</span></p> : null}
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? "mt-1 flex justify-between border-t pt-2 title-3 font-semibold" : "flex justify-between body-6"}>
      <dt>{label}</dt><dd className="amount">{formatINR(value)}</dd>
    </div>
  );
}

export function InvoiceDocument({ d }: { d: DocData }) {
  const intra = d.gst_applicable && d.igst_paise === 0 && d.gst_rate > 0;
  const inter = d.gst_applicable && d.igst_paise > 0;
  return (
    <article className="relative min-w-0 rounded-xl border bg-card p-4 sm:p-8 print:border-0 print:p-0" aria-label="Invoice">
      {d.draft && (
        <p className="mb-4 rounded-lg border border-dashed border-input px-3 py-2 text-center caption-4 text-muted-foreground">
          Draft preview. Not a valid tax invoice until you send it and it gets a number.
        </p>
      )}
      {d.cancelled && (
        <p className="mb-4 rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-center caption-3 text-danger">
          Cancelled. This invoice is void and should not be paid.
        </p>
      )}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="heading-6">{d.gst_applicable ? "Tax invoice" : "Invoice"}</h2>
          <p className="amount mt-0.5 body-6 text-muted-foreground">{d.number ?? "No number yet"}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 body-6 sm:text-right">
          <dt className="text-muted-foreground sm:text-left">Invoice date</dt><dd>{formatDate(d.issue_date)}</dd>
          <dt className="text-muted-foreground sm:text-left">Due date</dt><dd>{formatDate(d.due_date)}</dd>
          {d.fy ? <><dt className="text-muted-foreground sm:text-left">Financial year</dt><dd>{fyLabel(d.fy)}</dd></> : null}
          <dt className="text-muted-foreground sm:text-left">Place of supply</dt><dd>{stateName(d.buyer.state_code)} ({d.buyer.state_code})</dd>
        </dl>
      </header>
      {d.original_due_date && d.original_due_date !== d.due_date ? (
        <p className="mt-3 body-6">Due date moved from {formatDate(d.original_due_date)} to {formatDate(d.due_date)}.</p>
      ) : null}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Party title="From" p={d.seller} />
        <Party title="Bill to" p={d.buyer} />
      </div>

      <table className="mt-6 hidden w-full body-6 sm:table">
        <thead className="border-b text-left caption-4 text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 pr-2 font-medium">#</th>
            <th scope="col" className="py-2 pr-2 font-medium">Description</th>
            <th scope="col" className="py-2 pr-2 font-medium">SAC</th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">Qty</th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">Rate</th>
            <th scope="col" className="py-2 text-right font-medium">Taxable value</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {d.items.map((it, i) => (
            <tr key={i}>
              <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
              <td className="py-2 pr-2">{it.description}</td>
              <td className="amount py-2 pr-2 text-muted-foreground">{it.sac}</td>
              <td className="amount py-2 pr-2 text-right">{qty(it.qty)}</td>
              <td className="amount py-2 pr-2 text-right">{formatINR(it.rate_paise)}</td>
              <td className="amount py-2 text-right">{formatINR(it.amount_paise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-6 divide-y border-y sm:hidden">
        {d.items.map((it, i) => (
          <li key={i} className="flex justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <p className="body-6 break-words">{it.description}</p>
              <p className="amount caption-5 text-muted-foreground">{qty(it.qty)} × {formatINR(it.rate_paise)} · SAC {it.sac}</p>
            </div>
            <p className="amount body-6">{formatINR(it.amount_paise)}</p>
          </li>
        ))}
      </ul>

      <dl className="mt-4 ml-auto flex max-w-xs flex-col gap-1">
        <Row label="Taxable value" value={d.subtotal_paise} />
        {intra && (<>
          <Row label={`CGST @ ${d.gst_rate / 2}%`} value={d.cgst_paise} />
          <Row label={`SGST @ ${d.gst_rate / 2}%`} value={d.sgst_paise} />
        </>)}
        {inter && <Row label={`IGST @ ${d.gst_rate}%`} value={d.igst_paise} />}
        {d.gst_applicable && d.gst_rate === 0 && <Row label="GST @ 0%" value={0} />}
        {!d.gst_applicable && <p className="body-6 text-muted-foreground">GST not applicable: the supplier is not GST registered.</p>}
        <Row label="Total" value={d.total_paise} strong />
      </dl>

      {d.notes ? <p className="mt-6 body-6 whitespace-pre-line">{d.notes}</p> : null}
      {d.msme_line ? <p className="mt-6 border-t pt-3 caption-5 text-muted-foreground">{d.msme_line}</p> : null}
    </article>
  );
}
