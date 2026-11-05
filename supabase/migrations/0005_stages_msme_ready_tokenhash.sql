-- D19 reminder stages, D20 MSME, D24 ready-to-send, D25 hashed MCP token.

-- D19
alter table public.reminders add column if not exists stage int check (stage is null or stage between 1 and 3);

-- D20
alter table public.profiles add column if not exists udyam_number text
  check (udyam_number is null or udyam_number ~ '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$');
alter table public.profiles add column if not exists msme_category text
  check (msme_category is null or msme_category in ('micro', 'small', 'medium'));
alter table public.profiles drop constraint if exists udyam_needs_category;
alter table public.profiles add constraint udyam_needs_category
  check ((udyam_number is null) = (msme_category is null));

-- D24
alter table public.invoices add column if not exists ready_to_send_at timestamptz;

-- D25: store only a hash of the MCP token. The plain token is shown once by the app.
alter table public.profiles add column if not exists mcp_token_hash text unique;
alter table public.profiles add column if not exists mcp_token_last4 text;
update public.profiles
   set mcp_token_hash = encode(extensions.digest(mcp_token, 'sha256'), 'hex'),
       mcp_token_last4 = right(mcp_token, 4)
 where mcp_token is not null and mcp_token_hash is null;
alter table public.profiles drop column if exists mcp_token;

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
      'account_created_at', v_account_created,
      'udyam_number', prof.udyam_number, 'msme_category', prof.msme_category),
    buyer_snapshot = jsonb_build_object(
      'name', cli.name, 'address', cli.address, 'gstin', cli.gstin, 'state_code', cli.state_code,
      'email', cli.email, 'phone', cli.phone),
    issued_at = now(),
    ready_to_send_at = null,
    updated_at = now()
  where id = inv.id
  returning * into inv;

  insert into events (invoice_id, user_id, actor, type, payload)
  values (inv.id, p_user, p_actor, 'sent', jsonb_build_object('number', v_number, 'total_paise', inv.total_paise));

  return inv;
end $$;
revoke all on function public.issue_invoice(uuid, uuid, date, text) from public, anon, authenticated;
grant execute on function public.issue_invoice(uuid, uuid, date, text) to service_role;
