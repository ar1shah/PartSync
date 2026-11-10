-- Applied to SKAPS Spare Parts Inventory (zlezuqshhrqdokieekxe)
-- via Supabase MCP migration `enable_excel_quantity_import`.
-- Keeps a local copy of the live function for reference.

-- Quantities are managed by Excel import. Forms never touch stock.
drop trigger if exists trg_enforce_trial_zero_inventory_quantity on public.inventory_records;
drop function if exists public.enforce_trial_zero_inventory_quantity();

-- See apply_inventory_quantity_import in the inventory project for the full body.
-- Signature:
--   apply_inventory_quantity_import(
--     p_rows jsonb,
--     p_file_name text default null,
--     p_dry_run boolean default false,
--     p_import_batch_id bigint default null
--   ) returns jsonb
