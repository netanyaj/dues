-- Postgres regex repetition counts max out at 255; {2,256} errored on every UPI save.
alter table public.profiles drop constraint if exists profiles_upi_id_check;
alter table public.profiles add constraint profiles_upi_id_check
  check (upi_id is null or upi_id ~ '^[a-zA-Z0-9._-]{2,200}@[a-zA-Z][a-zA-Z0-9]{1,63}$');
