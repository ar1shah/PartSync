-- Target project: SKAPS Spare Parts Inventory (zlezuqshhrqdokieekxe, us-east-1)
--
-- Widens what counts as "the same value" when comparing a sheet cell with the
-- database, so re-importing the source workbook doesn't report false changes:
--   * whitespace runs (including line breaks inside a cell) and Excel's
--     escaped carriage return _x000D_ compare as a single space — the
--     database stores descriptions on one line;
--   * number-like values compare as numbers: 0838467 = 838467,
--     333258096.500 = 333258096.5, 1.00014E+11 = 100014000000, 001 = 1.
-- process_inventory_import() and inventory_import_untouched() pick this up
-- through import_same_text() / import_match_key(); their bodies are unchanged.

create or replace function public.import_norm_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(regexp_replace(p_value, '_x000D_?', ' ', 'gi'), '\s+', ' ', 'g')), '')
$$;

create or replace function public.import_same_text(p_a text, p_b text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when a is not distinct from b then true
    when a ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$'
     and b ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$'
      then a::numeric = b::numeric
    else false
  end
  from (select public.import_norm_text(p_a) as a, public.import_norm_text(p_b) as b) v
$$;

create or replace function public.import_match_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when n ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$'
      then '#' || trim_scale(n::numeric)::text
    else coalesce(n, '')
  end
  from (select public.import_norm_text(p_value) as n) v
$$;

revoke execute on function public.import_norm_text(text) from public, anon, authenticated;
grant execute on function public.import_norm_text(text) to service_role;
