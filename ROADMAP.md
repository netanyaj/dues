# Dues: roadmap

*v1 is what's live. This file is what comes after, and what was left out of v1 on purpose. Reasons point to [DECISIONS.md](DECISIONS.md).*

## Pricing
- **v1:** free, with a cap of 50 invoices per account (D12).
- **Pro (planned): ₹299 a month.** A hypothesis to test, not a price on sale. Pro is priced against late payment, not against a free template: automatic confirmation through your own gateway, scheduled reminders, and a verified business badge.
- **How we'll test it:** an Upgrade button at invoice 50, plus 10 interviews. Drop Pro if under 10% of capped users click.

## v2 (3–6 months)
- **Get paid faster:**
  - connect your own Razorpay or Cashfree for automatic payment confirmation;
  - email sending and scheduled reminders;
  - "Viewed" and "Payment reported" notifications by email or push.
- **Trust:** bank and GSTIN verification at ₹1–5 per check, sold as a "Verified business" badge (D17); a review queue for fraud reports.
- **Invoices:** credit and debit notes; recurring invoices; foreign currency; advance invoices and late-fee clauses; import past invoices with their own numbers.
- **Tax:** GSTR-1 and TDS exports; Form 16A tracking per client per quarter (D26).
- **Claude:** OAuth for MCP (one click, no token to copy); `get_recent_items` and line-item autosuggest, so "same as last month" works (D26, D47).
- **Account:** teammates; logo upload; a "Reset demo data" button (D13, D47); Turnstile on sign-up.
- **Escalation help:** a guide to MSME Samadhaan and the GST portal's taxpayer messages (D26).

## v3 (years 2–3)
- Automatic payment matching through Account Aggregator.
- Expenses and GST input credit.
- Cash-flow forecasts and a slow-payer score.
- Invoice financing against overdue receivables.
- Tally, Zoho Books and QuickBooks sync.
- An agency workspace.

## Deliberately not in v1
| Left out | Why |
|---|---|
| AI inside the app | The brief: Claude drafts, code checks, a person confirms. Plain code gives the same invoice for the same input (D11). |
| A payment gateway | Money goes straight from the client to the freelancer; Dues never holds it. Gateways come as the freelancer's own account in v2. |
| Sending email | Reminders come from the freelancer's own WhatsApp or email, so clients see a person, not a system (D19). |
| Editing or deleting sent invoices | GST numbering has no gaps, and the client may already have paid against it. Cancel and reissue instead (D1, D18). |
| Credit notes | The right fix for a wrong amount, but cancel and reissue covers v1 (rule 5). |
| GSTIN and bank verification | Needs a GSP and paid checks; v1 says "not verified" plainly instead (D17). |
| OAuth for MCP | A header token was the smallest secure option that works today (D28). |
| Google sign-in | One login flow for v1 (D12). |
| `get_recent_items`, autosuggest, Reset demo data | Cut at the v1 feature freeze; re-running the seed covers demo resets (D47). |
