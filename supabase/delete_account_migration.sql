-- FragDesk: delete account + purge owned data
--
-- Run this in the Supabase SQL Editor. Requires supabase_auth_migration.sql
-- to already be applied (auth.users FK on fragments.submitted_by) and
-- reports_migration.sql (fragment_reports) -- order doesn't matter beyond
-- those two both being present.
--
-- Caveat (read before wiring the client): delete_account() deletes the
-- caller's own auth.users row, which revokes their JWT mid-call. Supabase
-- may therefore return a revoked-token / jwt-expired error for this exact
-- RPC even though the deletion fully succeeded. The client MUST treat
-- those responses as success (the account is gone either way -- the
-- delete already happened).

-- 1. delete_account() -- SECURITY DEFINER so it can touch auth.users
--    (callers only have the authenticated role). auth.uid() is evaluated
--    inside the function from the caller's JWT, so nobody can delete
--    anyone but themselves through this.
create or replace function delete_account()
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;

grant execute on function delete_account() to authenticated;

-- 2. Purge the owner's fragments when they're deleted. Without this, the
--    fragments.submitted_by FK (on delete set null) would leave their
--    shared macros/snippets/rules behind as unowned orphans; instead they
--    should disappear with the account. Runs BEFORE the user row is
--    deleted (the FK needs the user to still exist to match on).
--    fragment_reports handles itself: reporter cascades on user deletion,
--    and fragment_id cascades on fragment deletion, so both report reads
--    are covered transitively.
create or replace function delete_user_fragments_and_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from fragments where submitted_by = old.id;
  return old;
end;
$$;

drop trigger if exists purge_owned_fragments_on_user_delete on auth.users;
create trigger purge_owned_fragments_on_user_delete
  before delete on auth.users
  for each row execute function delete_user_fragments_and_reports();