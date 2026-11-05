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

> **Partly replaced by D16:** "Payment reported" is no longer a status that outranks Overdue. It's a separate flag.

## D5. TDS: the freelancer decides; code only suggests

**Question:** a corporate client pays ₹32,400 against a ₹35,400 invoice. Is that a partial payment, or 10% TDS on the ₹30,000 subtotal?

**Decision:** the client's "I've paid" form records only what the client says. When the freelancer confirms, Dues checks whether the shortfall equals 1%, 2% or 10% of the pre-GST subtotal, within ₹1. These are the 194C (1%/2%) and 194J (2%/10%) rates that apply to freelancers; leaving out other rates avoids false matches. If it does, the form is pre-filled with "Looks like 10% TDS (₹3,000)". The freelancer accepts or changes it. This is plain arithmetic, not AI.

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

## D11. Why Dues, and not Zoho Invoice? Why does the app exist outside Claude?

**Question:** Zoho Invoice is free, GST-compliant, sends reminders and accepts payments. With bank transfer first, "zero fees" isn't a differentiator.

**Answer:** "Claude is where the freelancer works; Dues is where the money is kept honest." Zoho has a Claude connection too, but it's a full accounting suite underneath. Dues does one job, getting paid correctly, with no setup. **Our users aren't leaving Zoho; they're leaving Word and WhatsApp.** We concede openly that Zoho is free and strong.

**Why the app must exist outside Claude:**
- the client needs a page to pay from;
- invoice numbering and tax rules must be enforced somewhere Claude can't override;
- payment status must be tracked when no chat is open;
- Claude's figures must be checked in code before anything is sent.

**Follow-up to prepare:** Word is free. Who pays ₹299/month to replace it? (For the mock grilling.)

## D12. Open sign-up, with email confirmation off

**Question:** can reviewers sign up, or only use the test account?

**Decision:** open sign-up, email confirmation off, and the user is logged in straight away. Supabase's built-in email sender is limited to a few emails an hour, so a reviewer's confirmation email might never arrive. We saw this ourselves: our own sign-up test hit "email rate limit exceeded" while confirmation was still on.

**Cost:** spam sign-ups and junk data.

**v1 mitigations:**
- Supabase's auth rate limits;
- a cap of 50 invoices per account, enforced by a database trigger;
- `noindex` on public invoice pages.

**v2:** Cloudflare Turnstile and email verification through a proper email sender.

## D13. Seeded demo accounts, one per reviewer

**Question:** several reviewers sharing one test account would see each other's Claude-created invoices. And the first one who tries "Regenerate link" disconnects everyone else.

**Decision:** one seeded account per reviewer (sandeep@, rosh@, maneeshwar@, spare@dues.test). The seed script takes an email and creates a fully populated account with invoices in every state. Demo accounts have `is_demo = true`, which blocks "Regenerate link" (and client deletion, if we add it), with the note "Disabled on demo accounts — sign up to try it." The passwords go in the submission form, never in the repo. Stretch goal: a "Reset demo data" button that re-seeds only that account.

**Why seeded and not sign-up only:** the brief asks for login details. A new account starts empty, so a reviewer would need about 15 minutes to create the states that show the thinking (overdue, partial payment with TDS, a reported payment, a cancelled invoice). Seeding costs one script.

**Submission note:** "Fastest: sign up in 30 seconds and connect your own Claude. Or log in with your seeded account (Sandeep / Rosh / Maneeshwar), which already has invoices in every state."

## D14. An incomplete profile blocks only Send

New users land on a short setup page first, but nothing else is locked: they can add clients and drafts straight away. Send is refused in the database (`issue_invoice`) until the business name, address and state are set. Claude's tools return "Finish setup in Dues first: <link>" when something they need is missing.

## D15. Browser roles can only read; every write goes through the server

The browser's publishable key can read the user's own rows (RLS) but can't write any table. This blocks a user from setting `is_demo = false` on their own profile or writing a token. All writes go through server actions or MCP into the service layer (D8). The Supabase keys are the new-style ones: the publishable key (browser) and the secret key (server only, never `NEXT_PUBLIC_`).

## D16. A client's "I've paid" pauses chasing briefly; it never hides the invoice

**Question:** a slow payer taps "I've paid" with a made-up reference. Under D4, the invoice dropped off "To chase today" and looked handled.

**Decision**
- **Two separate facts.** Status is decided by confirmed money only: Cancelled → Paid → Overdue → Partially paid → Sent → Draft. "Payment reported" is a separate flag (`pending_reports > 0`) shown next to the status, e.g. "Overdue · payment reported". A client's claim never changes whether an invoice is overdue. (Replaces D4's order.)
- **A 2-working-day pause.** After a client report, the invoice leaves "To chase today" for 2 working days (Saturday and Sunday skipped; bank holidays not modelled in v1). During the pause it sits at the top under "Needs your confirmation", so it never looks handled. After the pause it goes back on the chase list with "Reported N days ago, not confirmed. Check your bank."
- **Cheap reference checks: flag, don't block.**
  - The client form accepts any 6–22 letters or digits.
  - The freelancer sees warnings: "Unusual reference format" (anything other than 12 digits for UPI/IMPS, or 16 or 22 characters for NEFT/RTGS) and "Reference already used on {number}".
  - We don't block on format because PhonePe and GPay show a "Transaction ID" next to the UTR, and real payers paste the wrong one.

**Gave up:** a single status word for every situation.

## D17. Trust and fraud: say nothing we can't back up; verification is v2

**Question:** what stops someone using Dues to send a fake invoice in a real business's name with their own bank details (invoice-redirection fraud)?

**Decision: the client's page claims nothing it can't back up.**

It doesn't show:
- that the business is real;
- that the bank account belongs to them;
- anything "verified". No badges, no ticks.

It shows:
- "Invoice issued by {business} using Dues. Dues does not verify businesses or bank details." For accounts less than 30 days old, it adds: "This is a new Dues account. Confirm the details with {business} by phone before paying."
- the GSTIN marked as "structurally valid" (format, checksum, state), with a link to the government's public GST search so the client can check it themselves;
- the bank details exactly as they were when the invoice was sent (the snapshot, D7). If they changed in the 7 days before the invoice was sent, it shows "Bank details updated on {date}", because redirection scams usually involve a last-minute bank change;
- "Not verified" wherever a verification badge would later go;
- a "Report this invoice" link. It logs an event and writes to `abuse_reports`. Nothing happens automatically, because an automatic action could be used to take down a legitimate freelancer. v1 has no admin screen; reports are reviewed by hand in Supabase.

**Verification is deliberately v2.** Real bank checks ("penny drop": send ₹1 and match the account holder's name) and GSTIN active-status checks need a provider (e.g. Cashfree, Setu, Decentro, or a GST data provider). Live keys need the provider's business verification, which takes days. Test-mode APIs return made-up results, so a "Verified" badge in the demo would be false, which is worse than no badge. v1 builds only the slot: a `verifications` table (type `bank` or `gstin`; status `not_verified`, `verified` or `failed`; provider; checked_at; result). Turning verification on later means signing up with a provider, not rewriting code.

**v2 economics:** about ₹1–5 per check. It can be sold as a paid "Verified business" badge; unverified pages keep the warning.

## D18. Due-date extensions: store the original, measure against it, and tell the client

**Question:** pushing out the due date after sending makes "% paid by due date" look better without anything improving.

**Decision**
- `original_due_date` is set on Send and never changes. `due_date` is the currently agreed date.
- **Metrics use `original_due_date`.** Overdue status and the chase list use `due_date`, because that's what was agreed.
- After sending, the due date can only move **later**. Bringing it forward would make the client overdue sooner than agreed. Every change needs a short reason (e.g. "Client asked for 30 days"), which is logged as an event.
- The client's page says "Due date extended from 12 Nov to 12 Dec."
- METRICS adds "% of invoices extended", so a freelancer who extends a lot shows up too.
- MCP has no tool for editing sent invoices, so extensions happen in the app only.

## D19. Chasing is must-ship; reminders have three stages

**Question:** what's the core pain: creating invoices, or getting paid?

**Evidence (weak):** one r/smallbusiness thread (mostly US small businesses) says chasing, not invoice creation, is the pain. The founder's own reasoning agrees. This isn't Indian freelancer research; see the PRD gap.

**Decision**
- "To chase today" and reminders move from if-ahead to must-ship.
- A reminder has a stage: 1 friendly, 2 firm, 3 final. The chase list suggests the next stage at +3, +7 and +14 days overdue: the highest stage reached that hasn't been saved yet.
- Claude writes the message for that stage. `save_reminder` stores it; Dues never sends anything.

**Gave up:** reminders as a stretch goal; about 35 minutes of build time.

## D20. MSME line on the invoice: factual, and only when it's legally true

**Question:** can Dues use the law that protects small suppliers from late payment?

**Decision**
- Optional `udyam_number` on the profile, checked for format only (`UDYAM-XX-00-0000000`; Dues doesn't verify it, consistent with D17).
- A required `msme_category` when it's set: micro, small or medium.
- The line shows on the invoice and client page **only for micro and small**. Sections 15–16 of the MSMED Act and Section 43B(h) of the Income-tax Act don't cover medium enterprises or traders.
- The form warns if the due date is more than 45 days after issue.

**Exact text (micro/small):**
> {Business} is registered as a {micro|small} enterprise under the MSMED Act, 2006 (Udyam Registration No. {UDYAM-…}). Under Section 15 of the Act, payment is due within the agreed period, which cannot exceed 45 days from acceptance, or within 15 days if no period is agreed. Under Section 16, late payments carry compound interest at three times the bank rate notified by the RBI. Under Section 43B(h) of the Income-tax Act, 1961, a buyer can deduct this expense only in the year it is actually paid, if it is paid after the time allowed.

**Form warning (due date more than 45 days after issue):**
> This due date is more than 45 days after the invoice date. For a registered micro or small enterprise, the MSMED Act limits agreed payment terms to 45 days.

**Why this wording:**
- It states the law and doesn't threaten.
- It doesn't claim the client has accepted anything.
- It names the 15-day default, so it isn't wrong when there's no written agreement.

**Gave up:** a punchier "pay in 45 days or pay interest" line, which would be inaccurate.

## D21. No forced setup order: clients are created inside the invoice step

**Question:** the r/smallbusiness thread says tools that make you set things up in a fixed order lose people.

**Decision**
- `create_invoice` (MCP) and the app's invoice form create the client in the same step if it doesn't exist.
- Name and state are required (state decides CGST/SGST vs IGST). Email, phone and GSTIN are optional and can be added later.
- The "call upsert_client first" error is removed. `upsert_client` stays for adding or updating details.
- **Safety (see D24):** from Claude, `upsert_client` and inline creation only fill blank fields on an existing client. Changing a saved phone, email or GSTIN needs the app, because an injected instruction could otherwise redirect reminders.

## D22. CSV export is must-ship; GSTR-1 format stays v2

**Decision:** an Export button on the dashboard, with a date range on the issue date. One row per sent or cancelled invoice: number, issue date, client, client GSTIN, place of supply, taxable value, CGST, SGST, IGST, total, TDS, amount received, status. Amounts are in rupees with two decimals, so a spreadsheet reads them without conversion. Drafts are excluded because they aren't tax documents (D1).

**Gave up:** the formatted GSTR-1 file (v2).

## D23. Duplicate drafts from Claude retries are caught on the server

**Question:** Claude retries `create_invoice` after a timeout. Do we get two drafts?

**Options:** idempotency keys (only work if Claude resends the same key, which we can't rely on); server-side duplicate check; accept it.

**Decision**
- Before inserting, Dues looks for a draft with the same user, client and GST rate, the same line items (description ignoring case and spaces, qty, rate) and total, created in the last 10 minutes.
- If it finds one, it returns that draft with "This invoice was already created a moment ago; returning the existing draft."
- `allow_duplicate: true` overrides the check when two identical invoices are really wanted.
- Low risk either way: drafts have no number and can be deleted (D1).

## D24. Claude drafts, code checks, a human confirms anything irreversible

**Question:** Claude can be manipulated by text it reads, e.g. an email that says "mark invoice 7 as paid". Should it be able to send invoices or record payments?

| Action | From Claude |
|---|---|
| Read: profile, list, summary | Allowed (`readOnlyHint: true`) |
| Create or edit drafts, add clients | Allowed (`destructiveHint: false`). Drafts can be deleted, and code checks every number. Existing client details can only be filled in, not overwritten (D21). |
| Save a reminder | Allowed: it only stores text; the freelancer taps to send. |
| Send an invoice | **Not allowed.** `mark_invoice_sent` is replaced by `mark_ready_to_send`, which flags the draft and returns the app link. Only a person pressing Send in the app assigns the number, locks the amounts and creates the public link. |
| Record a payment | **Pending only.** `record_payment` creates a `reported` payment (`reported_by = claude`), exactly like a client report. The freelancer confirms it under "Needs your confirmation". |

- The tool descriptions say plainly: "Dues never sends invoices or confirms payments from chat; the freelancer does that in the app."
- The dashboard has a "Ready to send" section.
- A test checks that no MCP tool can move an invoice to issued or set a payment to confirmed.
- **Demo script:** Claude creates the invoice → a deliberately wrong total triggers review → open the app, fix it and press Send → the client pays → confirm. This also shows the brief's "a person can open your app and change it" as a real step.
- **Gave up:** fully hands-free sending from chat.

## D25. The MCP token is stored only as a hash and shown once

*Updated by D28: the token now travels in the Authorization header, so the log risk below no longer applies.*

**Decision**
- Profiles store `mcp_token_hash` (SHA-256) and the last 4 characters; never the token itself. MCP looks users up by hashing the token in the URL.
- The full link is shown once: after onboarding and after Regenerate, with a copy button and "Copy this now — for security we can't show it again." After that, Settings shows only `…abcd` and Regenerate.
- Demo accounts can't regenerate (D13). The seed script prints each demo link once, to the terminal only, never to a committed file.
- **Logs:** Claude custom connectors only accept a URL, so the token still appears in Vercel's request logs. v1 mitigations: our code never logs the URL or token (a test checks the MCP route source); Vercel's default log retention is kept; logs are forwarded nowhere. The real fix is OAuth in v2. This is a known v1 risk (PRD §9, ARCHITECTURE security).
- **Interview line:** "Hashing protects every user's connection if the database leaks. The token still appears in request logs because Claude's connectors only take a URL. That's a known v1 risk with a small blast radius (instant regenerate), and OAuth in v2 removes it."

## D26. v2 additions from research
- TDS certificate (Form 16A) tracking per client per quarter.
- Advance or deposit invoices, and late-fee clauses.
- An escalation guide: MSME Samadhaan, and the GST portal's taxpayer messages.
- If ahead in v1: `get_recent_items` and line-item autosuggest, so "same as last month" works.


## D27. Design direction: "Workbench", one ink accent, status colours only for status

**Context:** the production review said the app looked AI-generated:
- stock Next.js and shadcn defaults;
- identical bordered boxes;
- tinted callouts used as layout;
- badge soup;
- a dashboard 670 px wide on a 375 px phone.

The founder rejected the first two mock directions as still generic. They picked G ("Workbench in the Desk layout") with the tally-mark logo from F.

**Decision**
- **Layout:**
  - A dark sidebar on desktop (`#181818`) and a bottom tab bar on phones.
  - A grey canvas (`#f4f4f4`) with white panels, used as the only container style.
  - Every screen answers one question first:
    - the dashboard asks "who owes me, and what needs me today?" (owed figure, then "Needs you", then invoices);
    - the invoice page asks "what state is this in, and what's my next action?".
- **Colour:** one action colour, ink `#171717`. Red (`#b42318`) only for late, danger and destructive actions. Amber only for "needs your attention". Green only for paid. No second accent, no gradients, no purple.
- **Type:**
  - Geist, chosen deliberately. It has true tabular figures for columns of rupees, a ₹ glyph drawn to match, and it stays legible at 12–14 px on low-end Android. Manrope was the alternative.
  - Every amount uses the `amount` utility (tabular numerals, no wrapping), right-aligned in tables.
  - Named text styles (`heading-6`, `title-4`, `body-6`, `caption-5`…) on the Tailwind scale, per the landing-page-design skill.
- **Icons:** Phosphor only. Lucide is removed.
- **Logo:** four tally marks struck through, meaning counted and settled. It's the favicon and appears on the client page footer and in OG images.
- **Status:** a dot plus a word, never a filled chip. "Drafted by Claude" is a quiet icon and label, not a coloured badge.
- **Mobile:** no screen scrolls sideways at 375 px. Tables become stacked rows below `lg`, and the tax invoice document stacks its line items.

**Gave up:** a branded accent colour. The tally mark and the ink carry the brand.

## D28. D-Q12 final: header-only MCP auth, no URL fallback

**Context:** D25 kept the token in the URL because claude.ai custom connectors only took a URL. claude.ai now has a **Request headers** field under Add custom connector (Anthropic's help article for Pro and Max; an Anthropic collaborator called it a beta for some organisations on 18 Oct 2026). The founder confirmed it appears on a personal Free account, and Claude Desktop and Claude Code support headers too.

**Decision**
- One endpoint, `/api/mcp`, authenticated only by `Authorization: Bearer <token>`.
  - A missing or malformed header gets 401: "Add your Dues token as an Authorization header…".
  - A wrong or regenerated token gets 401: "This Dues token isn't valid…".
- `/api/mcp/<token>` is retired. It returns **410** with "This link format was retired. Reconnect using Settings → Claude connection". It never reads the path segment, so old connections fail with instructions rather than silently.
- Storage is unchanged from D25: SHA-256 hash and last 4 characters; the token is shown once; Regenerate is the kill switch; it stays disabled on demo accounts.
- `mcp_last_used_at` (written at most every 5 minutes) gives Settings a "Connected · last used …" status.
- **No URL fallback, and why:**
  - A fallback keeps the exact risk we're removing: tokens in request logs and browser history.
  - It doubles the auth surface we must test.
  - Every client we need (claude.ai, Desktop, Code) now sends headers.
  - If a reviewer's account lacks the field, Settings says so and gives the Claude Code command.
- **Tests:**
  - The integration script checks 401 with no header, 401 with a wrong token, 410 for the old format, and that Regenerate cuts off the old token.
  - A guard test fails if any `src` file logs `headers` or `authorization`, or if the retired route reads `params`.
- **v2:** OAuth for sign-in, consent and token expiry.

## D29. Settings is a left-nav area of eight sections, each saved on its own

**Context:** the old single 2,700 px form blocked a new user from saving their business name until they'd added bank details (one validation pass for everything).

**Decision**
- **Sections:**
  1. Business profile
  2. Tax and compliance
  3. Getting paid
  4. Invoice defaults
  5. Reminders
  6. Claude connection
  7. Data and export
  8. Account
- **How saving works:** each section is its own form. `updateProfileSection` runs the same validation as before over the merged profile, but only errors in that section block the save, and only that section's columns are written. Changing the state is still blocked when it would orphan a GSTIN from another state.
- **First run:** sign-up walks steps 1–3 and then Claude connection, with "Save and continue" and a "Go to your dashboard" exit at step 4.
- **New columns (migration 0007), all optional with defaults so existing accounts don't change:**
  - `default_gst_rate` (18)
  - `default_due_days` (15)
  - `default_notes`
  - `show_upi_qr` (true; the ₹1 lakh cap still applies)
  - `reminder_channel` (WhatsApp)
  - `reminder_tone`
  - `mcp_last_used_at`
- **Where the new fields go:** defaults pre-fill the app's new-invoice form. Claude reads them, with the reminder tone, through `get_business_profile`. MCP tool behaviour is otherwise unchanged.
- **"GST not applicable":** a toggle that clears the GSTIN. That's how Dues already decides "no GST" (D3), so there's no new rule.
- **Read only:**
  - the reminder stage timings (+3/+7/+14 days, D19);
  - the next invoice number and current FY;
  - the client-facing trust text (D17).
- **Account:** change password, sign out, and delete account (type DELETE; everything cascades). Delete is disabled on demo accounts.
- **v2:** logo upload, and "Reset demo data" (re-run `npm run seed` for now).

## D30. Confirming totals sticks until the total changes

**Context:** found in the production walkthrough. After "Confirm totals", the next draft save re-checked Claude's original expected total and raised the flag again.

**Decision:**
- Once the freelancer confirms, saving keeps the flag off unless the total changes or Claude sends a new expected total.
- If the total changes and still doesn't match the claim, the flag returns.
- No schema change: a confirmed draft is `needs_review = false` with its `review_reason` kept.
- Covered by `tests/db/review.test.ts`.

## D31. One indigo accent; icon-only copy; shorter wording

**Context:** the user's review. The landing page read as monotonous in ink alone. Copy buttons repeated "Copy" beside every value, and client-page wording was long. On desktop the client page left wide empty margins.

**Decision:**
- **One accent, indigo `#3a4fd6`** (6.4:1 on white, so it works as text and with white text on it). It's now `--primary` and `--ring`, so primary buttons, focus rings and the logo tile use it. On landing it also marks the hero's last line, step numbers, check icons, the Free plan and the final call to action.
- **Not a second accent:** red, amber and green stay reserved for late or danger, needs you, and paid. Check icons on landing moved from green to indigo for that reason.
- **Copy buttons are icon-only.** Each carries a specific `aria-label` and tooltip ("Copy IFSC", "Copy token"). The invoice share panel shows the link itself beside its copy icon, so the icon has context.
- **Client page wording:** "I've paid" as the form title, "Notify as paid" to submit, "Payment reported" after, "Pay with UPI".
- **Client page on desktop (lg and up):** invoice document on the left, amount, how to pay and the trust note in a 400px column on the right. Phones keep the order summary, pay, trust, then document.
- No business logic, schema or MCP change.

## D32. MCP discovery must never hit the login page

**Context:** found on the live site by the user's reviewer. `/api/mcp` itself answered correctly, but the auth proxy sent every unknown path to `/login`, including `/.well-known/oauth-protected-resource`. Our 401 carried `WWW-Authenticate: Bearer`, which tells MCP clients to start OAuth discovery. They got a login page instead of JSON, and the connection failed.

**Decision:**
- The proxy only guards app pages (`/dashboard`, `/invoices`, `/clients`, `/settings`). Every other path is left alone, so unknown pages get the real 404.
- `/.well-known/*` always returns a JSON 404.
- The proxy skips all of `/api/*`, `/i/*`, icons and static files.
- **No `WWW-Authenticate` on our 401.** Dues has no OAuth server (v2), so we shouldn't invite discovery.
- **Two different 401 messages:** "No Dues token sent…" vs "Token not recognised. Copy a fresh token… or Regenerate".
- **CORS on `/api/mcp`:** OPTIONS returns 204. It allows the Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version and Last-Event-ID headers. The origin is `*`, which is safe because the token is a header, never a cookie.
- **Server icon:** `serverInfo` sends `title`, `websiteUrl` and `icons` (`/icon.png` at 512px, `/icon.svg`). There are also `favicon.ico` and `apple-icon.png`, all public.
- **Tests:** `tests/mcp/integration.mts` now covers all of this, 23 checks in total.

## D33. Hot-pink brand; calm, separate status colours (updates D31)

**Context:** the indigo `#3a4fd6` read as default SaaS blue. The user asked for a deliberate hot-pink direction, with electric coral as the alternative.

**Decision: hot pink.**

| Token | Value | Used for |
|---|---|---|
| `--brand` / `--primary` | `#C2185B` | Main buttons, links, brand text |
| `--brand-vivid` | `#E0306E` | Logo, fills, 24px+ type only |
| `--brand-strong` | `#A3134C` | Button hover |
| `--brand-soft` | `#FCE8EF` | Tinted surfaces |
| `--brand-on-dark` | `#FF8FB3` | Brand text on the dark sidebar or band |
| `--background` | `#FBF8F6` | Warm white canvas |
| `--foreground` / `--sidebar` | `#17151C` | Near-black ink |

**Contrast:**

| Pairing | Ratio |
|---|---|
| White on `#C2185B` | 5.87:1 |
| `#C2185B` on warm white | 5.55:1 |
| `#C2185B` on brand-soft | 5.01:1 |
| White on `#E0306E` | 4.36:1 (fails AA for normal text, so it's never used behind small text) |
| `#E0306E` on warm white | 4.12:1 (passes for large type) |
| `#FF8FB3` on ink | 8.47:1 |
| Ink on warm white | 17.1:1 |
| Muted `#5E5A63` on warm white | 6.37:1 |

**Status stays separate from the brand:**

| Status | Colour | Contrast | Note |
|---|---|---|---|
| Overdue, and caution warnings | Amber `#B54708` | 5.13:1 | Not red, so it doesn't clash with pink |
| Errors and danger | Red `#B42318` | 6.22:1 | New `--danger` tokens, used only for errors and destructive actions |
| Paid | Green `#067647` | 5.38:1 | |
| Needs review, payment reported | Neutral `#4A4550` | — | |

**Electric coral `#FF5B37`: not chosen.** White on it is 3.09:1 and it sits on warm white at 2.92:1, so buttons would need a darker `#B93A1E` (5.7:1). That loses most of its character. It's also too close to the overdue amber.

**Rules:**
- Pink is only for brand, main actions and highlights. It never signals a status.
- All colours live in tokens in `globals.css`. The few remaining hex values are border tints and the OG image, which can't read CSS variables.

## D34. Invoice page: one main action per state, the rest under More

**Context:** the invoice header had up to eight buttons side by side.

**Decision:**

| State | Main action | Under More (⋯) |
|---|---|---|
| Draft | Send | Preview as client, Delete draft |
| Issued, unpaid | Copy link (icon) + WhatsApp | Record payment, Extend due date, Edit notes, View as client, Send by email, Cancel invoice |
| Payment reported | Confirm / Reject, in the banner right under the header | — |
| Paid | None | Record payment (if allowed), Edit notes, View as client |
| Cancelled | None | — |

- A summary bar shows Still owed (or Paid), Invoice total, Due (with days late in amber) and Issued. Drafts show Total, Client, Due and "Number: When you send".
- Menu items open the same dialogs as before, now as controlled dialogs. Every confirmation and server rule is unchanged.
- Destructive items sit below a separator, in red.

## D35. Bank details are required to send, asked for at the first Send

**Context:** an invoice could be sent with only a UPI ID, or with nothing, if setup was skipped. Above ₹1 lakh, or with no UPI, the client page ended in "Ask {business} for payment details", a dead end.

**Decision:**
- **Sign-up doesn't ask for bank details.** Setup gaps are now business name, address and state.
- **`sendInvoice` refuses** without a bank account number and IFSC (`bank_details_required`), and also with setup gaps (`setup_incomplete`). The check is in the service, so it can't be bypassed, and a test covers it.
- **In the app,** Send opens an "Add your bank account to send" dialog. It saves through the same validation as Settings → Getting paid (so the bank-changed trust note still works), then sends in one confirmed step. UPI stays optional.
- **The client page drops the "Ask … for payment details" line.** Invoices sent before this rule with no bank details simply show "I've paid".
- **Claude:** `get_business_profile.missing` says when the bank account is still to be added at first Send.

## D36. Client is a searchable dropdown; "+ New client" opens a side panel

**Context:** choosing "Add a new client…" inlined two extra fields inside the invoice form. It worked, but it looked unfinished.

**Decision:**
- **The Client field is a searchable dropdown.** Type to filter by name or GSTIN, use the arrow keys and Enter, and "+ New client" sits at the bottom. It pre-fills with whatever was typed.
- **"+ New client" opens a right-hand side panel.** Name and state are required; GSTIN, email and phone are optional. It saves through the same `saveClient` validation as the Clients page, then returns to the invoice with the new client selected.
- **No setup order is forced** (the research point stands). The invoice form no longer creates clients itself; Claude's `create_draft_invoice` can still create a client by name.

## D37. "Viewed by client"

**Decision:**
- **What counts:** each open of `/i/[id]` calls `record_invoice_view` after the response is sent. It's skipped when the visitor is the logged-in owner, or when a simple user-agent check flags a bot or link-preview fetcher (WhatsApp, Slack, Telegram, crawlers, curl and similar). This is a signal, not a security control.
- **Storage (migration 0008, additive):** `invoices.view_count`, `first_viewed_at` and `last_viewed_at`, plus one `viewed` event per open with `actor = client`.
- **Shown:**
  - "Viewed N times · last {time}" (or "Not opened yet") in the invoice summary bar and on each chase item;
  - the history shows the first and the latest open only.
- **Claude sees it:** `client_views` on each invoice in `list_invoices`, and `client_views` / `last_viewed_at` on each `to_chase_today` item in `get_receivables_summary`.
- **Privacy:** no IP addresses or user agents are stored. Vercel Analytics masks `/i/<id>` as `/i/[id]`.

## D38. MCP prompts

Three prompts appear in Claude's "+" menu. Each one is a template that names the Dues tools, with no logic:
- **"Chase my overdue invoices"** (`chase_overdue`): `get_business_profile` for tone, `get_receivables_summary`, a reminder per item at its stage, `save_reminder`. It mentions unopened invoices.
- **"What am I owed?"** (`what_am_i_owed`): a short summary from `get_receivables_summary`, quoting Dues' figures.
- **"Invoice a client"** (`invoice_client`, with optional `client` and `work`): `get_business_profile` defaults, `upsert_client` for new clients (ask for their state), `create_invoice` with `expected_total_rupees`. It shows Dues' totals and reminds the freelancer they send it.

## D39. One chart: who owes you, by age

**Decision:**
- **One stacked bar on the dashboard** replaces the late/not-due bar. It shows open balances by invoice age (days since the invoice date) in four buckets: 0–15, 16–30, 31–45 and over 45 days.
- **A dark marker sits at 45 days,** the MSMED Act limit. Over 45 is amber; the rest are neutral greys, getting darker with age.
- **Each bucket filters the invoice list** (`/dashboard?age=…`). The legend tiles are the keyboard-accessible links, and the bar segments are mouse shortcuts.
- **No other charts.** A new account has no history to plot trends from.
- **Logic** is in `lib/domain/aging.ts` and unit tested: day 45 falls in 31–45, day 46 in over 45.
