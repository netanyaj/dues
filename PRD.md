# Dues: product requirements (v1)

*This file shows what we're building now. [DECISIONS.md](DECISIONS.md) records why (D-numbers). Updated 5 Nov 2026, 20:15 IST.*

## 1. Problem and evidence
Indian freelancers and small agencies invoice from Word or Excel templates and chase payments on WhatsApp. They lose:
- **time:** each invoice is retyped, and the tax split is worked out by hand;
- **money:** invoices with a wrong GSTIN, tax split or numbering are sent back by clients' accounts teams, which delays payment;
- **track of what's owed:** they can't tell who is overdue, or how much TDS a client has deducted.

**Evidence is thin.** One r/smallbusiness thread (mostly US) says chasing, not creating, is the pain, and that a forced setup order loses people (D19, D21). Everything else is the founder's reasoning (D6, D11). **Gap:** no Indian freelancer interviews or data. Before v2: 10 interviews, plus counts of invoices sent back and days to payment.

## 2. Users
| Persona | Situation | What they need from Dues |
|---|---|---|
| **Solo designer, GST-registered** (Karnataka) | Clients in the same state and in others | The CGST+SGST or IGST split done for them; numbers in order; a link a client can pay from |
| **Unregistered developer** (no GSTIN) | Small clients, UPI | A clean invoice that says "GST not applicable"; UPI QR |
| **Small agency with corporate clients** | AP teams pay by NEFT in payment runs and deduct 10% TDS (D6) | Bank details shown first; PAN on the invoice; TDS tracked so "₹32,400 of ₹35,400" counts as paid |

## 3. Goals and non-goals (v1)
**Goals:**
- A request in Claude creates a real, GST-correct invoice in Dues.
- The freelancer can see it, check it, edit it and send it.
- The client opens a link and pays.
- The freelancer confirms the payment.
- Dues tracks what's outstanding and overdue with no chat open.

**Non-goals:**
- AI inside the app (Claude does all writing and thinking).
- A payment gateway or automatic payment confirmation.
- Sending email.
- Recurring invoices, multiple currencies, credit notes, teams.
- Checking that a GSTIN or bank account is genuine (D17, v2).

## 4. Main loop: user stories
| # | Story | Acceptance criteria | Test |
|---|---|---|---|
| S1 | As a freelancer, I connect Claude to Dues. | Settings → Claude connection shows the server URL, my token once, and the steps; Claude lists the Dues tools. | T1 |
| S2 | I ask Claude to invoice a client (new or existing). | A draft appears within ~10 s, badged "Created by Claude"; a new client is created in the same step (D21). A retry doesn't create a duplicate (D23). If Claude's total is off by more than ₹1, it's flagged and can't be sent until I confirm. Claude can mark it ready but can't send it (D24). | T2, T3, T18 |
| S3 | I check and edit the draft. | Live totals and tax split; drafts have no number (D1). | T4 |
| S4 | I send it. | It gets the next number, and the issue date becomes today (D2); amounts lock; a public link appears (D7). | T5 |
| S5 | My client opens the link on their phone and pays. | GST fields, bank details first, UPI QR only if the total is ₹1 lakh or less (D6), the trust note (D17), "I've paid" with a UTR. | T6, T7, T14 |
| S6 | I confirm the payment. | TDS-shaped shortfalls are pre-filled (D5); the invoice becomes Paid; reused or odd UTRs are flagged (D16). Payments Claude records also wait for my confirmation (D24). | T8, T16, T19 |
| S7 | I see who to chase and send the right reminder. | Overdue is worked out live (D4); a client report pauses chasing for 2 working days (D16); the next stage (friendly/firm/final at +3/+7/+14 days) is suggested; Claude writes it; one tap opens WhatsApp with the text filled in (D19). | T9, T10, T20 |
| S9 | I export my invoices for my accountant. | CSV for a date range with GST split, TDS and amount received (D22). | T21 |
| S8 | A new user signs up and does all of the above. | No email confirmation (D12); their data is isolated. | T12, T13 |

## 5. Functional requirements
- **Numbering:** `{prefix}/{FY}/{seq:4}`, e.g. `INV/2026-27/0007`, at most 16 characters, prefix up to 3 characters (D3). The financial year starts 1 April (IST). Numbers are allocated on Send, inside a database transaction; they're never reused and never skipped (D1).
- **GST:** amount = round(qty × rate); tax is computed on the subtotal. Same state: CGST = SGST, with an odd paisa going to CGST. Different state: IGST. No GSTIN: no tax, and the invoice says "GST not applicable". Rates are 0/5/12/18/28%. The GSTIN is checked for format, checksum and state ("structurally valid", D6). PAN = GSTIN characters 3–12.
- **Claude's number check:** an `expected_total` more than ₹1 from Dues' total sets `needs_review`, blocking Send until "Confirm totals".
- **TDS:** recorded per payment; confirmed amount + TDS ≥ total means paid. The suggestion matches 1%, 2% or 10% of the subtotal (D5).
- **Statuses (derived, D4, D16):** Cancelled → Paid → Overdue → Partially paid → Sent → Draft, plus a "payment reported" flag. Rejected reports are kept.
- **Locking:** drafts are fully editable and can be deleted. Once sent, items, client and amounts are locked; the notes and due date stay editable. The due date can only be extended, with a reason; `original_due_date` is kept (D18). To change amounts: cancel and reissue.
- **Client page:** unguessable link, `noindex`, seller and buyer details frozen at Send, place of supply, SAC per line, tax split, bank details (copy buttons), UPI QR and deep link if the total is ₹1 lakh or less, "I've paid", print/PDF, the trust note, report link (D17).
- **MCP tools (9), D24:** `get_business_profile`, `upsert_client` (fills blanks only), `create_invoice` (creates the client inline, D21; duplicate check with `allow_duplicate`, D23), `update_draft_invoice`, `list_invoices`, `get_receivables_summary`, `mark_ready_to_send` (no number, no lock), `record_payment` (pending only), `save_reminder` (with stage). Read-only tools carry `readOnlyHint`. Errors are plain language that Claude can act on. Claude never sends invoices or confirms payments.
- **MCP auth (D25):** per-user token in the URL, stored as a SHA-256 hash, shown once, regenerate to replace.
- **Reminders (D19):** stage 1/2/3, suggested at +3/+7/+14 days overdue; WhatsApp or email link; marked when opened.
- **MSME (D20):** optional Udyam number and category; a factual MSMED/43B(h) line for micro and small; a warning when terms exceed 45 days.
- **Export (D22):** CSV for a date range; GSTR-1 format is v2.
- **Limits:** 50 invoices per account (D12). Demo accounts can't regenerate their link (D13).

## 6. UX requirements
- **Design direction (D27; accent D33):**
  - Calm money tool: a dark sidebar, a grey canvas, white panels.
  - One brand accent, hot pink (`#C2185B` for text and buttons, `#E0306E` for the logo and large type), on warm white `#FBF8F6` with ink `#17151C` (D33). Status: amber = overdue or caution, red = errors only, green = paid, neutral = needs review.
  - Copy buttons are icon-only, with a label for screen readers and a hover tooltip. Button and banner text stays short ("I've paid", "Notify as paid", "Payment reported").
  - Geist with tabular numerals on every amount. Phosphor icons. The tally-mark logo.
- **Each screen answers one question first:**
  - Dashboard: "who owes me, and what needs me today?"
  - Invoice: "what state is this in, and what's my next action?"
  - Client page: "how much, by when, and how do I pay?" On desktop the invoice sits on the left and the paying column on the right.
- **Dashboard (D39):** one chart, "Who owes you, by age" (0–15, 16–30, 31–45, 45+ days) with a 45-day MSME marker; each bucket filters the list.
- **Invoice page (D34):** one main action per state; the rest under More (⋯); a summary bar with amount, due date and client views (D37).
- **Settings (D29):** eight left-nav sections, each saved on its own. First run is a 4-step setup ending at Claude connection.
- No screen scrolls sideways at 375 px (checked on every screen). The client page is mobile-first.
- Indian formats: ₹1,00,000; dates like "12 Nov 2026"; FY shown as 2026–27.
- One main action per screen.
- Every list has an empty state that says what to do next.
- Errors appear next to the field, in plain words.
- Loading and saved states on every action; a confirmation before Send, Cancel and Reject.
- Status uses a colour and a word.
- Labelled inputs and keyboard navigation.
- Claude's changes appear within seconds.

## 7. Success metrics (detail in METRICS.md)
- **Activation:** first invoice created through Claude within 24 hours of sign-up.
- **% paid by the original due date (D18).**
- **Median days from Send to Paid.**
- Supporting: % of invoices extended; % flagged for review.

## 8. Milestones (IST)
| | Milestone | Target | Status |
|---|---|---|---|
| M1 | Schema and domain logic | Thu 17:45 | ✅ 17:47 |
| M2 | Auth, onboarding, settings, dashboard | Thu 19:00 | ✅ 18:48 |
| M3 | Invoices, client page, payments (+ client pages, history, D16–D18) | Thu 21:30 | ✅ 20:00 |
| M3b | Research and safety changes: inline client, duplicate check, Claude-safe actions, token hash, reminder stages, MSME, CSV (D19–D25) | Thu 22:30 | ✅ 20:16 |
| M4 | MCP tools, cron, integration script, seed, no-AI check | Fri 00:30 | ✅ 20:16 |
| M5 | Deploy and production test (checkpoint, moved from 01:00 for D19–D25) | Fri ~01:45 | ✅ deployed 20:59; founder's real-Claude walkthrough passed (bugs fixed: D30 confirm-totals, mobile dashboard) |
| M5b | Redesign, Settings rebuild, header-only MCP auth, FLOWS.md (D27–D30) | Fri 02:30 | ✅ 00:30 |
| M5c | Live-site fixes: MCP discovery bug (D32), hot-pink brand (D33), invoice header (D34), bank at Send (D35), client dropdown (D36), views (D37), MCP prompts (D38), aging bar (D39), proof upload (D40) | Fri 03:45 | ✅ deployed 02:50; 26 MCP checks pass on production |
| M6 | Docs | Fri 10:00 (submit by 12:00, hard limit 14:00) | ◐ README, ARCHITECTURE, METRICS, FLOWS written; final pass pending |

**Must-ship:** everything in §4–§5, including the chase list, reminders with stages (D19), CSV export (D22) and the cron.
**If ahead, in order:** `get_recent_items` and line-item autosuggest (D26), "Reset demo data" (D13). Already built: client pages, event timeline. Not planned: Google sign-in (the brief and D12 say one login flow).
**If behind, cut in order:** reminders → timeline UI (keep the events table) → partial payments. Never cut the number checks, locking or the client page.

## 9. Risks and open questions
- **Zoho Invoice is free and strong (D11).** Our answer: our users are leaving Word and WhatsApp, not Zoho. *Open:* who pays ₹299 a month to replace a free Word template?
- **UPI limits:** person-to-person payments are capped at ₹1 lakh per transaction, and some apps limit pre-filled amounts to personal UPI IDs (D6). Handled by bank details first and the UPI details shown as text.
- **GSTIN status can't be checked:** without a GSP we can't tell whether a GSTIN is active. We say "structurally valid", never "verified" (D6, D17).
- **Invoice-redirection fraud:** someone could create a fake account in a real business's name. The page makes no claims, warns about new accounts, flags recent bank changes and has a report link; real verification is v2 (D17).
- **Fake "I've paid" reports:** handled by the pause-and-return rule and UTR checks; v1 can't prove a payment (D16).
- **Bearer token (D25, D28):**
  - Anyone holding the token can use the account until it's regenerated. It's stored hashed, sent only in the Authorization header (never in a URL or log), shown once, and Regenerate cuts it off at once.
  - claude.ai's Request headers field is new and may be missing on some accounts; Settings points those users to Claude Code.
  - OAuth with consent and expiry is v2.
- **Prompt injection through Claude (D24):** Claude can't send, confirm payments or overwrite client contact details; those need a person in the app.
- **MSME wording (D20):** legal text must stay accurate; it only shows for micro and small enterprises, and the Udyam number isn't verified.
- **Spam sign-ups:** with email confirmation off (D12), handled by Supabase rate limits and the 50-invoice cap; Turnstile is v2.

## 10. Later (see roadmap.md)
- **v2 (3–6 months):**
  - connect your own Razorpay or Cashfree for automatic confirmation;
  - email sending and scheduled reminders;
  - recurring invoices, credit and debit notes, foreign currency;
  - GST and TDS exports;
  - OAuth for MCP; teammates;
  - **bank and GSTIN verification at ₹1–5 per check, sold as a paid "Verified business" badge (D17)**;
  - Turnstile; Pro at ₹299 a month;
  - Form 16A tracking per client per quarter; advance invoices and late-fee clauses; an escalation guide (MSME Samadhaan, GST portal messages) (D26).
- **v3 (years 2–3):**
  - automatic payment matching through Account Aggregator;
  - expenses and GST input credit;
  - cash-flow forecasts and a slow-payer score;
  - invoice financing;
  - Tally, Zoho and QuickBooks sync;
  - an agency workspace.
