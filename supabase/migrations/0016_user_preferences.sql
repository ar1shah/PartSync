-- Per-user personalization: dashboard layout, background, density, plus
-- avatar and display-name columns on profiles. Also opens up cross-user
-- profile reads so the audit log and avatars can show other admins' names.

create table public.user_preferences (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  background       text not null default 'default',
  density          text not null default 'comfortable'
                   check (density in ('comfortable', 'compact')),
  dashboard_layout jsonb,          -- null = fall back to the default layout
  updated_at       timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "users can read their own preferences"
  on public.user_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users can insert their own preferences"
  on public.user_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own preferences"
  on public.user_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Avatar + optional display name (nickname) for the greeting.
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists display_name text;

-- Audit log and avatars need to show *other* admins, so allow authenticated
-- users to read every profile. The self-only select policy from 0002 is
-- replaced by this broader one.
drop policy if exists "users can read their own profile" on public.profiles;

create policy "authenticated users can read all profiles"
  on public.profiles
  for select
  to authenticated
  using (true);
