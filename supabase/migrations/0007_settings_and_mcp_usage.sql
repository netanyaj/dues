-- 0007: global settings (DECISIONS.md D29) and MCP "last used" (D28).
-- Every column is optional or has a default, so existing accounts keep working unchanged.
-- No invoices columns are added, so invoice_view does not need recreating (see 0006).

alter table public.profiles
  add column if not exists default_gst_rate smallint not null default 18
    check (default_gst_rate in (0, 5, 12, 18, 28)),
  add column if not exists default_due_days smallint not null default 15
    check (default_due_days between 0 and 180),
  add column if not exists default_notes text
    check (default_notes is null or char_length(default_notes) <= 1000),
  add column if not exists show_upi_qr boolean not null default true,
  add column if not exists reminder_channel text not null default 'whatsapp'
    check (reminder_channel in ('whatsapp', 'email')),
  add column if not exists reminder_tone text
    check (reminder_tone is null or char_length(reminder_tone) <= 200),
  add column if not exists mcp_last_used_at timestamptz;
