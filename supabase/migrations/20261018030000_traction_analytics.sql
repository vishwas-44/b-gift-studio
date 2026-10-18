-- Anonymous first-party storefront activity for the admin traction dashboard.
-- Do not store names, email addresses, IP addresses, referrers or design content.
create table if not exists public.storefront_analytics_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  event_type text not null check (event_type in ('page_view', 'product_view', 'add_to_cart', 'checkout_started')),
  page_path text not null check (char_length(page_path) between 1 and 300),
  product_slug text check (product_slug is null or char_length(product_slug) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists storefront_analytics_events_created_at_idx
  on public.storefront_analytics_events (created_at desc);
create index if not exists storefront_analytics_events_type_date_idx
  on public.storefront_analytics_events (event_type, created_at desc);

alter table public.storefront_analytics_events enable row level security;
revoke all on public.storefront_analytics_events from anon, authenticated;
grant select, insert, delete on public.storefront_analytics_events to service_role;

create or replace function public.admin_traction_summary(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with windowed_events as (
    select * from public.storefront_analytics_events
    where created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)))
  ),
  activity as (
    select
      count(*) filter (where event_type = 'page_view') as page_views,
      count(distinct session_id) filter (where event_type = 'page_view') as visitors,
      count(*) filter (where event_type = 'product_view') as product_views,
      count(*) filter (where event_type = 'add_to_cart') as add_to_cart,
      count(*) filter (where event_type = 'checkout_started') as checkout_starts
    from windowed_events
  ),
  order_activity as (
    select count(*) as orders,
      count(*) filter (where payment_status = 'paid') as paid_orders,
      coalesce(sum(total_amount), 0) as order_value,
      coalesce(sum(total_amount) filter (where payment_status = 'paid'), 0) as paid_value
    from public.orders
    where created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)))
      and status <> 'cancelled'
  ),
  trend as (
    select coalesce(jsonb_agg(jsonb_build_object('date', d.day::date, 'visitors', coalesce(v.visitors, 0), 'orders', coalesce(o.orders, 0)) order by d.day), '[]'::jsonb) as days
    from generate_series(current_date - (greatest(1, least(coalesce(p_days, 30), 90)) - 1), current_date, interval '1 day') d(day)
    left join lateral (
      select count(distinct session_id) as visitors
      from public.storefront_analytics_events e
      where e.event_type = 'page_view' and e.created_at >= d.day and e.created_at < d.day + interval '1 day'
    ) v on true
    left join lateral (
      select count(*) as orders from public.orders o
      where o.created_at >= d.day and o.created_at < d.day + interval '1 day' and o.status <> 'cancelled'
    ) o on true
  )
  select jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 90)),
    'page_views', a.page_views,
    'visitors', a.visitors,
    'product_views', a.product_views,
    'add_to_cart', a.add_to_cart,
    'checkout_starts', a.checkout_starts,
    'orders', oa.orders,
    'paid_orders', oa.paid_orders,
    'order_value', oa.order_value,
    'paid_value', oa.paid_value,
    'trend', t.days
  )
  from activity a cross join order_activity oa cross join trend t;
$$;

revoke all on function public.admin_traction_summary(integer) from public, anon, authenticated;
grant execute on function public.admin_traction_summary(integer) to service_role;
