-- FragDesk: auth-backed fragment ownership
--
-- Run this in the Supabase SQL Editor. Assumes schema.sql (the fragments
-- table + earlier policies) has already been run once.

-- 1. submitted_by becomes a real reference into auth.users, not a loose
--    text field. Existing rows all have submitted_by = NULL (every prior
--    submission was anonymous), so this cast is safe -- NULL::uuid is
--    still NULL, no data loss. Those legacy rows stay permanently
--    unowned/un-deletable from the app after this migration (auth.uid()
--    can never equal NULL) -- same as documented in schema.sql: cleanup
--    for orphaned rows goes through the Supabase dashboard directly.
alter table fragments
  alter column submitted_by type uuid using submitted_by::uuid;

alter table fragments
  add constraint fragments_submitted_by_fkey
  foreign key (submitted_by) references auth.users(id) on delete set null;

-- 2. Submitting now requires being signed in. This replaces the earlier
--    "anyone can submit" policy -- anonymous sharing is deliberately no
--    longer possible, since there'd be no way to ever let someone manage
--    or delete something they can't be proven to have submitted.
drop policy if exists "Anyone can submit a fragment" on fragments;
create policy "Authenticated users can submit their own fragment"
  on fragments for insert
  to authenticated
  with check (
    fragment_type in ('macro')
    and char_length(name) between 1 and 100
    and coalesce(array_length(tags, 1), 0) <= 10
    and submitted_by = auth.uid()
  );

-- 3. Owners can update or delete only their own fragments. This is the
--    actual gap being closed: previously nobody, not even the original
--    submitter, could remove a fragment from inside the app.
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