-- Checkout and order persistence. Run with `supabase db push` against the project.
-- Variants are catalogue data, not client-supplied authority.
alter table public.products
  add column if not exists variants jsonb not null default '[]'::jsonb;

update public.products set variants = '["White"]'::jsonb where slug = 'normal-white-mug';
update public.products set variants = jsonb_build_array('White ' || chr(194) || chr(183) || ' 600 ml') where slug = 'still-sipper-600ml';
update public.products set variants = '["Black"]'::jsonb where slug = 'magic-mug';
update public.products set variants = '["White"]'::jsonb where slug = 'personalized-pillow';
update public.products set variants = '["S", "M", "L", "XL"]'::jsonb where slug = 'personalized-tshirt';
update public.products set variants = '["Set of 20 photos"]'::jsonb where slug = 'portrait-cards-20';

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending',
  payment_status text not null default 'unpaid',
  subtotal numeric(12,2) not null,
  shipping_fee numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null,
  currency text not null default 'INR',
  shipping_address jsonb not null,
  recipient_details jsonb,
  customer_note text,
  payment_method text not null default 'test_unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists order_number text;
alter table public.orders add column if not exists currency text not null default 'INR';
alter table public.orders add column if not exists payment_method text not null default 'test_unpaid';
alter table public.orders alter column order_number set default ('BGS-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8)));
create unique index if not exists orders_order_number_uidx on public.orders(order_number);
create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  variant text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  customization_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.order_items add column if not exists variant text not null default '';
alter table public.order_items add column if not exists customization_snapshot jsonb not null default '{}'::jsonb;
create index if not exists order_items_order_idx on public.order_items(order_id);

create table if not exists public.customer_addresses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'India',
  updated_at timestamptz not null default now()
);
alter table public.customer_addresses enable row level security;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create or replace function public.create_customer_order(
  p_user_id uuid,
  p_items jsonb,
  p_shipping_address jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_line jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_subtotal numeric(12,2) := 0;
  v_currency text;
  v_lines jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_design_id uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception using errcode = '22023', message = 'Provide between 1 and 20 order items.';
  end if;

  -- Lock products in deterministic order so stock cannot be oversold by concurrent checkouts.
  for v_line in
    select value from jsonb_array_elements(p_items)
    order by (value->>'productId')
  loop
    begin
      v_product_id := (v_line->>'productId')::uuid;
      v_quantity := (v_line->>'quantity')::integer;
    exception when others then
      raise exception using errcode = '22023', message = 'Each item needs a valid product and quantity.';
    end;
    if v_quantity is null or v_quantity < 1 or v_quantity > 50 then
      raise exception using errcode = '22023', message = 'Each item quantity must be from 1 to 50.';
    end if;
    select * into v_product from public.products where id = v_product_id for update;
    if not found or not v_product.is_active then
      raise exception using errcode = '22023', message = 'A product is unavailable.';
    end if;
    if jsonb_typeof(v_product.variants) <> 'array' or not (v_product.variants ? (v_line->>'variant')) then
      raise exception using errcode = '22023', message = format('The selected variant for %s is unavailable.', v_product.name);
    end if;
    if v_product.stock_quantity is not null then
      if v_product.stock_quantity < v_quantity then
        raise exception using errcode = 'P0001', message = format('Insufficient stock for %s.', v_product.name);
      end if;
      update public.products set stock_quantity = stock_quantity - v_quantity where id = v_product_id;
    end if;
    if v_currency is null then v_currency := coalesce(v_product.currency, 'INR');
    elsif v_currency <> coalesce(v_product.currency, 'INR') then
      raise exception using errcode = '22023', message = 'Products with different currencies cannot be ordered together.';
    end if;

    v_snapshot := '{}'::jsonb;
    if coalesce(v_line->>'designId', '') <> '' then
      begin v_design_id := (v_line->>'designId')::uuid;
      exception when others then raise exception using errcode = '22023', message = 'Invalid saved design reference.'; end;
      select jsonb_build_object(
        'designId', d.id,
        'designName', d.design_name,
        'productId', d.product_id,
        'designData', d.design_data
      ) into v_snapshot
      from public.saved_designs d
      where d.id = v_design_id and d.user_id = p_user_id and d.status = 'draft' and d.product_id = v_product_id;
      if v_snapshot is null then
        raise exception using errcode = '22023', message = 'A customized design is unavailable. Reopen and save the design, then retry.';
      end if;
      if coalesce(v_snapshot->'designData'->>'variant', '') <> (v_line->>'variant') then
        raise exception using errcode = '22023', message = 'The cart variant does not match its saved design.';
      end if;
      if coalesce(v_snapshot->'designData'->>'assetId', '') <> '' and not exists (
        select 1 from public.design_assets a
        where a.id = (v_snapshot->'designData'->>'assetId')::uuid
          and a.user_id = p_user_id and a.deleted_at is null
      ) then
        raise exception using errcode = '22023', message = 'The saved design image is unavailable.';
      end if;
    end if;

    v_subtotal := v_subtotal + (v_product.price::numeric * v_quantity);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'product_name', v_product.name,
      'variant', v_line->>'variant',
      'quantity', v_quantity,
      'unit_price', v_product.price,
      'customization_snapshot', v_snapshot
    ));
  end loop;

  insert into public.orders (user_id, subtotal, shipping_fee, tax_amount, total_amount, currency, shipping_address, payment_status, payment_method)
  values (p_user_id, v_subtotal, 0, 0, v_subtotal, coalesce(v_currency, 'INR'), p_shipping_address, 'unpaid', 'test_unpaid')
  returning * into v_order;

  insert into public.customer_addresses (user_id, full_name, phone, address_line1, address_line2, city, state, postal_code, country, updated_at)
  values (
    p_user_id,
    p_shipping_address->>'fullName',
    p_shipping_address->>'phone',
    p_shipping_address->>'addressLine1',
    nullif(p_shipping_address->>'addressLine2', ''),
    p_shipping_address->>'city',
    p_shipping_address->>'state',
    p_shipping_address->>'postalCode',
    coalesce(nullif(p_shipping_address->>'country', ''), 'India'),
    now()
  )
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    address_line1 = excluded.address_line1,
    address_line2 = excluded.address_line2,
    city = excluded.city,
    state = excluded.state,
    postal_code = excluded.postal_code,
    country = excluded.country,
    updated_at = now();

  insert into public.order_items (order_id, product_id, product_name, variant, quantity, unit_price, customization_snapshot)
  select v_order.id, (x->>'product_id')::uuid, x->>'product_name', x->>'variant', (x->>'quantity')::integer, (x->>'unit_price')::numeric, x->'customization_snapshot'
  from jsonb_array_elements(v_lines) x;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'payment_status', v_order.payment_status,
    'payment_method', v_order.payment_method,
    'subtotal', v_order.subtotal,
    'shipping_fee', v_order.shipping_fee,
    'tax_amount', v_order.tax_amount,
    'total_amount', v_order.total_amount,
    'currency', v_order.currency,
    'shipping_address', v_order.shipping_address,
    'created_at', v_order.created_at,
    'items', v_lines
  );
end;
$$;

revoke all on function public.create_customer_order(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_customer_order(uuid, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';

