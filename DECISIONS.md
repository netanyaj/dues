# Decisions

Each entry covers: the question it answers, the options we considered, what we decided, why, and what we gave up.

---

## D1. Invoice numbers are assigned on Send, not when the draft is created

**Question:** Claude creates a draft, the freelancer changes their mind, and the draft is thrown away. Does that leave a gap in the GST invoice series?

**Options**
- A. Give a number when the draft is created and never reuse it (the original spec).
- B. Give a number when the invoice is sent, inside the same database transaction.

**Decision:** B. A draft has no GST number and shows as "Draft · 12 Nov". A draft can be deleted outright, because it never existed for tax purposes. Send allocates the next number with a row lock on a per-user, per-FY counter, so two invoices sent at the same moment can't get the same number. A sent invoice that is later cancelled keeps its number and shows as cancelled. The series stays complete, with a cancelled entry rather than a gap.

**Why:** GST expects consecutive serial numbers. Under option A, every abandoned or recreated Claude draft burns a number.

**Gave up:** a draft preview has no final number. Claude's `create_invoice` reply returns a draft ID, not an invoice number.

**Also:** the tool descriptions tell Claude "To change a draft, use `update_draft_invoice`. Never cancel and recreate."

## D2. Send sets the issue date to today and keeps the payment terms

**Question:** a draft created on 1 Nov and sent on 12 Nov. What date is on the invoice?

**Decision:** Send sets `issue_date` to today (India time), works out the financial year from that date, and moves `due_date` by the same number of days so a "15 days" term stays 15 days.

**Why:** otherwise `0008` could carry an earlier date than `0007`, and a draft from 31 March sent on 2 April would be filed in the wrong financial year. An out-of-order series is a red flag in an audit.

**Gave up:** the freelancer can't backdate an invoice. That's deliberate.

## D3. Invoice numbers have a prefix of at most 3 characters

**Question:** the spec allowed a 4-character prefix and required the number to be at most 16 characters. `INV/2026-27/0007` is already 16 characters.

**Options:** a 3-character prefix with the full year (`INV/2026-27/0007`), or a 4-character prefix with a short year (`DUES/26-27/0007`).

**Decision:** a 3-character prefix (letters or digits), keeping the format from the brief. The database refuses to issue a number longer than 16 characters, with a clear error. That would only happen at the 10,000th invoice in one year.

## D4. "Overdue", "Paid" and "Payment reported" are worked out from the facts, not stored

**Question:** if a client reports payment on an overdue invoice and the freelancer rejects the report, the original spec sends the invoice back to "sent". It then looks not overdue until the next cron run. A partial payment also has no status.

**Decision:** store only:
- the invoice's stage: `draft`, `issued` or `cancelled`;
- its payments, each `reported`, `confirmed` or `rejected`.

A Postgres view (`invoice_view`) works out the label, so the app, the filters and MCP all read one definition. When several labels apply, it uses the first that's true: Cancelled → Paid → Payment reported → Overdue → Partially paid → Sent → Draft.
- Paid: confirmed amounts plus TDS cover the total.
- Overdue: a balance remains and the due date has passed (India time). It's correct the moment anyone looks.
- A rejected report is marked `rejected` (kept for the audit trail), and the label falls back to whatever is true.

**The cron still runs daily.** It logs a one-time `became_overdue` event per invoice (for the chase list and metrics). It doesn't change any stored state, so missing a run can't make any label wrong.

**Gave up:** a simple status column you can update by hand. Filtering by status goes through a view instead of an indexed column, which is fine at freelancer scale.

## D5. TDS: the freelancer decides; code only suggests

**Question:** a corporate client pays ₹32,400 against a ₹35,400 invoice. Is that a partial payment, or 10% TDS on the ₹30,000 subtotal?

**Decision:** the client's "I've paid" form records only what the client says. When the freelancer confirms, Dues checks whether the shortfall equals 1%, 2%, 5% or 10% of the pre-GST subtotal, within ₹1. If it does, the form is pre-filled with "Looks like 10% TDS (₹3,000)". The freelancer accepts or changes it. This is plain arithmetic, not AI.

**Why:** TDS is deducted on the amount before GST, and the client's word about it can't be trusted on its own.

## D6. Bank transfer first, UPI for small invoices

**Question:** who actually pays these invoices, and how?

**Answer (from the founder's view):**
- An individual or a very small business pays from a phone, by UPI or IMPS.
- A small company pays by NEFT or IMPS from its current account.
- A corporate accounts payable team pays by NEFT or RTGS in a payment run, after vendor registration (PAN, GSTIN, bank details), and deducts TDS. It never pays by UPI.

**Decision**
- On the public invoice, bank details come first.
- The UPI QR shows only when the total is ₹1,00,000 or less (the UPI per-transaction limit for person-to-person payments) and the freelancer has a UPI ID.
- The UPI ID and the amount are always shown as text with copy buttons, because some UPI apps limit pre-filled payment requests to personal UPI IDs.
- PAN is added to the profile and shown on the invoice. If a GSTIN is given, the PAN must match characters 3–12 of it.

**New pitch:** "Get paid on the rails your clients already use, at zero fees: bank transfer first, UPI for small invoices. Every invoice is GST-correct so the client's accounts team doesn't send it back, and Dues tracks payments, chasing and TDS."

**Gave up:** the "pay by UPI" headline.

**Careful in the interview:** v1 checks that a GSTIN is *structurally valid* (format, checksum, state). It can't check that the GSTIN is *active*, because that needs a GST portal API (a GSP). Say "valid", not "verified".

## D7. The public link exists only after the invoice is sent

**Question:** what stops a freelancer from sharing a draft whose amounts can still change?

**Decision:** a draft has only a private preview, visible to the logged-in freelancer. Send assigns the number, locks the amounts, creates the unguessable `public_id` and takes a snapshot of the seller and buyer details, all in one transaction. Only then do "Copy link" and WhatsApp appear. Anything a client can open is a final, numbered invoice.

**Also:** the seller's and buyer's name, address, GSTIN and state are copied onto the invoice when it's sent. If the freelancer later changes their address, past invoices don't change, as tax documents must not.

## D8. One service layer, run on the server; RLS is a second line of defence

**Question:** how do the app and MCP share the same rules, given that MCP has no logged-in session?

**Decision:** all reads and writes go through `src/lib/service/*` on the server. MCP finds the user by token, and the app finds them from the Supabase session. Either way the service layer receives a `userId` and scopes every query by it, using the service-role key on the server only. RLS is on for every table, so even the public anon key in a browser can only ever reach its own rows. The database functions that take a user ID can only be called with the service role: `anon` and `authenticated` are refused.

**Gave up:** relying on RLS alone for the app. That's not possible with token-based MCP anyway, and one code path is easier to test.

## D9. Money is integer paise; quantities are exact to 3 decimals

All amounts are stored as `bigint` paise. Rupee inputs are parsed from their text form, never multiplied as floats, and more than 2 decimal places are refused. Quantities allow up to 3 decimals (1.5 hours, 0.25 days). Line amount = round(qty × rate), half up, computed with integers. Tax is computed once, on the subtotal.

## D10. UI: Tailwind with a few shadcn/ui components

shadcn copies components into the repo instead of adding a heavy dependency, so it fits "no component-library rabbit holes". We add only the components we use.

---

## Open questions
- **Why Dues and not Zoho Invoice?** Zoho Invoice is free, GST-compliant and sends reminders. With bank transfer first, "zero fees" is no longer a differentiator. To be answered before Step 2.
