-- Target project: SKAPS Spare Parts Inventory (zlezuqshhrqdokieekxe, us-east-1)
--
-- A leading apostrophe is Excel's "store this as text" marker and disappears
-- when the sheet is saved, so 'Ideal' Toggle Switch in the database arrives as
-- Ideal' Toggle Switch. Comparisons drop one leading apostrophe on both sides.

create or replace function public.import_norm_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      btrim(regexp_replace(regexp_replace(p_value, '_x000D_?', ' ', 'gi'), '\s+', ' ', 'g')),
      '^''', ''
    ),
    ''
  )
$$;
