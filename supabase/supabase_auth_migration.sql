-- FragDesk: auth-backed fragment ownership
--
-- Run this in the Supabase SQL Editor. Assumes schema.sql (the fragments
-- table + earlier policies) has already been run once.
--
-- Idempotent: safe to re-run on a project where schema.sql already created
-- submitted_by as uuid (fresh installs) as well as on older projects where
-- it is still text (needs the type change below).

-- 1. submitted_by becomes a real reference into auth.users, not a loose
--    text field. Legacy values that aren't UUIDs can't be cast, so they are
--    cleared to NULL first -- those pre-auth anonymous submissions stay
--    intentionally unowned (auth.uid() can never equal NULL). Cleanup for
--    orphaned rows goes through the Supabase dashboard directly.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fragments'
      and column_name = 'submitted_by'
      and data_type <> 'uuid'
  ) then
    update public.fragments
      set submitted_by = null
      where submitted_by is not null
        and submitted_by !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    alter table public.fragments
      alter column submitted_by type uuid using submitted_by::uuid;
  end if;
end $$;

-- 2. Add the FK only once. UUID-shaped legacy values may still reference
--    users that never existed, so clear anything that isn't a real account
--    before enforcing the constraint (otherwise the ALTER fails).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fragments_submitted_by_fkey'
      and conrelid = 'public.fragments'::regclass
  ) then
    update public.fragments f
      set submitted_by = null
      where f.submitted_by is not null
        and not exists (
          select 1 from auth.users u where u.id = f.submitted_by
        );

    alter table public.fragments
      add constraint fragments_submitted_by_fkey
      foreign key (submitted_by) references auth.users(id) on delete set null;
  end if;
end $$;

-- 3. Submitting now requires being signed in. This replaces every earlier
--    insert policy -- anonymous sharing is deliberately no longer possible,
--    since there'd be no way to ever let someone manage or delete something
--    they can't be proven to have submitted.
--
--    Keep the full four-type allow-list: narrowing this to just 'macro'
--    silently breaks clipboard snippets, alert rules, and monitor layouts.
drop policy if exists "Anyone can submit a fragment" on fragments;
drop policy if exists "Authenticated users can submit their own fragment" on fragments;
create policy "Authenticated users can submit their own fragment"
  on fragments for insert
  to authenticated
  with check (
    fragment_type in ('macro', 'clipboard_snippet', 'monitor_alert_rule', 'monitor_layout')
    and char_length(name) between 1 and 100
    and coalesce(array_length(tags, 1), 0) <= 10
    and submitted_by = auth.uid()
  );

-- 4. Owners can update or delete only their own fragments.
drop policy if exists "Owners can update their own fragments" on fragments;
create policy "Owners can update their own fragments"
  on fragments for update
  to authenticated
  using (auth.uid() = submitted_by)
  with check (auth.uid() = submitted_by);

drop policy if exists "Owners can delete their own fragments" on fragments;
create policy "Owners can delete their own fragments"
  on fragments for delete
  to authenticated
  using (auth.uid() = submitted_by);

-- Public read access (from schema.sql) is unchanged -- browsing the
-- Community Library still doesn't require an account, only submitting
-- and deleting do.
