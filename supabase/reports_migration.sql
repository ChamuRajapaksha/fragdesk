-- FragDesk: fragment reporting
--
-- Run this in the Supabase SQL Editor. Requires the auth migration
-- (supabase_auth_migration.sql) to already be applied, since this
-- references auth.users.

create table if not exists fragment_reports (
  id uuid primary key default gen_random_uuid(),
  fragment_id uuid not null references fragments(id) on delete cascade,
  reporter uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  -- One report per user per fragment. This is the actual anti-spam
  -- mechanism -- enforced by Postgres itself, not just a UI-level check,
  -- so it holds even if someone bypasses the app and calls the API
  -- directly.
  unique (fragment_id, reporter)
);

create index if not exists idx_fragment_reports_fragment_id
  on fragment_reports (fragment_id);

alter table fragment_reports enable row level security;

grant usage on schema public to authenticated;
grant select, insert on fragment_reports to authenticated;

-- Anyone signed in can report a fragment, only as themselves.
drop policy if exists "Authenticated users can report a fragment" on fragment_reports;
create policy "Authenticated users can report a fragment"
  on fragment_reports for insert
  to authenticated
  with check (
    reporter = auth.uid()
    and reason in ('not_as_described', 'offensive', 'spam', 'other')
  );

-- Users can see only their own reports -- enough for the UI to show
-- "already reported" without exposing report counts or who reported what
-- to the wider community. There's deliberately no aggregate/admin view
-- yet; reviewing reports means querying this table directly via the
-- Supabase dashboard for now, same pattern as fragment moderation.
drop policy if exists "Users can view their own reports" on fragment_reports;
create policy "Users can view their own reports"
  on fragment_reports for select
  to authenticated
  using (reporter = auth.uid());

-- Deliberately no update/delete policy -- a report can't be un-filed
-- once submitted, which discourages using reports as a reversible
-- probing tool.