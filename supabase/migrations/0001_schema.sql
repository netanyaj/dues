-- Dues schema. Money is integer paise everywhere. See DECISIONS.md.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  business_name       text,
  address             text,
  gstin               text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  pan                 text check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  state_code          text check (state_code is null or state_code ~ '^[0-9]{2}$'),
  default_sac         text not null default '998391' check (default_sac ~ '^[0-9]{4,8}$'),
  upi_id              text check (upi_id is null or upi_id ~ '^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$'),
  upi_name            text,
  bank_account_name   text,
  bank_account_number text check (bank_account_number is null or bank_account_number ~ '^[0-9]{9,18}$'),
  bank_ifsc           text check (bank_ifsc is null or bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  invoice_prefix      text not null default 'INV' check (invoice_prefix ~ '^[A-Z0-9]{1,3}$'),
  mcp_token           text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint gstin_state_match check (gstin is null or substr(gstin, 1, 2) = state_code),
  constraint gstin_pan_match check (gstin is null or pan is null or substr(gstin, 3, 10) = pan)
);

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  email       text,
  phone       text,
  address     text,
  gstin       text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  state_code  text not null check (state_code ~ '^[0-9]{2}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint client_gstin_state_match check (gstin is null or substr(gstin, 1, 2) = state_code)
);
create unique index clients_user_name_uniq on public.clients (user_id, lower(trim(name)));

create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  client_id           uuid not null references public.clients(id) on delete restrict,
  stage               text not null default 'draft' check (stage in ('draft', 'issued', 'cancelled')),
  number              text check (number is null or length(number) <= 16),
  fy                  text,
  seq                 int,
  needs_review        boolean not null default false,
  review_reason       text,
  issue_date          date not null,
  due_date            date not null,
  gst_rate            int not null check (gst_rate in (0, 5, 12, 18, 28)),
  gst_applicable      boolean not null default true,
  subtotal_paise      bigint not null default 0 check (subtotal_paise >= 0),
  cgst_paise          bigint not null default 0 check (cgst_paise >= 0),
  sgst_paise          bigint not null default 0 check (sgst_paise >= 0),
  igst_paise          bigint not null default 0 check (igst_paise >= 0),
  total_paise         bigint not null default 0 check (total_paise >= 0),
  claimed_total_paise bigint,
  public_id           text unique,
  notes               text,
  source              text not null default 'app' check (source in ('claude', 'app')),
  seller_snapshot     jsonb,
  buyer_snapshot      jsonb,
  issued_at           timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint due_after_issue check (due_date >= issue_date),
  constraint totals_add_up check (total_paise = subtotal_paise + cgst_paise + sgst_paise + igst_paise),
  constraint issued_has_number check (stage = 'draft' or (number is not null and fy is not null and seq is not null and public_id is not null)),
  constraint draft_has_no_number check (stage <> 'draft' or (number is null and public_id is null))
);
create unique index invoices_user_fy_seq_uniq on public.invoices (user_id, fy, seq) where seq is not null;
create index invoices_user_idx on public.invoices (user_id, created_at desc);

create table public.invoice_items (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  position      int not null,
  description   text not null check (length(trim(description)) between 1 and 300),
  sac           text not null check (sac ~ '^[0-9]{4,8}$'),
  qty           numeric(12, 3) not null check (qty > 0),
  rate_paise    bigint not null check (rate_paise >= 0),
  amount_paise  bigint not null check (amount_paise >= 0),
  unique (invoice_id, position)
);

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  amount_paise  bigint not null check (amount_paise >= 0),
  tds_paise     bigint not null default 0 check (tds_paise >= 0),
  method        text not null default 'other' check (method in ('upi', 'bank_transfer', 'other')),
  utr           text,
  paid_on       date not null,
  reported_by   text not null check (reported_by in ('client', 'user', 'claude')),
  status        text not null check (status in ('reported', 'confirmed', 'rejected')),
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  constraint payment_nonzero check (amount_paise + tds_paise > 0)
);
create index payments_invoice_idx on public.payments (invoice_id);

create table public.events (
  id          bigint generated always as identity primary key,
  invoice_id  uuid references public.invoices(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  actor       text not null check (actor in ('claude', 'user', 'client', 'system')),
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index events_invoice_idx on public.events (invoice_id, created_at);
create index events_user_idx on public.events (user_id, created_at desc);
create unique index events_became_overdue_once on public.events (invoice_id) where type = 'became_overdue';

create table public.reminders (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  message         text not null check (length(message) between 1 and 2000),
  channel         text not null check (channel in ('whatsapp', 'email')),
  created_by      text not null default 'claude' check (created_by in ('claude', 'user')),
  created_at      timestamptz not null default now(),
  sent_marked_at  timestamptz
);

-- One row per user per financial year. Only touched inside issue_invoice().
create table public.invoice_counters (
  user_id   uuid not null references auth.users(id) on delete cascade,
  fy        text not null,
  last_seq  int not null,
  primary key (user_id, fy)
);

-- ---------------------------------------------------------------------------
-- Row-level security: every table, own rows only.
-- The server's service layer uses the service role; RLS is the second line.
-- ---------------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.clients          enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_items    enable row level security;
alter table public.payments         enable row level security;
alter table public.events           enable row level security;
alter table public.reminders        enable row level security;
alter table public.invoice_counters enable row level security;

create policy own_profile   on public.profiles      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_clients   on public.clients       for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Invoices, items, payments: read-only from the browser. All writes go through the server.
create policy own_invoices_read on public.invoices      for select to authenticated using (user_id = auth.uid());
create policy own_items_read    on public.invoice_items for select to authenticated using (user_id = auth.uid());
create policy own_payments_read on public.payments      for select to authenticated using (user_id = auth.uid());
create policy own_events_read   on public.events        for select to authenticated using (user_id = auth.uid());
create policy own_reminders_read on public.reminders    for select to authenticated using (user_id = auth.uid());
-- invoice_counters: no policies at all, so only the service role can touch it.

-- ---------------------------------------------------------------------------
-- Derived status (DECISIONS.md D4). One definition for app, filters and MCP.
-- ---------------------------------------------------------------------------

create or replace function public.ist_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace view public.invoice_view with (security_invoker = true) as
with pay as (
  select invoice_id,
         coalesce(sum(amount_paise) filter (where status = 'confirmed'), 0) as confirmed_paise,
         coalesce(sum(tds_paise)    filter (where status = 'confirmed'), 0) as tds_paise,
         count(*) filter (where status = 'reported') as pending_reports
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
  greatest(i.total_paise - coalesce(p.confirmed_paise, 0) - coalesce(p.tds_paise, 0), 0) as balance_paise,
  case
    when i.stage = 'cancelled' then 'cancelled'
    when i.stage = 'draft' then 'draft'
    when coalesce(p.confirmed_paise, 0) + coalesce(p.tds_paise, 0) >= i.total_paise then 'paid'
    when coalesce(p.pending_reports, 0) > 0 then 'payment_reported'
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

-- ---------------------------------------------------------------------------
-- save_draft: insert or update a draft and replace its items atomically.
-- Totals are computed by the TypeScript service layer and passed in; this
-- function enforces "drafts only" and ownership.
-- ---------------------------------------------------------------------------

create or replace function public.save_draft(p_user uuid, p_invoice jsonb, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p_invoice->>'id', '')::uuid;
  v_stage text;
  v_item jsonb;
  v_pos int := 0;
begin
  if not exists (select 1 from clients where id = (p_invoice->>'client_id')::uuid and user_id = p_user) then
    raise exception 'DUES:client_not_found' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into invoices (user_id, client_id, issue_date, due_date, gst_rate, gst_applicable,
                          subtotal_paise, cgst_paise, sgst_paise, igst_paise, total_paise,
                          claimed_total_paise, needs_review, review_reason, notes, source)
    values (p_user, (p_invoice->>'client_id')::uuid, (p_invoice->>'issue_date')::date, (p_invoice->>'due_date')::date,
            (p_invoice->>'gst_rate')::int, (p_invoice->>'gst_applicable')::boolean,
            (p_invoice->>'subtotal_paise')::bigint, (p_invoice->>'cgst_paise')::bigint, (p_invoice->>'sgst_paise')::bigint,
            (p_invoice->>'igst_paise')::bigint, (p_invoice->>'total_paise')::bigint,
            nullif(p_invoice->>'claimed_total_paise', '')::bigint, (p_invoice->>'needs_review')::boolean,
            p_invoice->>'review_reason', p_invoice->>'notes', p_invoice->>'source')
    returning id into v_id;
  else
    select stage into v_stage from invoices where id = v_id and user_id = p_user for update;
    if v_stage is null then raise exception 'DUES:invoice_not_found' using errcode = 'P0001'; end if;
    if v_stage <> 'draft' then raise exception 'DUES:invoice_locked' using errcode = 'P0001'; end if;
    update invoices set
      client_id = (p_invoice->>'client_id')::uuid,
      issue_date = (p_invoice->>'issue_date')::date,
      due_date = (p_invoice->>'due_date')::date,
      gst_rate = (p_invoice->>'gst_rate')::int,
      gst_applicable = (p_invoice->>'gst_applicable')::boolean,
      subtotal_paise = (p_invoice->>'subtotal_paise')::bigint,
      cgst_paise = (p_invoice->>'cgst_paise')::bigint,
      sgst_paise = (p_invoice->>'sgst_paise')::bigint,
      igst_paise = (p_invoice->>'igst_paise')::bigint,
      total_paise = (p_invoice->>'total_paise')::bigint,
      claimed_total_paise = nullif(p_invoice->>'claimed_total_paise', '')::bigint,
      needs_review = (p_invoice->>'needs_review')::boolean,
      review_reason = p_invoice->>'review_reason',
      notes = p_invoice->>'notes',
      updated_at = now()
    where id = v_id;
    delete from invoice_items where invoice_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into invoice_items (invoice_id, user_id, position, description, sac, qty, rate_paise, amount_paise)
    values (v_id, p_user, v_pos, v_item->>'description', v_item->>'sac', (v_item->>'qty')::numeric,
            (v_item->>'rate_paise')::bigint, (v_item->>'amount_paise')::bigint);
    v_pos := v_pos + 1;
  end loop;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- issue_invoice: the only way a number is ever allocated (DECISIONS.md D1, D2, D7).
-- One transaction: lock draft, bump counter, set number, dates, public id, snapshots.
-- ---------------------------------------------------------------------------

create or replace function public.fy_for(d date) returns text
language sql immutable as $$
  select case when extract(month from d) >= 4
    then extract(year from d)::int || '-' || lpad(((extract(year from d)::int + 1) % 100)::text, 2, '0')
    else (extract(year from d)::int - 1) || '-' || lpad((extract(year from d)::int % 100)::text, 2, '0')
  end
$$;

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
  select * into cli from clients where id = inv.client_id;

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
    public_id = encode(extensions.gen_random_bytes(16), 'hex'),
    seller_snapshot = jsonb_build_object(
      'business_name', prof.business_name, 'address', prof.address, 'gstin', prof.gstin, 'pan', prof.pan,
      'state_code', prof.state_code, 'upi_id', prof.upi_id, 'upi_name', prof.upi_name,
      'bank_account_name', prof.bank_account_name, 'bank_account_number', prof.bank_account_number,
      'bank_ifsc', prof.bank_ifsc),
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

-- Only the server (service role) may call functions that take a user id.
revoke all on function public.save_draft(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.issue_invoice(uuid, uuid, date, text) from public, anon, authenticated;
grant execute on function public.save_draft(uuid, jsonb, jsonb) to service_role;
grant execute on function public.issue_invoice(uuid, uuid, date, text) to service_role;

-- Create an empty profile row (with its MCP token) for every new user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
