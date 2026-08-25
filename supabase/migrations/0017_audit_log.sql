-- Append-only audit trail of admin actions (who marked a request ordered,
-- who edited a part, etc). Written from server actions via lib/audit/log.ts.
-- Automated pipeline writes (ingest routes, stock trigger) are intentionally
-- not logged here.

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id) on delete set null,
  actor_label text,            -- name snapshot, survives user deletion
  action      text not null,   -- e.g. 'request.marked_ordered'
  entity_type text not null,   -- 'submission' | 'part' | 'part_in_repair' | 'profile'
  entity_id   uuid,
  entity_label text,           -- e.g. SKAPS number or part name
  summary     text not null,   -- human sentence for the log UI
  changes     jsonb,           -- optional before/after diff
  created_at  timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

alter table public.audit_log enable row level security;

create policy "authenticated users can read the audit log"
  on public.audit_log
  for select
  to authenticated
  using (true);

-- Insert only as yourself. No update/delete policy: append-only from the app.
create policy "users can insert their own audit entries"
  on public.audit_log
  for insert
  to authenticated
  with check (auth.uid() = actor_id);
