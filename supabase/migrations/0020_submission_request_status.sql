-- Parts Request status is driven by Google Sheet column-H highlight colors.
-- Expense status remains Parts Used only (column G).

alter table public.submissions
  add column if not exists request_status text;

update public.submissions
set request_status = case
  when form_type = 'request' and status = 'ordered' then 'ordered'
  when form_type = 'request' and status = 'needs_review' then 'under_review'
  when form_type = 'request' and status = 'closed' then 'ordered'
  when form_type = 'request' then 'pending'
  else 'pending'
end
where request_status is null;

alter table public.submissions
  alter column request_status set default 'pending';

alter table public.submissions
  alter column request_status set not null;

alter table public.submissions
  drop constraint if exists submissions_request_status_check;

alter table public.submissions
  add constraint submissions_request_status_check
  check (request_status in ('pending', 'under_review', 'not_ordered', 'ordered'));

update public.submissions
set expense_status = null
where form_type = 'request'
  and expense_status is not null;

create index if not exists submissions_request_status_idx
  on public.submissions (form_type, request_status)
  where form_type = 'request';
