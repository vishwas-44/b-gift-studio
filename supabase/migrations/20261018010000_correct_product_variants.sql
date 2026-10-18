-- Correct product slugs and variant text to match the live catalogue.
-- This is a follow-up because the first checkout migration was already run.
update public.products set variants = '["White"]'::jsonb where slug = 'normal-white-mug';
update public.products set variants = jsonb_build_array('White ' || chr(194) || chr(183) || ' 600 ml') where slug = 'still-sipper-600ml';
update public.products set variants = '["Black"]'::jsonb where slug = 'magic-mug';
update public.products set variants = '["White"]'::jsonb where slug = 'personalized-pillow';
update public.products set variants = '["S", "M", "L", "XL"]'::jsonb where slug = 'personalized-tshirt';
update public.products set variants = '["Set of 20 photos"]'::jsonb where slug = 'portrait-cards-20';

notify pgrst, 'reload schema';
