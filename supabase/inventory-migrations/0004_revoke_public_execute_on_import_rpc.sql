-- Target project: SKAPS Spare Parts Inventory (zlezuqshhrqdokieekxe, us-east-1)
--
-- SECURITY FIX, not a performance change.
--
-- public.apply_inventory_quantity_import is SECURITY DEFINER and was
-- executable by PUBLIC, which in a Supabase project means it was reachable by
-- the anon and authenticated roles over
-- POST /rest/v1/rpc/apply_inventory_quantity_import. It is a write path: it
-- creates parts and updates inventory_records quantities. Anyone holding this
-- project's publishable key could therefore have written to the catalog.
--
-- Found by the Supabase security advisor (lints
-- anon_security_definer_function_executable and
-- authenticated_security_definer_function_executable) while verifying the
-- parts_list_mv grants in 0001.
--
-- Its ACL was {=X/postgres,postgres=X/postgres,service_role=X/postgres}: the
-- `=X` entry is the default PUBLIC grant Postgres puts on every new function,
-- so anon/authenticated inherited EXECUTE rather than holding it directly.
-- Revoking from PUBLIC is what closes it. The revokes from anon and
-- authenticated are belt-and-braces no-ops.
--
-- This cannot break the application: the only caller is
-- importInventoryExcel() in app/admin/inventory/actions.ts, which goes
-- through createInventoryServiceClient() as service_role, and service_role
-- keeps its own direct grant. Every other SECURITY DEFINER function in this
-- project was already locked down this way -- audited all 22 of them, this was
-- the only exception.

revoke execute on function public.apply_inventory_quantity_import(
  jsonb, text, boolean, bigint
) from public;

revoke execute on function public.apply_inventory_quantity_import(
  jsonb, text, boolean, bigint
) from anon, authenticated;

grant execute on function public.apply_inventory_quantity_import(
  jsonb, text, boolean, bigint
) to service_role;
