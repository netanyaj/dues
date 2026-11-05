-- D40: optional proof of payment on a client's "I've paid". Private bucket; only the
-- service role reads or writes it, and the owner sees a short-lived signed URL.
alter table public.payments add column if not exists proof_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
