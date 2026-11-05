-- D37: "Viewed by client". Counters on the invoice for cheap reads (dashboard, MCP),
-- plus one 'viewed' event per open for the history. All additive, with defaults.
alter table public.invoices
  add column if not exists view_count integer not null default 0,
  add column if not exists first_viewed_at timestamptz,
  add column if not exists last_viewed_at timestamptz;

create or replace function public.record_invoice_view(p_invoice uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.invoices
     set view_count = view_count + 1,
         first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at = now()
   where id = p_invoice and user_id = p_user and stage <> 'draft';
  if found then
    insert into public.events (invoice_id, user_id, actor, type, payload)
    select p_invoice, p_user, 'client', 'viewed', jsonb_build_object('n', view_count) from public.invoices where id = p_invoice;
  end if;
end $$;
revoke all on function public.record_invoice_view(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_invoice_view(uuid, uuid) to service_role;

drop view if exists public.invoice_view;
create view public.invoice_view with (security_invoker = true) as
with pay as (
  select invoice_id,
         coalesce(sum(amount_paise) filter (where status = 'confirmed'), 0) as confirmed_paise,
         coalesce(sum(tds_paise)    filter (where status = 'confirmed'), 0) as tds_paise,
         count(*) filter (where status = 'reported') as pending_reports,
         max(created_at) filter (where status = 'reported') as last_report_at
  from public.payments group by invoice_id
)
select
  i.*,
  c.name as client_name,
  c.phone as client_phone,
  c.email as client_email,
  coalesce(p.confirmed_paise, 0) as confirmed_paise,
  coalesce(p.tds_paise, 0) as tds_total_paise,
  coalesce(p.pending_reports, 0) as pending_reports,
  p.last_report_at,
  greatest(i.total_paise - coalesce(p.confirmed_paise, 0) - coalesce(p.tds_paise, 0), 0) as balance_paise,
  case
    when i.stage = 'cancelled' then 'cancelled'
    when i.stage = 'draft' then 'draft'
    when coalesce(p.confirmed_paise, 0) + coalesce(p.tds_paise, 0) >= i.total_paise then 'paid'
    when i.due_date < public.ist_today() then 'overdue'
    when coalesce(p.confirmed_paise, 0) + coalesce(p.tds_paise, 0) > 0 then 'partially_paid'
    else 'sent'
  end as status,
  case
    when i.stage = 'issued'
     and coalesce(p.confirmed_paise, 0) + coalesce(p.tds_paise, 0) < i.total_paise
     and i.due_date < public.ist_today()
    then public.ist_today() - i.due_date else 0
  end as days_overdue
from public.invoices i
join public.clients c on c.id = i.client_id
left join pay p on p.invoice_id = i.id;
