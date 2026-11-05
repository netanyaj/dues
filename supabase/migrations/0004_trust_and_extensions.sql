-- D16 (report flag, not status), D17 (trust and fraud), D18 (original due date).

-- D18: original due date, set on Send, never changed.
alter table public.invoices add column if not exists original_due_date date;

-- D17: when bank details last changed, so the public page can warn.
alter table public.profiles add column if not exists bank_details_changed_at timestamptz;

create or replace function public.track_bank_change() returns trigger
language plpgsql as $$
begin
  if (new.bank_account_number is distinct from old.bank_account_number)
     or (new.bank_ifsc is distinct from old.bank_ifsc)
     or (new.bank_account_name is distinct from old.bank_account_name)
     or (new.upi_id is distinct from old.upi_id) then
    -- First-time setup isn't a "change".
    if old.bank_account_number is not null or old.upi_id is not null then
      new.bank_details_changed_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_bank_change on public.profiles;
create trigger profiles_bank_change before update on public.profiles
  for each row execute function public.track_bank_change();

-- D17: the slot for v2 verification. Nothing writes "verified" in v1.
create table if not exists public.verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('bank', 'gstin')),
  status      text not null default 'not_verified' check (status in ('not_verified', 'verified', 'failed')),
  provider    text,
  checked_at  timestamptz,
  result      jsonb,
  created_at  timestamptz not null default now()
);
alter table public.verifications enable row level security;
create policy own_verifications_read on public.verifications for select to authenticated using (user_id = auth.uid());

-- D17: "Report this invoice". Service role only; reviewed by hand in v1.
create table if not exists public.abuse_reports (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  reason      text check (reason is null or length(reason) <= 1000),
  reporter_ip_hash text,
  created_at  timestamptz not null default now()
);
alter table public.abuse_reports enable row level security;
-- No policies: browser roles can't read or write it.

-- issue_invoice: also set original_due_date and snapshot trust facts.
create or replace function public.issue_invoice(p_user uuid, p_invoice uuid, p_today date, p_actor text)
returns public.invoices
language plpgsql security definer set search_path = public as $$
declare
  inv invoices;
  prof profiles;
  cli clients;
  v_fy text;
  v_seq int;
  v_number text;
  v_terms int;
  v_account_created timestamptz;
begin
  select * into inv from invoices where id = p_invoice and user_id = p_user for update;
  if inv.id is null then raise exception 'DUES:invoice_not_found' using errcode = 'P0001'; end if;
  if inv.stage <> 'draft' then raise exception 'DUES:already_issued' using errcode = 'P0001'; end if;
  if inv.needs_review then raise exception 'DUES:needs_review' using errcode = 'P0001'; end if;
  if inv.total_paise <= 0 then raise exception 'DUES:zero_total' using errcode = 'P0001'; end if;
  if not exists (select 1 from invoice_items where invoice_id = inv.id) then
    raise exception 'DUES:no_items' using errcode = 'P0001';
  end if;

  select * into prof from profiles where user_id = p_user;
  if prof.business_name is null or prof.state_code is null or prof.address is null then
    raise exception 'DUES:profile_incomplete' using errcode = 'P0001';
  end if;
  if prof.upi_id is null and (prof.bank_account_number is null or prof.bank_ifsc is null) then
    raise exception 'DUES:profile_incomplete' using errcode = 'P0001';
  end if;
  select * into cli from clients where id = inv.client_id;
  select created_at into v_account_created from auth.users where id = p_user;

  v_fy := fy_for(p_today);
  insert into invoice_counters as ic (user_id, fy, last_seq) values (p_user, v_fy, 1)
    on conflict (user_id, fy) do update set last_seq = ic.last_seq + 1
    returning last_seq into v_seq;

  v_number := prof.invoice_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 4, '0');
  if length(v_number) > 16 then raise exception 'DUES:number_too_long' using errcode = 'P0001'; end if;

  v_terms := inv.due_date - inv.issue_date;

  update invoices set
    stage = 'issued',
    fy = v_fy,
    seq = v_seq,
    number = v_number,
    issue_date = p_today,
    due_date = p_today + v_terms,
    original_due_date = p_today + v_terms,
    public_id = encode(extensions.gen_random_bytes(16), 'hex'),
    seller_snapshot = jsonb_build_object(
      'business_name', prof.business_name, 'address', prof.address, 'gstin', prof.gstin, 'pan', prof.pan,
      'state_code', prof.state_code, 'upi_id', prof.upi_id, 'upi_name', prof.upi_name,
      'bank_account_name', prof.bank_account_name, 'bank_account_number', prof.bank_account_number,
      'bank_ifsc', prof.bank_ifsc, 'bank_details_changed_at', prof.bank_details_changed_at,
      'account_created_at', v_account_created),
    buyer_snapshot = jsonb_build_object(
      'name', cli.name, 'address', cli.address, 'gstin', cli.gstin, 'state_code', cli.state_code,
      'email', cli.email, 'phone', cli.phone),
    issued_at = now(),
    updated_at = now()
  where id = inv.id
  returning * into inv;

  insert into events (invoice_id, user_id, actor, type, payload)
  values (inv.id, p_user, p_actor, 'sent', jsonb_build_object('number', v_number, 'total_paise', inv.total_paise));

  return inv;
end $$;
revoke all on function public.issue_invoice(uuid, uuid, date, text) from public, anon, authenticated;
grant execute on function public.issue_invoice(uuid, uuid, date, text) to service_role;

-- D16: status is decided by confirmed money only; "payment reported" is a separate flag.
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
