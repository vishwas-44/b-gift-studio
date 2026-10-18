-- Store courier invoices and who is responsible for paying them.
alter table public.orders
  add column if not exists courier_charge numeric(12, 2) not null default 0,
  add column if not exists courier_charge_paid_by text not null default 'admin',
  add column if not exists courier_charge_payment_status text not null default 'paid';

alter table public.orders
  drop constraint if exists orders_courier_charge_paid_by_check,
  add constraint orders_courier_charge_paid_by_check
    check (courier_charge_paid_by in ('admin', 'customer')),
  drop constraint if exists orders_courier_charge_payment_status_check,
  add constraint orders_courier_charge_payment_status_check
    check (courier_charge_payment_status in ('paid', 'unpaid')),
  drop constraint if exists orders_courier_charge_nonnegative_check,
  add constraint orders_courier_charge_nonnegative_check check (courier_charge >= 0),
  drop constraint if exists orders_courier_charge_admin_paid_check,
  add constraint orders_courier_charge_admin_paid_check
    check (courier_charge_paid_by <> 'admin' or courier_charge_payment_status = 'paid');

drop function if exists public.admin_update_order_fulfillment(uuid, uuid, text, boolean, text, text, text, date, text);

create function public.admin_update_order_fulfillment(
  p_order_id uuid,
  p_admin_id uuid,
  p_status text,
  p_confirm_handover boolean default false,
  p_courier_company text default null,
  p_custom_courier_name text default null,
  p_tracking_id text default null,
  p_shipment_date date default null,
  p_tracking_url text default null,
  p_courier_charge numeric default 0,
  p_courier_charge_paid_by text default 'admin',
  p_courier_charge_payment_status text default 'paid'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_previous_status text;
  v_shipped boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Order not found.';
  end if;
  v_previous_status := v_order.status;
  if p_status not in ('pending', 'processing', 'shipped', 'delivered', 'cancelled') then
    raise exception using errcode = '22023', message = 'Invalid order status.';
  end if;
  if p_status <> v_order.status and not (
    (v_order.status = 'pending' and p_status in ('processing', 'cancelled')) or
    (v_order.status = 'processing' and p_status in ('shipped', 'cancelled')) or
    (v_order.status = 'shipped' and p_status = 'delivered')
  ) then
    raise exception using errcode = '22023', message = format('Status cannot change from %s to %s.', v_order.status, p_status);
  end if;
  v_shipped := p_status = 'shipped';
  if v_shipped and not coalesce(p_confirm_handover, false) then
    raise exception using errcode = '22023', message = 'Confirm that the courier has accepted the parcel before marking it shipped.';
  end if;
  if v_shipped and (
    coalesce(p_courier_company, '') not in ('FedEx', 'DHL', 'Other') or
    (p_courier_company = 'Other' and coalesce(trim(p_custom_courier_name), '') = '') or
    coalesce(trim(p_tracking_id), '') = '' or p_shipment_date is null or
    coalesce(trim(p_tracking_url), '') = ''
  ) then
    raise exception using errcode = '22023', message = 'Save the courier, tracking ID, handover date and tracking URL before marking shipped.';
  end if;
  if p_courier_charge is null or p_courier_charge < 0 or p_courier_charge > 1000000 or
     p_courier_charge_paid_by is null or p_courier_charge_payment_status is null or
     p_courier_charge_paid_by not in ('admin', 'customer') or
     p_courier_charge_payment_status not in ('paid', 'unpaid') or
     (p_courier_charge_paid_by = 'admin' and p_courier_charge_payment_status <> 'paid') then
    raise exception using errcode = '22023', message = 'Courier bill details are invalid.';
  end if;

  update public.orders set
    status = p_status,
    courier_company = coalesce(nullif(trim(p_courier_company), ''), courier_company),
    custom_courier_name = case when p_courier_company = 'Other' then nullif(trim(p_custom_courier_name), '') else null end,
    tracking_id = coalesce(nullif(trim(p_tracking_id), ''), tracking_id),
    shipment_date = coalesce(p_shipment_date, shipment_date),
    tracking_url = coalesce(nullif(trim(p_tracking_url), ''), tracking_url),
    courier_charge = p_courier_charge,
    courier_charge_paid_by = p_courier_charge_paid_by,
    courier_charge_payment_status = p_courier_charge_payment_status,
    shipment_created_at = case when v_shipped and shipment_created_at is null then now() else shipment_created_at end,
    shipment_updated_at = case when v_shipped then now() else shipment_updated_at end,
    updated_at = now()
  where id = p_order_id returning * into v_order;

  if p_status <> v_previous_status or v_shipped then
    insert into public.order_status_history(order_id, previous_status, new_status, changed_by, note)
    values (p_order_id, v_previous_status, p_status, p_admin_id,
      case when v_shipped then 'Courier handover, tracking and courier bill saved.' else null end);
  end if;
  return to_jsonb(v_order);
end;
$$;

revoke all on function public.admin_update_order_fulfillment(uuid, uuid, text, boolean, text, text, text, date, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_order_fulfillment(uuid, uuid, text, boolean, text, text, text, date, text, numeric, text, text) to service_role;
notify pgrst, 'reload schema';
