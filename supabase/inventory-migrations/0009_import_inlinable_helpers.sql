-- Target project: SKAPS Spare Parts Inventory (zlezuqshhrqdokieekxe, us-east-1)
--
-- Performance. inventory_import_untouched() took ~8.7s for a full sheet and
-- hit the statement timeout, so the preview silently lost its "left as-is"
-- summary.
--
-- * A SQL function with a SET clause is never inlined, so each call to the
--   text helpers ran as its own sub-query (~66k calls). They are now single
--   expressions with no SET clause, so Postgres inlines them (measured 23x
--   faster, identical output on all 10,954 bins). Instead of a pinned
--   search_path they reference only built-ins, which always resolve from
--   pg_catalog first, and schema-qualify the one cross-call.
-- * inventory_import_untouched() computes each side's match keys once, then
--   anti-joins on plain columns (hashable) instead of calling a function
--   inside a correlated NOT EXISTS.

create or replace function public.import_norm_text(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.regexp_replace(p_value, '_x000D_?', ' ', 'gi'), '\s+', ' ', 'g')),
      '^''', ''
    ),
    ''
  )
$$;

create or replace function public.import_same_text(p_a text, p_b text)
returns boolean
language sql
immutable
parallel safe
as $$
  select case
    when public.import_norm_text(p_a) is not distinct from public.import_norm_text(p_b) then true
    when public.import_norm_text(p_a) ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$'
     and public.import_norm_text(p_b) ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$'
      then public.import_norm_text(p_a)::numeric = public.import_norm_text(p_b)::numeric
    else false
  end
$$;

create or replace function public.import_match_key(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when public.import_norm_text(p_value) ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$'
      then '#' || pg_catalog.trim_scale(public.import_norm_text(p_value)::numeric)::text
    else coalesce(public.import_norm_text(p_value), '')
  end
$$;

create or replace function public.inventory_import_untouched(p_keys jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with k as materialized (
    select distinct
      btrim(e->>0) as skaps,
      public.import_match_key(e->>1) as zone,
      public.import_match_key(e->>2) as loc,
      public.import_match_key(e->>3) as whs
    from jsonb_array_elements(p_keys) e
  ),
  ks as materialized (select distinct skaps from k),
  bins as materialized (
    select
      p.skaps_number as skaps,
      public.import_match_key(ir.zone) as zone,
      public.import_match_key(ir.location_code) as loc,
      public.import_match_key(ir.warehouse_description) as whs,
      ir.zone as raw_zone,
      ir.location_code,
      ir.warehouse_description,
      ir.quantity
    from public.inventory_records ir
    join public.parts p on p.part_id = ir.part_id
    join ks on ks.skaps = p.skaps_number
    where ir.active and p.active
  ),
  missing_bins as (
    select b.skaps as skaps_number, b.raw_zone as zone, b.location_code, b.warehouse_description, b.quantity
    from bins b
    left join k on k.skaps = b.skaps and k.zone = b.zone and k.loc = b.loc and k.whs = b.whs
    where k.skaps is null
  )
  select jsonb_build_object(
    'parts_not_in_sheet', (
      select count(*) from public.parts p
      left join ks on ks.skaps = p.skaps_number
      where p.active and ks.skaps is null
    ),
    'bins_not_in_sheet', (select count(*) from missing_bins),
    'bins_not_in_sheet_qty', (select coalesce(sum(quantity), 0) from missing_bins),
    'bins_not_in_sheet_sample', (
      select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      from (select * from missing_bins where quantity > 0 order by skaps_number limit 50) m
    )
  )
$$;
