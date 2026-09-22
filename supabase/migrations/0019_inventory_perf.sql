-- Speed up public_inventory and normalized SKAPS# matching.
--
-- Before: used_last_30d and variant_count were correlated subqueries that
-- re-scanned submissions / part_variants once per part row. With a few
-- thousand parts that dominated every Inventory / Used / dashboard load.
--
-- After: one aggregate pass of each table, hash-joined back to parts, plus
-- expression indexes so normalize_skaps_number() can use an index instead
-- of a sequential scan (also helps apply_used_submission + find_part_by_skaps).

-- ---------------------------------------------------------------------------
-- 1. Expression indexes for normalized SKAPS#
-- ---------------------------------------------------------------------------
create index if not exists submissions_norm_skaps_idx
  on public.submissions (public.normalize_skaps_number(skaps_number));

create index if not exists parts_norm_skaps_idx
  on public.parts (public.normalize_skaps_number(skaps_number));

-- Helps the 30-day usage aggregate that feeds the view.
create index if not exists submissions_used_recent_idx
  on public.submissions (submitted_at desc)
  where form_type = 'used' and skaps_number is not null;

-- ---------------------------------------------------------------------------
-- 2. Rewrite public_inventory — aggregate joins, same columns / grants
-- ---------------------------------------------------------------------------
drop view if exists public.public_inventory;

create view public.public_inventory as
select
  p.id,
  p.skaps_number,
  p.name,
  p.description,
  p.category,
  p.sub_category,
  coalesce(pv.lwhsdesc,         p.lwhsdesc)          as lwhsdesc,
  coalesce(pv.zone,             p.zone)               as zone,
  coalesce(pv.location,         p.location)           as location,
  coalesce(pv.storage_location, p.storage_location)   as storage_location,
  coalesce(pv.location_on_machine, p.location_on_machine) as location_on_machine,
  coalesce(pv.line_no,          p.line_no)             as line_no,
  p.size,
  p.belt_type,
  p.vendor_names,
  p.image_url,
  p.unit,
  greatest(p.current_quantity, 0) as quantity_on_hand,
  p.reorder_threshold,
  coalesce(u.used_last_30d, 0) as used_last_30d,
  coalesce(vc.variant_count, 0) as variant_count,
  p.notes,
  p.created_at,
  p.updated_at
from public.parts p
left join lateral (
  select *
    from public.part_variants v
   where v.part_id = p.id
   order by v.sort_order asc
   limit 1
) pv on true
left join (
  select
    public.normalize_skaps_number(skaps_number) as norm_skaps,
    sum(quantity) as used_last_30d
  from public.submissions
  where form_type = 'used'
    and skaps_number is not null
    and submitted_at >= now() - interval '30 days'
  group by 1
) u on u.norm_skaps = public.normalize_skaps_number(p.skaps_number)
left join (
  select part_id, count(*)::int as variant_count
    from public.part_variants
   group by 1
) vc on vc.part_id = p.id;

alter view public.public_inventory set (security_invoker = true);

-- Defense in depth: inventory is authenticated-only (see 0011).
grant select on public.public_inventory to authenticated;
revoke select on public.public_inventory from anon;

-- ---------------------------------------------------------------------------
-- 3. RPC — fetch inventory rows by normalized SKAPS# keys
-- ---------------------------------------------------------------------------
create or replace function public.inventory_by_normalized_skaps(p_keys text[])
returns setof public.public_inventory
language sql
stable
security invoker
set search_path = public
as $$
  select *
    from public.public_inventory
   where public.normalize_skaps_number(skaps_number) = any(p_keys);
$$;

grant execute on function public.inventory_by_normalized_skaps(text[]) to authenticated;
revoke execute on function public.inventory_by_normalized_skaps(text[]) from anon, public;
