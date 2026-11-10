-- Target project: SKAPS Spare Parts Inventory (zlezuqshhrqdokieekxe, us-east-1)
--
-- Read RPCs over public.parts_list_mv, replacing three expensive access
-- patterns in the app:
--
--   1. inventory_parts_list()           -- replaces a head count plus ~10
--      parallel 1,000-row range queries on parts_app_view (measured 2.2-2.7s
--      and 4.26MB of rows) with one round trip. Returning a single jsonb value
--      also sidesteps PostgREST's 1,000-row cap.
--   2. inventory_parts_by_normalized_skaps() -- replaces loading the entire
--      catalog on /admin/used and /admin/requests just to resolve SKAPS links
--      for at most 500 submissions.
--   3. inventory_parts_fuzzy_skaps()    -- replaces the full-catalog scan in
--      findFuzzyInventoryMatches().
--
-- All three are SECURITY INVOKER (the default) rather than DEFINER: the only
-- caller is service_role, which already reads the MV directly, so there is no
-- reason to run them as the owner. EXECUTE is revoked from anon/authenticated
-- regardless.

-- 1. The whole list, as a compact JSON array of arrays ------------------------
--
-- Tuple layout -- POSITIONAL, and mirrored by LIST_TUPLE in
-- lib/inventory-backend/load-parts.ts. Changing this order is a breaking
-- change on both sides.
--
--   [0]  part_id
--   [1]  skaps_number
--   [2]  product_name
--   [3]  product_description
--   [4]  main_category
--   [5]  subcategory
--   [6]  location_on_machine
--   [7]  line_number
--   [8]  warehouses
--   [9]  current_quantity
--   [10] inventory_location_count
--   [11] has_image  (1 when true, omitted as null when false)
--
-- Arrays rather than objects because the 12 field names repeated 9,988 times
-- are most of the payload: measured 2.92MB as objects vs 2.01MB as arrays for
-- identical data. Vercel caps a cache entry at 2MB, hence also the
-- offset/limit arguments -- the caller reads this in shards.
create or replace function public.inventory_parts_list(
  p_offset integer default 0,
  p_limit integer default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_array(
        t.part_id,
        t.skaps_number,
        t.product_name,
        t.product_description,
        t.main_category,
        t.subcategory,
        t.location_on_machine,
        t.line_number,
        t.warehouses,
        t.current_quantity,
        t.inventory_location_count,
        case when t.has_image then 1 end
      )
      order by t.skaps_number, t.part_id
    ),
    '[]'::jsonb
  )
  from (
    select *
    from public.parts_list_mv
    order by skaps_number, part_id
    offset greatest(p_offset, 0)
    limit p_limit
  ) t;
$$;

-- 2. Parts for a set of normalized SKAPS keys ---------------------------------
--
-- Returns EVERY row matching each key, collisions included, so the caller's
-- existing ambiguity handling is unchanged: SubmissionsTable drops a
-- normalized key the second time it sees it, and those parts then resolve to
-- no link. There are 2 colliding normalized keys covering 4 parts today.
create or replace function public.inventory_parts_by_normalized_skaps(
  p_keys text[]
)
returns table (
  part_id bigint,
  skaps_number text,
  product_name text,
  main_category text,
  current_quantity numeric
)
language sql
stable
set search_path = ''
as $$
  select m.part_id, m.skaps_number, m.product_name, m.main_category, m.current_quantity
  from public.parts_list_mv m
  where m.skaps_normalized = any (p_keys)
  order by m.skaps_number, m.part_id;
$$;

-- 3. Fuzzy suggestions for one normalized key ---------------------------------
--
-- Mirrors findFuzzyInventoryMatches(): a match is a substring hit in EITHER
-- direction. `position()` rather than LIKE so there are no metacharacters to
-- escape (normalized keys are [A-Z0-9] only, but this keeps it true by
-- construction). Ordered by part_id, which is the order the previous
-- full-catalog scan happened to return (its index scan on parts_pkey) -- now
-- explicit and deterministic instead of incidental.
create or replace function public.inventory_parts_fuzzy_skaps(
  p_key text,
  p_limit integer default 3
)
returns table (
  part_id bigint,
  skaps_number text,
  product_name text,
  main_category text,
  current_quantity numeric
)
language sql
stable
set search_path = ''
as $$
  select m.part_id, m.skaps_number, m.product_name, m.main_category, m.current_quantity
  from public.parts_list_mv m
  where position(p_key in m.skaps_normalized) > 0
     or position(m.skaps_normalized in p_key) > 0
  order by m.part_id
  limit greatest(p_limit, 0);
$$;

-- SECURITY -------------------------------------------------------------------
revoke all on function public.inventory_parts_list(integer, integer) from public;
revoke all on function public.inventory_parts_list(integer, integer) from anon, authenticated;
grant execute on function public.inventory_parts_list(integer, integer) to service_role;

revoke all on function public.inventory_parts_by_normalized_skaps(text[]) from public;
revoke all on function public.inventory_parts_by_normalized_skaps(text[]) from anon, authenticated;
grant execute on function public.inventory_parts_by_normalized_skaps(text[]) to service_role;

revoke all on function public.inventory_parts_fuzzy_skaps(text, integer) from public;
revoke all on function public.inventory_parts_fuzzy_skaps(text, integer) from anon, authenticated;
grant execute on function public.inventory_parts_fuzzy_skaps(text, integer) to service_role;
