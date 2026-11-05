# Metrics

Every metric below is computed from tables Dues already writes: `invoices` (with `original_due_date`), `payments`, `events` and `profiles`. No analytics SDK is needed in v1.

| Metric | Why it matters | How it's computed |
|---|---|---|
| **Activation:** first invoice created through Claude within 24 h of sign-up | Proves the Claude-first promise works for a new user | `min(events.created_at) where type = 'draft_created' and actor = 'claude'` minus `auth.users.created_at` ≤ 24 h, per user |
| **% paid by the original due date** (north star, D18) | The outcome freelancers want; extensions can't flatter it | Invoices whose `paid` event is on or before `original_due_date`, divided by invoices sent in the cohort |
| **Median days from Send to Paid** | Speed of getting paid | `paid.created_at − sent.created_at`, median per monthly cohort |
| % of sent invoices extended | Whether "on time" is being bent | Invoices with a `due_date_extended` event, divided by sent invoices |
| % of Claude drafts flagged for review | Whether Claude's maths drifts; tool descriptions need tightening | `flagged_for_review` events, divided by Claude-created drafts |
| Reminder to payment conversion | Do staged reminders work? | Invoices paid within 7 days of a `reminder_sent` event, by stage |
| Client report accuracy | Fraud and confusion signal | Reported payments confirmed, divided by all reported (rejected share is the warning) |
| Weekly active freelancers | Retention | Users with any `user` or `claude` event in the week |

**Guardrails:** cancelled invoices are excluded from the paid metrics. Demo accounts (`profiles.is_demo`) are excluded from everything.

**Gap:** there's no baseline yet for how freelancers get paid today. Before v2, interview 10 freelancers and record days-to-paid from their last 10 invoices (PRD §1).
