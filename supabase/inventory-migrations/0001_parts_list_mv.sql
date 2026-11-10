-- Target project: SKAPS Spare Parts Inventory (zlezuqshhrqdokieekxe, us-east-1)
--
-- Flattens the list fields of public.parts_app_view into a materialized view.
--
-- Why: parts_app_view is nested (parts_dashboard -> current_inventory_detail +
-- category joins, plus per-row lateral subplans for QR, RFID, images and
-- specs). Postgres rebuilds the whole thing for every query against it:
-- measured 386ms for one 1,000-row range query, with the sort spilling to disk
-- (work_mem is 2184kB), and the app issues eleven of those concurrently on
-- every Inventory, Parts Used and Parts Requests page load.
--
-- This is additive: no existing table, view, function or policy is modified.

create materialized view public.parts_list_mv as
  select
    part_id,
    skaps_number,
    -- Mirrors normalizeSkapsNumber() in lib/forms/normalize.ts:
    --   s.toUpperCase().replace(/[^A-Z0-9]/g, "")
    -- Stored rather than computed per query so the lookups below are a plain
    -- index scan. Verified against the data: zero non-ASCII skaps_number
    -- values and zero values that normalize to empty, so the SQL and the
    -- TypeScript agree row for row.
    regexp_replace(upper(skaps_number), '[^A-Z0-9]', '', 'g') as skaps_normalized,
    product_name,
    product_description,
    location_on_machine,
    line_number,
    main_category,
    subcategory,
    current_quantity,
    inventory_location_count,
    warehouses,
    has_image
  from public.parts_app_view
  where active;

-- Unique index on part_id is required for REFRESH ... CONCURRENTLY.
create unique index parts_list_mv_part_id_key on public.parts_list_mv (part_id);

-- Serves the list ordering (skaps_number, part_id) and exact-match lookups.
create index parts_list_mv_skaps_number_idx on public.parts_list_mv (skaps_number);

-- Serves inventory_parts_by_normalized_skaps().
create index parts_list_mv_skaps_normalized_idx on public.parts_list_mv (skaps_normalized);

-- SECURITY -------------------------------------------------------------------
-- A materialized view cannot carry RLS, and Supabase's default privileges
-- grant SELECT on new objects in `public` to anon and authenticated -- which
-- would expose the whole catalog over PostgREST. This project has no browser
-- access by design: it is only ever reached through
-- createInventoryServiceClient() with the service-role key
-- (lib/inventory-backend/server.ts), so service_role is the only role that
-- needs to read this.
revoke all on public.parts_list_mv from anon, authenticated;
revoke all on public.parts_list_mv from public;
grant select on public.parts_list_mv to service_role;

comment on materialized view public.parts_list_mv is
  'Flattened list columns from parts_app_view where active = true. service_role only (no RLS possible on a matview). Refreshed by refresh_parts_list_mv() after every write to parts, locations, QR/RFID, images or specs.';
