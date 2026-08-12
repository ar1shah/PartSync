-- Per-user notification read state.
--
-- Until now `notifications.read_at` was a single global column: whoever
-- marked a notification read cleared it for everyone. This introduces a
-- junction table so each admin has their own read state. A notification is
-- "unread" for a given user when there is no matching notification_reads row.

create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index notification_reads_user_idx on public.notification_reads (user_id);

alter table public.notification_reads enable row level security;

create policy "users can read their own notification reads"
  on public.notification_reads
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users can insert their own notification reads"
  on public.notification_reads
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can delete their own notification reads"
  on public.notification_reads
  for delete
  to authenticated
  using (auth.uid() = user_id);

comment on column public.notifications.read_at is
  'Deprecated: global read state replaced by public.notification_reads. Kept for history.';

-- Count of notifications the current user has not yet read. Runs as the
-- caller (security invoker) so RLS on notification_reads scopes to auth.uid().
create or replace function public.unread_notification_count()
returns integer
language sql
security invoker
stable
set search_path = public
as $$
  select count(*)::int
  from public.notifications n
  where not exists (
    select 1
    from public.notification_reads r
    where r.notification_id = n.id
      and r.user_id = auth.uid()
  );
$$;

-- Mark every notification read for the current user in one round trip.
create or replace function public.mark_all_notifications_read()
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.notification_reads (notification_id, user_id)
  select n.id, auth.uid()
  from public.notifications n
  where auth.uid() is not null
  on conflict (notification_id, user_id) do nothing;
$$;
