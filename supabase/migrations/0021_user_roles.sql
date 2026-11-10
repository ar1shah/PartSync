-- Target project: skaps-inventory (gmivcdjebnqlskabpslg) -- the AUTH project.
-- Do NOT apply to the SKAPS Spare Parts Inventory project; it has no users.
--
-- Introduces two roles:
--   * admin -- everything, including the activity log and inviting staff
--   * staff -- day-to-day operations; no activity log, no inviting, and no
--              destructive / catalog-wide writes (see the policies below)
--
-- Roles live in their own table rather than on `profiles`, because users are
-- allowed to update their own profile row. `user_roles` has NO insert /
-- update / delete policies at all: only the service role (developer scripts,
-- the Supabase dashboard) can grant or change a role, so nobody can promote
-- themselves from the browser.

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_user_roles_touch
  before update on public.user_roles
  for each row execute function public.touch_updated_at();

alter table public.user_roles enable row level security;

create policy "users can read their own role"
  on public.user_roles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Belt and braces on top of "no write policies".
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

-- Every account that exists today is an admin.
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- is_admin(): used by RLS policies. SECURITY INVOKER is enough because a user
-- can always read their own user_roles row.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- New accounts (invites, developer scripts, dashboard) always start as staff.
-- Promoting to admin is a service-role-only operation.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name'
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'staff')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Activity log: admins read, everyone still writes their own entries so
-- staff actions are recorded.
-- ---------------------------------------------------------------------------
drop policy "authenticated users can read the audit log" on public.audit_log;

create policy "admins can read the audit log"
  on public.audit_log
  for select
  to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Parts in repair: staff can add / edit / mark returned, only admins delete.
-- ---------------------------------------------------------------------------
drop policy "authenticated users can delete parts_in_repair" on public.parts_in_repair;

create policy "admins can delete parts_in_repair"
  on public.parts_in_repair
  for delete
  to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Request submissions: only admins delete.
-- ---------------------------------------------------------------------------
drop policy "authenticated users can delete request submissions" on public.submissions;

create policy "admins can delete request submissions"
  on public.submissions
  for delete
  to authenticated
  using (form_type = 'request' and (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Legacy parts master + variants: everyone reads, only admins write.
-- ---------------------------------------------------------------------------
drop policy "authenticated users can insert parts" on public.parts;
drop policy "authenticated users can update parts" on public.parts;
drop policy "authenticated users can delete parts" on public.parts;

create policy "admins can insert parts"
  on public.parts for insert to authenticated
  with check ((select public.is_admin()));
create policy "admins can update parts"
  on public.parts for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins can delete parts"
  on public.parts for delete to authenticated
  using ((select public.is_admin()));

drop policy "authenticated users can insert part_variants" on public.part_variants;
drop policy "authenticated users can update part_variants" on public.part_variants;
drop policy "authenticated users can delete part_variants" on public.part_variants;

create policy "admins can insert part_variants"
  on public.part_variants for insert to authenticated
  with check ((select public.is_admin()));
create policy "admins can update part_variants"
  on public.part_variants for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins can delete part_variants"
  on public.part_variants for delete to authenticated
  using ((select public.is_admin()));
