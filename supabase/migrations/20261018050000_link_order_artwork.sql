-- Keep customer artwork associated with the order item that uses it.
-- The design asset delete endpoint refuses to remove assets with order_item_id.
create or replace function public.link_order_item_design_asset()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_asset_id uuid;
  v_user_id uuid;
begin
  begin
    v_asset_id := nullif(new.customization_snapshot #>> '{designData,assetId}', '')::uuid;
  exception when invalid_text_representation then
    return new;
  end;

  if v_asset_id is null then
    return new;
  end if;

  select user_id into v_user_id
  from public.orders
  where id = new.order_id;

  update public.design_assets
  set order_item_id = new.id
  where id = v_asset_id
    and user_id = v_user_id
    and deleted_at is null
    and order_item_id is null;

  return new;
end;
$$;

revoke all on function public.link_order_item_design_asset() from public, anon, authenticated;
grant execute on function public.link_order_item_design_asset() to service_role;

drop trigger if exists order_items_link_design_asset on public.order_items;
create trigger order_items_link_design_asset
after insert on public.order_items
for each row execute function public.link_order_item_design_asset();

notify pgrst, 'reload schema';
