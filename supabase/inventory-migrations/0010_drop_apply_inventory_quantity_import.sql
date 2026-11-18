-- Target project: SKAPS Spare Parts Inventory (zlezuqshhrqdokieekxe, us-east-1)
--
-- Apply only AFTER the app version that uses process_inventory_import()
-- (0005) is deployed to production; older builds still call this function.

drop function if exists public.apply_inventory_quantity_import(jsonb, text, boolean, bigint);
