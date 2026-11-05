# Testing

## Automated

| ID | What | How to run | Status |
|----|------|-----------|--------|
| A1 | Unit tests: money parsing, rounding, tax split (odd paisa → CGST), Claude's number check, TDS suggestion, GSTIN checksum and state, IST financial year, number format, derived status, locking/allowed actions, UPI link, phone normalising | `npm test` | ✅ 35 passing |
| A2 | Database tests: 20 concurrent sends → 20 distinct consecutive numbers; a double send is refused and doesn't burn a number; sent invoices are locked; flagged drafts can't be sent; RLS isolates users; browser roles can't call server functions or write tables; sign-up trigger creates the profile and token; the view derives overdue and paid | `npm run test:db` | ✅ 7 passing |
| A3 | MCP integration script: calls every tool against a local server and checks the results | `npm run test:mcp` | ⬜ Step 4 |
| A4 | No-AI check: fails if any dependency, file or env var references a model provider | `npm run check:no-ai` | ⬜ Step 6 |

## Manual checklist (run on production with a real Claude)

Tick ✅ with the date when it passes on production. ◐ = checked locally only.

| ID | Check | Status |
|----|-------|--------|
| T1 | A fresh Claude connects with the link (Customize → Connectors → Add custom connector → No sign in). | ⬜ |
| T2 | Create a client and an invoice from Claude; it appears on the dashboard within ~10 s with "Created by Claude". | ⬜ |
| T3 | A wrong `expected_total` triggers needs_review: yellow banner, Send blocked (app and MCP) until "Confirm totals". | ◐ service layer |
| T4 | Edit the draft in the app; totals and tax split update live. | ⬜ |
| T5 | Send it: a number is assigned (`INV/2026-27/000N`), the issue date becomes today, and items are locked. | ◐ DB test |
| T6 | Open the public link in incognito on a 375 px screen: GST invoice fields, bank details first, UPI QR (≤ ₹1 lakh), trust note, print. | ⬜ |
| T7 | Report a payment as the client (UTR, amount); the invoice shows "· payment reported" and leaves the chase list for 2 working days. | ⬜ |
| T8 | Confirm it on the dashboard; a TDS-shaped shortfall is pre-filled; the invoice becomes Paid. | ◐ local |
| T9 | Overdue via the cron (trigger `/api/cron/daily` by hand): a `became_overdue` event is logged once. | ⬜ |
| T10 | The reminder link opens WhatsApp with the text filled in. | ⬜ |
| T11 | Regenerating the token breaks the old link (the old URL returns a clear error). | ⬜ |
| T12 | Another user's token can't see this user's data. | ◐ DB test (RLS) |
| T13 | **New user:** sign up in incognito → complete setup → connect Claude with the new link → create, send, report and confirm a payment. This user can't see the demo accounts' data, and vice versa. Regenerating the link on a demo account is blocked. | ⬜ |
| T14 | **Trust (D17):** the public page shows "Dues does not verify…", "structurally valid" GSTIN with the government search link, "Not verified", the new-account warning (< 30 days), "Bank details updated on…" (if changed within 7 days of sending), and "Report this invoice" logs a report. | ⬜ |
| T15 | **Extension (D18):** extend a sent invoice's due date with a reason; the client page shows "Due date extended from … to …"; `original_due_date` is unchanged. Moving it earlier is refused. | ⬜ |
| T16 | **Reference checks (D16):** a reused UTR and an unusual-format UTR are flagged to the freelancer, not blocked for the client. | ⬜ |
| T17 | Walk the main loop at phone width and fix anything awkward. | ⬜ |
