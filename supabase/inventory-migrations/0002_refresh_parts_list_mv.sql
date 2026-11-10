-- Target project: SKAPS Spare Parts Inventory (zlezuqshhrqdokieekxe, us-east-1)
--
-- Refresh entry point for public.parts_list_mv, called by the app after every
-- write that changes parts, locations, QR/RFID, images or specs.
--
-- NOTE ON `CONCURRENTLY`: it is deliberately NOT used here. REFRESH
-- MATERIALIZED VIEW CONCURRENTLY cannot run inside a transaction block, and
-- PostgREST wraps every rpc() call in one -- so a CONCURRENTLY refresh invoked
-- from the app would fail outright. A plain refresh takes an ACCESS EXCLUSIVE
-- lock for its duration, which is acceptable because writes here are rare
-- admin actions and reads are served from the Next.js cache. The unique index
-- in 0001 still exists so a CONCURRENTLY refresh works from psql or pg_cron if
-- the lock ever becomes a problem (pg_cron is available-but-not-installed on
-- this project).

create or replace function public.refresh_parts_list_mv()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view public.parts_list_mv;
end;
$$;

revoke all on function public.refresh_parts_list_mv() from public;
revoke all on function public.refresh_parts_list_mv() from anon, authenticated;
grant execute on function public.refresh_parts_list_mv() to service_role;

comment on function public.refresh_parts_list_mv() is
  'Rebuilds parts_list_mv. Called from the app after inventory writes, then paired with revalidateTag("inventory-parts"). service_role only.';
