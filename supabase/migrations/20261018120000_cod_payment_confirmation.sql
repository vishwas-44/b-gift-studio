-- COD is collected offline. Only this function may make its unpaid -> paid transition.
alter table public.orders
  add column if not exists cod_paid_at timestamptz,
  add column if not exists cod_payment_confirmed_by uuid references auth.users(id) on delete set null;

create index if not exists orders_cod_payment_review_idx
  on public.orders(payment_status, created_at desc)
  where payment_method = 'cash_on_delivery' and payment_status = 'unpaid';

create or replace function public.admin_confirm_cod_payment(
  p_order_id uuid,
  p_admin_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  -- The row lock serializes confirmation attempts. The second concurrent caller sees paid.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Order not found.';
  end if;
  if v_order.payment_method <> 'cash_on_delivery' then
    raise exception using errcode = '22023', message = 'Only Cash on Delivery orders can be confirmed here.';
  end if;
  if v_order.status = 'cancelled' then
    raise exception using errcode = '22023', message = 'A cancelled order cannot be marked as paid.';
  end if;
  if v_order.payment_status <> 'unpaid' then
    raise exception using errcode = 'P0001', message = 'This COD payment has already been confirmed or cannot be changed.';
  end if;

  update public.orders
  set payment_status = 'paid',
      cod_paid_at = now(),
      cod_payment_confirmed_by = p_admin_id,
      updated_at = now()
  where id = v_order.id and payment_status = 'unpaid'
  returning * into v_order;

  if not found then
    raise exception using errcode = 'P0001', message = 'This COD payment has already been confirmed or cannot be changed.';
  end if;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'payment_status', v_order.payment_status,
    'payment_method', v_order.payment_method,
    'cod_paid_at', v_order.cod_paid_at,
    'cod_payment_confirmed_by', v_order.cod_payment_confirmed_by
  );
end;
$$;

revoke all on function public.admin_confirm_cod_payment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_confirm_cod_payment(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
