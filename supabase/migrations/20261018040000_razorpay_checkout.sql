-- Stores only the provider order reference; payment secrets remain in the backend environment.
alter table public.orders add column if not exists razorpay_order_id text;
alter table public.orders add column if not exists razorpay_payment_id text;
create unique index if not exists orders_razorpay_order_id_uidx
  on public.orders(razorpay_order_id)
  where razorpay_order_id is not null;
create unique index if not exists orders_razorpay_payment_id_uidx
  on public.orders(razorpay_payment_id)
  where razorpay_payment_id is not null;

notify pgrst, 'reload schema';
