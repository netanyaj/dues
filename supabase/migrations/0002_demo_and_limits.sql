-- Demo accounts (DECISIONS.md D13) and the per-account invoice cap (D12).

alter table public.profiles add column if not exists is_demo boolean not null default false;

-- Users must not flip is_demo or rotate their token from the browser.
-- Profile writes from the browser are not used by the app; restrict to read.
drop policy if exists own_profile on public.profiles;
create policy own_profile_read on public.profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists own_clients on public.clients;
create policy own_clients_read on public.clients for select to authenticated using (user_id = auth.uid());

create or replace function public.enforce_invoice_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from invoices where user_id = new.user_id) >= 50 then
    raise exception 'DUES:invoice_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists invoice_cap on public.invoices;
create trigger invoice_cap before insert on public.invoices
  for each row execute function public.enforce_invoice_cap();
