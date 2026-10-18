-- Manual UPI QR payments remain unpaid until an admin checks the merchant bank account.
alter table public.orders
  add column if not exists manual_payment_reference text,
  add column if not exists manual_payment_reference_submitted_at timestamptz,
  add column if not exists payment_verified_at timestamptz,
  add column if not exists payment_verified_by uuid references auth.users(id) on delete set null;

alter table public.orders
  drop constraint if exists orders_manual_payment_reference_length_check,
  add constraint orders_manual_payment_reference_length_check
    check (manual_payment_reference is null or char_length(manual_payment_reference) between 8 and 100);

create index if not exists orders_manual_payment_review_idx
  on public.orders(payment_status, created_at desc)
  where payment_method = 'manual_upi_qr' and payment_status = 'unpaid';

notify pgrst, 'reload schema';
