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
| T22 | **MSME (D20):** with Udyam number + micro/small, the line appears on the invoice and client page; medium shows nothing; 50-day terms show the warning. | ✅ prod: MSME line on a demo client page; 45-day warning shown at 50-day terms (local against the shared database, same build) |
| T23 | **Token hash (D25):** the link is shown once after Regenerate; Settings then shows only the last 4 characters; the database holds only the hash. | ✅ prod (founder); now token + header (D28) |
| T24 | **Header auth (D28):** no header → 401 with the fix; wrong token → 401; old `/api/mcp/<token>` → 410 with reconnect instructions; regenerate cuts off the old token. | ✅ prod (MCP script, 21 checks, 00:14 IST) |
| T25 | **Settings (D29):** each of the 8 sections saves on its own; a new account can save its business name before adding bank details; changing state with a GSTIN from another state is blocked. | ◐ local |
| T26 | **Onboarding (FLOWS 1):** sign-up → steps 1–4 → "Go to your dashboard". | ✅ local, brand-new account: found and fixed step 3 demanding bank details (D48); token + copy rows shown; dashboard "No invoices yet". Account deleted after |
| T27 | **Client page loop (FLOWS 6):** after a reject, the client page says the payment wasn't found. | ✅ prod: "Payment of ₹10,000.00 not found yet. Check the reference, or contact …", with Notify as paid still offered |
| T28 | **Link previews:** pasting a client link in WhatsApp shows "Invoice {number} from {business}" and the balance; the page stays noindex. | ◐ OG image renders ₹ on local and prod; WhatsApp paste not tried |
| T29 | **Redesign regressions (known gap):** keyboard-only pass (skip link, sidebar, table rows, dialogs), focus ring visible, text contrast ≥ 4.5:1. | ◐ local: contrast checked (muted text 6:1 on white, 5.9:1 on canvas; status colours ≥ 5.6:1), focus ring is a 2 px ink outline; a full keyboard-only pass is still to do |
| T30 | **MCP discovery (D32):** `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` return a JSON 404 (never the login page); OPTIONS `/api/mcp` returns 204 with the MCP headers allowed; an unknown page returns 404; the icons are public; the 401 has no `WWW-Authenticate`. | ✅ prod 02:50 IST (MCP script, 26 checks; curl: JSON 404s, 204 preflight, unknown page 404, icons 200, 401 without `WWW-Authenticate`; demo-token `initialize` 200 with name and icon) |
| T31 | **Fresh claude.ai connector:** add the custom connector with URL `/api/mcp` and the `Authorization: Bearer` header; it connects, lists tools and prompts, shows the Dues icon, and creates a draft. | ⬜ needs the founder's Claude, after deploy |
| T32 | **Brand (D33):** pink only on brand, main buttons and highlights; overdue amber, errors red, paid green, needs-review neutral. Contrast pairs as listed in D33. | ✅ local (dashboard, landing, client page) |
| T33 | **Invoice header (D34):** draft shows Send + More; issued shows Copy link + WhatsApp + More; More opens Record payment, Extend, Edit notes and Cancel dialogs, keyboard included. | ✅ local (menu and dialogs opened, nothing saved) |
| T34 | **Bank at Send (D35):** on an account without bank details, Send opens "Add your bank account to send", saves and sends; the service refuses without bank details. | ◐ server rule tested (`tests/db/review.test.ts`); the dialog wasn't submitted, to avoid issuing a real invoice on the founder's account |
| T35 | **Client dropdown (D36):** search filters; "+ New client" opens the side panel pre-filled with the search; save returns it selected. | ◐ local: search and panel checked; save not submitted |
| T36 | **Client views (D37):** a phone browser counts, a WhatsApp preview and the logged-in owner don't; the count shows on the invoice and chase list and in `list_invoices`. | ✅ prod (MCP script) |
| T37 | **MCP prompts (D38):** `prompts/list` has the three prompts; `invoice_client` fills in its arguments. | ✅ prod (MCP script; `initialize` declares prompts, list and get per spec). ✗ not listed in claude.ai's + menu: known claude.ai gap (D46). Copyable prompts added in Settings |
| T38 | **Aging bar (D39):** buckets sum open balances; day 45 is in 31–45; clicking a bucket filters the list. | ✅ unit + local |
| T39 | **Proof upload (D40):** a renamed non-image is refused; a real image is stored privately; the owner gets a signed link; the public URL is refused. | ✅ prod (MCP script) |
| T40 | **Analytics:** Vercel Analytics and Speed Insights load; `/i/<id>` paths are reported as `/i/[id]`. | ⬜ deployed; scripts load client-side, so confirm data in Vercel → Analytics (it may need enabling there) |
| T41 | **Header forms (D41):** a bare token, `Bearer <token>`, the pasted full `Authorization: …` line and `x-api-key` all connect; `Accept: application/json` alone works. | ✅ prod (MCP script, 27 checks; demo token connects as `Bearer <token>`, bare token and full pasted line, with JSON-only Accept) |
| T42 | **Palette (D42):** neutral white canvas, ink buttons, orchid only on logo, links and highlights. | ✅ local (dashboard, client page) |
| T43 | **Client page (D43):** with bank details and UPI, "Pay with UPI" and "Notify as paid" are visible without scrolling at 375 px. Long reminder links wrap inside their box. An overflow scan of 18 screens at 375 and 9 at 1280 found no element past its container after the fixes. | ✅ local |
| T44 | **Landing motion (D45, replaced by D51):** glows drift in the hero, tagline band and final call to action; sections reveal once; reduced motion shows everything still; no sideways scroll at 375 px. | ✅ local (1280 and 375; all 6 sections revealed on scroll) |
| T45 | **Share (D49):** issued invoice header shows only Share + More; the panel has the editable message, WhatsApp to the saved phone, Email with subject "Invoice {number} from {business}", Copy message, Copy link; edits carry into the links; reminders open the same panel with Claude's text; a `shared` event is logged per use. No sideways scroll at 375 or 1280. | ✅ local (demo invoice). ⬜ native share sheet on a real phone (the in-app browser has no Web Share, so it correctly fell back to the panel) |
| T46 | **Landing (D51), Lighthouse mobile, production:** before 77 / 84 / 100 / 100 (perf / a11y / best practices / SEO; TBT 710 ms, speed index 4.9 s). After 92–95 / 100 / 100 / 100 over two runs (TBT 160–220 ms, speed index 1.5–2.3 s, CLS 0). Full-page screenshots at 390 and 1440 (`docs/screenshots/landing-390.png`, `landing-1440.png`): all 9 sections have content, none at opacity 0, no sideways scroll. | ✅ prod |
