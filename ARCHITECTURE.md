# Architecture

*Draft. The diagram, the cost per customer and the full security notes will be added in M6. This file currently holds the sections decided so far.*

## Trust and fraud (D16, D17)

Dues lets anyone create a professional-looking invoice page, so it could be used for invoice-redirection fraud: an invoice in a real business's name carrying the scammer's bank details. v1's rule is that **the client's page claims nothing Dues can't back up.**
- It never says a business or bank account is "verified".
- It says plainly that Dues doesn't verify them.
- It marks the GSTIN as "structurally valid" (format, checksum, state), with a link to the government's public GST search.
- It warns when the account is less than 30 days old.
- It shows "Bank details updated on {date}" when the bank details changed within 7 days of sending, because redirection scams usually involve a last-minute bank change. The page shows the bank details frozen when the invoice was sent, so a later change can't silently alter an invoice that's already out.

A "Report this invoice" link writes to `abuse_reports` and logs an event. Nothing happens automatically, so the link can't be used to take down a legitimate freelancer.

On the payment side, a client's "I've paid" never changes whether an invoice is overdue. It only pauses chasing for 2 working days. Reused or oddly formatted transaction references are flagged to the freelancer rather than blocked, because real payers often paste the wrong ID.

Real verification (bank "penny drop" name match, GSTIN active status) is v2. It needs a provider whose live keys require business verification (days), and test-mode results would make any badge false. v1 ships the `verifications` table and "Not verified" labels, so enabling it later is a provider sign-up, not a rewrite.
