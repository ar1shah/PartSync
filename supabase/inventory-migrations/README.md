# Inventory project migrations

Migrations for the **SKAPS Spare Parts Inventory** project
(`zlezuqshhrqdokieekxe`, us-east-1) — the database behind
`SKAPS_INVENTORY_SUPABASE_URL`.

These are kept separate from `supabase/migrations/`, which targets the
**legacy** project (`gmivcdjebnqlskabpslg`, us-west-2: auth, submissions,
preferences, notifications, audit log).

## How these get applied

There is no Supabase CLI config in this repo and the inventory project's
schema history began out-of-band — earlier DDL was applied through the
Supabase MCP with reference copies kept in `docs/inventory/`. This directory
starts a proper history from that point forward.

Apply each file in numeric order as a named migration, using the filename
(without the `NNNN_` prefix) as the migration name, so the name in the
project's migration list matches the file here.

Nothing in this directory is applied automatically by a build or deploy.

## Files

| File | What it does |
| --- | --- |
| `0001_parts_list_mv.sql` | `parts_list_mv` materialized view over the list columns of `parts_app_view` where `active`, plus its indexes and `service_role`-only grants |
| `0002_refresh_parts_list_mv.sql` | `refresh_parts_list_mv()`, called by the app after every inventory write |
| `0003_inventory_parts_rpcs.sql` | `inventory_parts_list()`, `inventory_parts_by_normalized_skaps()`, `inventory_parts_fuzzy_skaps()` |
| `0004_revoke_public_execute_on_import_rpc.sql` | **Security fix.** Revokes the default PUBLIC `EXECUTE` on `apply_inventory_quantity_import`, which made that `SECURITY DEFINER` write path reachable by `anon` over PostgREST |

## Conventions

- Additive where possible: prefer new objects over altering existing tables,
  views or functions.
- `set search_path = ''` on every function, with schema-qualified references.
- Explicitly `revoke` from `public`, `anon` and `authenticated`, then `grant`
  only to `service_role`. The inventory project has **no browser access by
  design** — it is reached only through `createInventoryServiceClient()` with
  the service-role key. A materialized view cannot carry RLS, so these grants
  are the only thing standing between it and PostgREST.
- State the target project in a header comment, so a file is never applied to
  the wrong one.
