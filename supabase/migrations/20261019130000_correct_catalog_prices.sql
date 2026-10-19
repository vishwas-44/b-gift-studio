-- Keep the live Supabase catalogue aligned with the approved storefront catalogue.
-- Checkout and the order RPC both use products.price from this table.
update public.products
set price = 759
where slug = 'still-sipper-600ml'
  and price is distinct from 759;

update public.products
set price = 449
where slug = 'magic-mug'
  and price is distinct from 449;
