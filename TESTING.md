# Testing

## Automated

| ID | What | How to run | Status |
|----|------|-----------|--------|
| A1 | Unit tests: money parsing, rounding, tax split (odd paisa → CGST), Claude's number check, TDS suggestion, GSTIN checksum and state, IST financial year, number format, derived status, locking/allowed actions, UPI link, phone normalising | `npm test` | ✅ 42 passing |
| A2 | Database tests: 20 concurrent sends → 20 distinct consecutive numbers; a double send is refused and doesn't burn a number; sent invoices are locked; flagged drafts can't be sent; RLS isolates users; browser roles can't call server functions or write tables; sign-up trigger creates the profile and token; the view derives overdue and paid | `npm run test:db` | ✅ 10 passing |
| A3 | MCP integration script: calls every tool over HTTP and checks results: inline client, ₹35,400 tax split, duplicate retry, wrong total → review, fix clears it, ready-to-send doesn't number, fill-blanks-only client update, Claude payment stays pending, overpayment refused, reminder wa.me link, sent invoice locked, cross-user isolation, no tool can finalise, regenerate kills the old link | `npm run test:mcp` (with `npm run dev`; or `BASE_URL=…`) | ✅ 20 checks on production (5 Nov, 20:59) |
| A4 | No-AI check: fails if any dependency (699 incl. transitive), source file or app env var references a model provider. Runs before every `npm run build`, so Vercel can't deploy without it | `npm run check:no-ai` | ✅ passes; verified it fails on `import OpenAI` and `OPENAI_API_KEY` |
| A5 | Guards: MCP tools can't import send/confirm functions; MCP route/profile code never logs; cron refuses without the secret and is idempotent; `invoice_view` exposes every `invoices` column | `npm test`, `npm run test:db` | ✅ |

## Production (https://usedues.vercel.app)

- Smoke (5 Nov): `/` 200, `/dashboard` → `/login`, bad MCP link → 404 with a clear message, cron without secret → 401, `/i/*` sends `noindex`.
- Seeded: sandeep@, rosh@, maneeshwar@ and spare@dues.test (9 invoices each, every state). Passwords and links are in the submission form only.
- Seeded public page checked: bank details, UPI QR and deep link, trust note, structurally-valid GSTIN, MSME line, "I've paid".

## Manual checklist (run on production with a real Claude)

Tick ✅ with the date when it passes on production. ◐ = checked locally only.

| ID | Check | Status |
|----|-------|--------|
| T1 | A fresh Claude connects (Customize → Connectors → Add custom connector → URL `/api/mcp` → No sign in → Request headers `Authorization: Bearer <token>`). | ✅ prod (founder, claude.ai). Re-run after D28 with the header: ⬜ |
| T2 | Create a client and an invoice from Claude; it appears on the dashboard within ~10 s with "Created by Claude". | ✅ prod (founder) |
| T3 | A wrong `expected_total` triggers needs_review: yellow banner, Send blocked (app and MCP) until "Confirm totals". | ✅ prod (founder); confirm-then-save re-flag bug fixed (D30, tests/db/review.test.ts) |
| T4 | Edit the draft in the app; totals and tax split update live. | ✅ prod (founder) |
| T5 | Send it: a number is assigned (`INV/2026-27/000N`), the issue date becomes today, and items are locked. | ✅ prod (founder) |
| T6 | Open the public link in incognito on a 375 px screen: GST invoice fields, bank details first, UPI QR (≤ ₹1 lakh), trust note, print. | ✅ prod (founder, phone) |
| T7 | Report a payment as the client (UTR, amount); the invoice shows "· payment reported" and leaves the chase list for 2 working days. | ✅ prod (founder, phone) |
| T8 | Confirm it on the dashboard; a TDS-shaped shortfall is pre-filled; the invoice becomes Paid. | ✅ prod (founder) |
| T9 | Overdue via the cron (trigger `/api/cron/daily` by hand): a `became_overdue` event is logged once. | ✅ prod (founder ran the cron from Vercel) |
| T10 | The reminder link opens WhatsApp with the text filled in. | ◐ by design an overdue invoice can't be created on a new account (Send dates it today, D2); test on a demo account, which has two overdue invoices |
| T11 | Regenerating the token cuts off the old one (401 with a clear message). | ✅ prod (MCP script): old link → 404 "isn't valid", new link works |
| T12 | Another user's token can't see this user's data. | ✅ prod (MCP script): other token sees 0 invoices, can't touch them |
| T13 | **New user:** sign up in incognito → complete setup → connect Claude with the new link → create, send, report and confirm a payment. This user can't see the demo accounts' data, and vice versa. Regenerating the link on a demo account is blocked. | ✅ prod (founder: sign-up, setup, isolation) |
| T14 | **Trust (D17):** the public page shows "Dues does not verify…", "structurally valid" GSTIN with the government search link, "Not verified", the new-account warning (< 30 days), "Bank details updated on…" (if changed within 7 days of sending), and "Report this invoice" logs a report. | ✅ prod (founder, phone); wording kept verbatim in the redesign |
| T15 | **Extension (D18):** extend a sent invoice's due date with a reason; the client page shows "Due date extended from … to …"; `original_due_date` is unchanged. Moving it earlier is refused. | ✅ prod (founder) |
| T16 | **Reference checks (D16):** a reused UTR and an unusual-format UTR are flagged to the freelancer, not blocked for the client. | ◐ local: PhonePe-style 23-char ID accepted and flagged |
| T17 | Walk the main loop at phone width and fix anything awkward. | ✅ local after redesign: no sideways scroll at 375 px on every app, client, auth and landing screen (D27) |
| T18 | **Claude retries (D23):** the same `create_invoice` twice returns the same draft id; `allow_duplicate: true` creates a second. | ✅ prod (MCP script) |
| T19 | **Claude can't finalise (D24):** `mark_ready_to_send` doesn't number or lock; `record_payment` from Claude lands in "Needs your confirmation"; `upsert_client` can't overwrite a saved phone. | ✅ prod (MCP script) |
| T20 | **Reminder stages (D19):** an invoice 8 days overdue suggests "Stage 2 · firm"; the saved reminder shows its stage. | ◐ same as T10: use a demo account |
| T21 | **CSV export (D22):** download for a date range; columns and GST split match the invoices; it opens in a spreadsheet. | ✅ prod (founder) |
| T22 | **MSME (D20):** with Udyam number + micro/small, the line appears on the invoice and client page; medium shows nothing; 50-day terms show the warning. | ◐ prod: MSME line on the public page; check the 45-day warning in the form |
| T23 | **Token hash (D25):** the link is shown once after Regenerate; Settings then shows only the last 4 characters; the database holds only the hash. | ✅ prod (founder); now token + header (D28) |
| T24 | **Header auth (D28):** no header → 401 with the fix; wrong token → 401; old `/api/mcp/<token>` → 410 with reconnect instructions; regenerate cuts off the old token. | ✅ local (MCP script, 21 checks); prod ⬜ |
| T25 | **Settings (D29):** each of the 8 sections saves on its own; a new account can save its business name before adding bank details; changing state with a GSTIN from another state is blocked. | ◐ local |
| T26 | **Onboarding (FLOWS 1):** sign-up → steps 1–4 → "Go to your dashboard". | ⬜ |
| T27 | **Client page loop (FLOWS 6):** after a reject, the client page says the payment wasn't found. | ⬜ |
| T28 | **Link previews:** pasting a client link in WhatsApp shows "Invoice {number} from {business}" and the balance; the page stays noindex. | ✅ local (OG image renders ₹); prod ⬜ |
| T29 | **Redesign regressions:** keyboard-only pass (skip link, sidebar, table rows, dialogs), focus ring visible, text contrast ≥ 4.5:1. | ◐ local: contrast checked (muted text 6:1 on white, 5.9:1 on canvas; status colours ≥ 5.6:1), focus ring is a 2 px ink outline; a full keyboard-only pass is still to do |

