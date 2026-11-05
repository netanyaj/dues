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
    <div className="min-w-0">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <p className="mt-1 font-medium">{p.name}</p>
      {p.address ? <p className="text-sm whitespace-pre-line text-muted-foreground">{p.address}</p> : null}
      <p className="text-sm text-muted-foreground">{stateName(p.state_code)}{p.state_code ? ` (${p.state_code})` : ""}</p>
      <p className="text-sm">{p.gstin ? <>GSTIN <span className="font-mono">{p.gstin}</span></> : <span className="text-muted-foreground">Unregistered (no GSTIN)</span>}</p>
      {p.pan ? <p className="text-sm">PAN <span className="font-mono">{p.pan}</span></p> : null}
    </div>
  );
}

export function InvoiceDocument({ d }: { d: DocData }) {
  const intra = d.gst_applicable && d.igst_paise === 0 && d.gst_rate > 0;
  const inter = d.gst_applicable && d.igst_paise > 0;
  return (
    <article className="relative rounded-lg border bg-white p-4 sm:p-8 print:border-0 print:p-0" aria-label="Invoice">
      {d.draft && (
        <p className="mb-4 rounded-md border border-dashed border-zinc-400 px-3 py-2 text-center text-sm font-medium text-zinc-600">
          DRAFT PREVIEW: not a valid tax invoice. It gets a number when sent.
        </p>
      )}
      {d.cancelled && (
        <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-800">
          CANCELLED: this invoice is void and should not be paid.
        </p>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{d.gst_applicable ? "Tax Invoice" : "Invoice"}</h1>
          <p className="mt-0.5 font-mono text-sm">{d.number ?? "Draft (no number yet)"}</p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-sm">
          <dt className="text-muted-foreground">Invoice date</dt><dd>{formatDate(d.issue_date)}</dd>
          <dt className="text-muted-foreground">Due date</dt><dd>{formatDate(d.due_date)}</dd>
          {d.fy ? <><dt className="text-muted-foreground">Financial year</dt><dd>{fyLabel(d.fy)}</dd></> : null}
          <dt className="text-muted-foreground">Place of supply</dt><dd>{stateName(d.buyer.state_code)} ({d.buyer.state_code})</dd>
        </dl>
      </header>
      {d.original_due_date && d.original_due_date !== d.due_date ? (
        <p className="mt-3 text-sm text-blue-900">Due date extended from {formatDate(d.original_due_date)} to {formatDate(d.due_date)}.</p>
      ) : null}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Party title="From (supplier)" p={d.seller} />
        <Party title="Bill to" p={d.buyer} />
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="border-b text-left text-muted-foreground">
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
                <td className="py-2 pr-2 font-mono text-xs">{it.sac}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{qty(it.qty)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatINR(it.rate_paise)}</td>
                <td className="py-2 text-right tabular-nums">{formatINR(it.amount_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-4 ml-auto flex max-w-xs flex-col gap-1 text-sm">
        <div className="flex justify-between"><dt>Taxable value</dt><dd className="tabular-nums">{formatINR(d.subtotal_paise)}</dd></div>
        {intra && (<>
          <div className="flex justify-between"><dt>CGST @ {d.gst_rate / 2}%</dt><dd className="tabular-nums">{formatINR(d.cgst_paise)}</dd></div>
          <div className="flex justify-between"><dt>SGST @ {d.gst_rate / 2}%</dt><dd className="tabular-nums">{formatINR(d.sgst_paise)}</dd></div>
        </>)}
        {inter && <div className="flex justify-between"><dt>IGST @ {d.gst_rate}%</dt><dd className="tabular-nums">{formatINR(d.igst_paise)}</dd></div>}
        {d.gst_applicable && d.gst_rate === 0 && <div className="flex justify-between"><dt>GST @ 0%</dt><dd>{formatINR(0)}</dd></div>}
        {!d.gst_applicable && <p className="text-muted-foreground">GST not applicable: supplier is not GST-registered.</p>}
        <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatINR(d.total_paise)}</dd></div>
      </dl>

      {d.notes ? <p className="mt-6 text-sm whitespace-pre-line">{d.notes}</p> : null}
      {d.msme_line ? <p className="mt-6 border-t pt-3 text-xs text-muted-foreground">{d.msme_line}</p> : null}
    </article>
  );
}
