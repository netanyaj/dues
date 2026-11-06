# Dues: product requirements (v1)

*This file shows what we're building now. [DECISIONS.md](DECISIONS.md) records why (D-numbers). Visual rules are in [DESIGN.md](DESIGN.md); what comes after v1 is in [ROADMAP.md](ROADMAP.md).*

## 1. Problem and evidence
Indian freelancers and small agencies invoice from Word or Excel templates and chase payments on WhatsApp. They lose:
- **time:** each invoice is retyped, and the tax split is worked out by hand;
- **money:** invoices with a wrong GSTIN, tax split or numbering are sent back by clients' accounts teams, which delays payment *(assumption: not yet measured)*;
- **track of what's owed:** they can't tell who is overdue, or how much TDS a client has deducted.

**Evidence:** excerpts from about 30 Reddit threads (r/freelancing, r/indianstartups, r/smallbusiness, r/notioncreations and others), plus one r/smallbusiness thread read in full. The pattern across them:
- chasing, not creating, is the pain;
- clients answer work messages but leave payment reminders on "seen";
- income is tracked in WhatsApp messages and notes, and GST gets missed;
- invoicing tools feel "weirdly overwhelming", and a forced setup order loses people (D19, D21).

The rest is the founder's reasoning (D6, D11). **Gap:** no interviews yet. Before v2: 10 interviews with Indian freelancers, plus counts of invoices sent back and days to payment (METRICS.md).

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
| S1 | As a freelancer, I connect Claude to Dues. | Settings → Claude connection shows the server URL, my token once, the header value and the steps; Claude lists the Dues tools. Auth is a header only (D28). | T1, T24, T31 |
| S2 | I ask Claude to invoice a client (new or existing). | A draft appears within ~10 s, badged "Drafted by Claude"; a new client is created in the same step (D21). A retry doesn't create a duplicate (D23). If Claude's total is off by more than ₹1, it's flagged and can't be sent until I confirm. Claude can mark it ready but can't send it (D24). | T2, T3, T18 |
| S3 | I check and edit the draft. | Live totals and tax split; drafts have no number (D1). | T4 |
| S4 | I send it. | It gets the next number, and the issue date becomes today (D2); amounts lock; a public link appears (D7). Sending needs a bank account, asked for inline at the first Send (D35). | T5, T34 |
| S5 | My client opens the link on their phone and pays. | GST fields, bank details, UPI QR only if the total is ₹1 lakh or less (D6), the trust note (D17), and "Notify as paid" with a UTR next to the amount (D43). | T6, T7, T14 |
| S6 | I confirm the payment. | TDS-shaped shortfalls are pre-filled (D5); the invoice becomes Paid; reused or odd UTRs are flagged (D16). Payments Claude records also wait for my confirmation (D24). | T8, T16, T19 |
| S7 | I see who to chase and send the right reminder. | Overdue is worked out live (D4); a client report pauses chasing for 2 working days (D16); the next stage (friendly/firm/final at +3/+7/+14 days) is suggested; Claude writes it; Share opens WhatsApp or email with the text filled in (D19, D49). | T9, T10, T20 |
| S8 | A new user signs up and does all of the above. | No email confirmation (D12); their data is isolated. | T12, T13, T26 |
| S9 | I export my invoices for my accountant. | CSV for a date range with GST split, TDS and amount received (D22). | T21 |

## 5. Functional requirements
- **Numbering:** `{prefix}/{FY}/{seq:4}`, e.g. `INV/2026-27/0007`, at most 16 characters, prefix up to 3 characters (D3). The financial year starts 1 April (IST). Numbers are allocated on Send, inside a database transaction; they're never reused and never skipped (D1).
- **GST:** amount = round(qty × rate); tax is computed on the subtotal. Same state: CGST = SGST, with an odd paisa going to CGST. Different state: IGST. No GSTIN: no tax, and the invoice says "GST not applicable". Rates are 0/5/12/18/28%. The GSTIN is checked for format, checksum and state ("structurally valid", D6). PAN = GSTIN characters 3–12, checked for format only.
- **Claude's number check:** an `expected_total` more than ₹1 from Dues' total sets `needs_review`, blocking Send until "Confirm totals" (D30).
- **TDS:** recorded per payment; confirmed amount + TDS ≥ total means paid. The suggestion matches 1%, 2% or 10% of the subtotal (D5).
- **Statuses (derived in `invoice_view`, D4):** one status at a time, checked in this order: Cancelled, Draft, Paid, Overdue, Partially paid, Sent. "Payment reported" is a flag next to the status (D16); "ready to send" is a flag on a draft. Rejected reports are kept.
- **Locking:** drafts are fully editable and can be deleted. Once sent, items, client and amounts are locked; the notes and due date stay editable. The due date can only be extended, with a reason; `original_due_date` is kept (D18). To change amounts: cancel and reissue.
- **Client page:** unguessable link, `noindex`, seller and buyer details frozen at Send, place of supply, SAC per line, tax split, bank details (copy buttons), UPI QR and deep link if the total is ₹1 lakh or less, "Notify as paid" with an optional receipt (D40), print/PDF, the trust note, report link (D17).
- **MCP tools (9), D24:** `get_business_profile`, `upsert_client` (fills blanks only), `create_invoice` (creates the client inline, D21; duplicate check with `allow_duplicate`, D23), `update_draft_invoice`, `list_invoices`, `get_receivables_summary`, `mark_ready_to_send` (no number, no lock), `record_payment` (pending only), `save_reminder` (with stage). Read-only tools carry `readOnlyHint`. Three prompts (D38). Errors are plain language that Claude can act on. Claude never sends invoices or confirms payments.
- **MCP auth (D28, D41):** header only. Claude sends `Authorization: Bearer <token>` to `/api/mcp`. The token is per user, stored as a SHA-256 hash, shown once, and Regenerate replaces it at once. The retired link format returns 410.
- **Reminders (D19):** stage 1/2/3, suggested at +3/+7/+14 days overdue; shared through WhatsApp, email or copy; marked sent when opened (D49).
- **MSME (D20):** optional Udyam number and category; a factual MSMED/43B(h) line for micro and small; a warning when terms exceed 45 days.
- **Export (D22):** CSV for a date range; GSTR-1 format is v2.
- **Pricing and limits (D12):** v1 is free, with a cap of 50 invoices per account. Pro at ₹299 a month is planned and is a hypothesis to test (section 9). Demo accounts can't regenerate their token, change the password or delete the account (D13).

## 6. UX requirements
Visual rules (palette, type, icons) are in [DESIGN.md](DESIGN.md). These are the rules every screen follows:
1. **Each screen answers one question first.** Dashboard: "who owes me, and what needs me today?" Invoice: "what state is this in, and what's my next action?" Client page: "how much, by when, and how do I pay?"
2. **Nothing scrolls sideways at 375 px**, on any screen. The client page is mobile-first.
3. **Indian formats:** ₹1,00,000; dates like "12 Nov 2026"; FY shown as 2026–27.
4. **A confirmation before Send, Cancel and Reject.** Nothing irreversible happens in one tap.
5. **Errors appear next to the field, in plain words**, and say what to do next.
6. **Status is a colour and a word**, never colour alone.

## 7. Success metrics (detail in METRICS.md)
- **Activation:** first invoice created through Claude within 24 hours of sign-up.
- **% paid by the original due date (D18).**
- **Median days from Send to Paid.**
- Supporting: % of invoices extended; % flagged for review.

## 8. Milestones
| | Milestone | Scope |
|---|---|---|
| M1 | Schema and domain logic | Tables, numbering, GST maths, statuses |
| M2 | Auth, onboarding, settings, dashboard | Sign-up, setup, the owed-and-overdue view |
| M3 | Invoices, client page, payments | Drafts, Send, the client page, reports and confirmation (D16–D18) |
| M3b | Research and safety changes | Inline client, duplicate check, Claude-safe actions, token hash, reminder stages, MSME, CSV (D19–D25) |
| M4 | MCP and operations | MCP tools, cron, integration script, seed, no-AI check |
| M5 | Deploy and production test | First deploy and the founder's real-Claude walkthrough (D30) |
| M5b | Redesign and header auth | Design system, Settings rebuild, header-only MCP auth, FLOWS.md (D27–D30) |
| M5c | Live-site fixes | MCP discovery (D32), invoice header (D34), bank at Send (D35), client dropdown (D36), views (D37), prompts (D38), aging bar (D39), proof upload (D40), Share (D49), landing (D51) |
| M6 | Docs | README, ARCHITECTURE, DESIGN, FLOWS, METRICS, ROADMAP, TESTING |

**Must-ship:** everything in sections 4 and 5, including the chase list, reminders with stages (D19), CSV export (D22) and the cron.
**If ahead:** client pages and the event timeline were built. `get_recent_items`, line-item autosuggest and "Reset demo data" were moved to v2 (D47). Not planned: Google sign-in (the brief and D12 say one login flow).
**If behind, cut in order:** reminders → timeline UI (keep the events table) → partial payments. Never cut the number checks, locking or the client page.

## 9. Risks and open questions
- **Zoho Invoice is free and strong (D11).**
  Response: from the research, freelancers say invoicing tools feel "weirdly overwhelming" and bury reminders in suites with 50+ features. "Contractors don't want a CRM." The minimum they describe is: create and send fast, get paid, see paid/unpaid/overdue, reminders, history, export for taxes. Dues is that list and nothing else: one place to track who owes you, with the Claude they already use as the way in. They're leaving Word, Excel and WhatsApp, not Zoho.
- **Who pays ₹299 a month?**
  Response: Pro is priced against late payment, not against a free template. It sells automatic confirmation through their own gateway, scheduled reminders and the verified badge. Test it with an Upgrade button at invoice 50 plus 10 interviews; drop Pro if under 10% click.
- **Connector setup friction.** Adding a custom connector with a header takes six steps, and Request headers is a beta some accounts don't have.
  Response: the app works fully by hand, so nobody is blocked; Claude Code is the fallback, and OAuth (one click, no token to copy) is v2.
- **Zoho and Stripe already have MCP servers.**
  Response: MCP isn't the edge. Simplicity, chasing and Indian rules are: GST split, numbering per financial year, TDS, UPI limits and the MSME 45-day rule, in a tool with nothing else in it.
- **UPI limits:** person-to-person payments are capped at ₹1 lakh per transaction, and some apps limit pre-filled amounts to personal UPI IDs (D6).
  Response: bank details are always shown, the QR only appears up to ₹1 lakh, and the UPI ID is shown as text.
- **GSTIN status can't be checked:** without a GSP we can't tell whether a GSTIN is active.
  Response: we say "structurally valid", never "verified", and link to the government search (D6, D17).
- **Invoice-redirection fraud:** someone could create a fake account in a real business's name.
  Response: the client page makes no claims, warns about new accounts, flags recent bank changes and has a report link; real verification is v2 (D17).
- **Fake "Notify as paid" reports.**
  Response: reports pause chasing for 2 working days and then come back; UTRs are checked for format and reuse; the freelancer always confirms against their bank (D16, D24).
- **Bearer token (D28):** anyone holding it can use the account until it's regenerated.
  Response: it's sent only in a header, stored hashed, never logged, shown once, and Regenerate cuts it off at once. OAuth with consent and expiry is v2.
- **Prompt injection through Claude (D24).**
  Response: Claude can't send, confirm payments or overwrite client contact details; those need a person in the app.
- **MSME wording (D20):** legal text must stay accurate.
  Response: it only shows for micro and small enterprises, states the Act plainly, and the Udyam number isn't claimed as verified.
- **Spam sign-ups:** email confirmation is off (D12).
  Response: Supabase rate limits and the 50-invoice cap for v1; Turnstile is v2.

## 10. Beyond v1
What comes next, and what was left out of v1 on purpose, is in [ROADMAP.md](ROADMAP.md): v2 (paid Pro, gateway confirmation, email, OAuth, verification), v3 (bank matching, financing, accounting sync), and the list of things deliberately not in v1 with the reason for each.
