-- Preserve each photo in a multi-image design as its own private asset through checkout.
create or replace function public.link_order_item_design_asset()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_asset_id uuid;
  v_user_id uuid;
  v_asset_ids jsonb;
begin
  select user_id into v_user_id
  from public.orders
  where id = new.order_id;

  v_asset_ids := coalesce(new.customization_snapshot #> '{designData,assetIds}', '[]'::jsonb);
  if jsonb_typeof(v_asset_ids) = 'array' then
    for v_asset_id in
      select value::uuid
      from jsonb_array_elements_text(v_asset_ids)
      where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    loop
      update public.design_assets
      set order_item_id = new.id
      where id = v_asset_id
        and user_id = v_user_id
        and deleted_at is null
        and order_item_id is null;
    end loop;
  end if;

  -- Keep legacy single-image designs working.
  begin
    v_asset_id := nullif(new.customization_snapshot #>> '{designData,assetId}', '')::uuid;
  exception when invalid_text_representation then
    return new;
  end;

  if v_asset_id is not null then
    update public.design_assets
    set order_item_id = new.id
    where id = v_asset_id
      and user_id = v_user_id
      and deleted_at is null
      and order_item_id is null;
  end if;
  return new;
end;
$$;

revoke all on function public.link_order_item_design_asset() from public, anon, authenticated;
grant execute on function public.link_order_item_design_asset() to service_role;

notify pgrst, 'reload schema';
