-- Retry-safe email notification history. Only the service role can access it.
create table if not exists public.order_notification_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_key text not null unique,
  notification_type text not null,
  recipient_email text,
  provider text not null default 'resend',
  attempt_count integer not null default 0,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'accepted', 'failed')),
  provider_message_id text,
  error_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_notification_events_order_idx
  on public.order_notification_events(order_id, created_at desc);
alter table public.order_notification_events enable row level security;
revoke all on public.order_notification_events from public, anon, authenticated;
grant all on public.order_notification_events to service_role;

-- Checkout retry key makes concurrent submissions and refresh retries return the same order.
alter table public.orders add column if not exists checkout_request_key uuid;
create unique index if not exists orders_user_checkout_request_uidx
  on public.orders(user_id, checkout_request_key) where checkout_request_key is not null;

create or replace function public.create_customer_order_idempotent(
  p_user_id uuid,
  p_items jsonb,
  p_shipping_address jsonb,
  p_request_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_result jsonb;
  v_items jsonb;
begin
  if p_request_key is null then
    raise exception using errcode = '22023', message = 'A checkout request key is required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_request_key::text, 0));
  select * into v_order from public.orders
    where user_id = p_user_id and checkout_request_key = p_request_key;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', product_id, 'product_name', product_name, 'variant', variant,
      'quantity', quantity, 'unit_price', unit_price, 'customization_snapshot', customization_snapshot
    ) order by created_at), '[]'::jsonb) into v_items
    from public.order_items where order_id = v_order.id;
    return jsonb_build_object(
      'id', v_order.id, 'order_number', v_order.order_number, 'status', v_order.status,
      'payment_status', v_order.payment_status, 'payment_method', v_order.payment_method,
      'subtotal', v_order.subtotal, 'shipping_fee', v_order.shipping_fee, 'tax_amount', v_order.tax_amount,
      'total_amount', v_order.total_amount, 'currency', v_order.currency, 'razorpay_order_id', v_order.razorpay_order_id,
      'shipping_address', v_order.shipping_address, 'created_at', v_order.created_at, 'items', v_items
    );
  end if;
  v_result := public.create_customer_order(p_user_id, p_items, p_shipping_address);
  update public.orders set checkout_request_key = p_request_key where id = (v_result->>'id')::uuid;
  return v_result;
end;
$$;

revoke all on function public.create_customer_order_idempotent(uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_customer_order_idempotent(uuid, jsonb, jsonb, uuid) to service_role;
notify pgrst, 'reload schema';
