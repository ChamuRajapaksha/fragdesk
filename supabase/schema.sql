-- FragDesk community fragments schema
--
-- Paste this into Supabase's SQL Editor (Project -> SQL Editor -> New query)
-- once the project exists. Safe to re-run: everything uses IF NOT EXISTS /
-- CREATE OR REPLACE where possible.

create extension if not exists pgcrypto; -- for gen_random_uuid()

create table if not exists fragments (
  id uuid primary key default gen_random_uuid(),
  fragment_type text not null,
  name text not null,
  tags text[] not null default '{}',
  format_version integer not null,
  payload jsonb not null,
  submitted_by text,                       -- anonymous device id for now; real
                                            -- auth (submitted_by -> auth.users)
                                            -- is future work, see note below
  download_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_fragments_fragment_type on fragments (fragment_type);
create index if not exists idx_fragments_created_at on fragments (created_at desc);
create index if not exists idx_fragments_tags on fragments using gin (tags);

alter table fragments enable row level security;

-- Tables created via raw SQL (as opposed to the Table Editor UI) don't
-- automatically get PostgreSQL-level privileges granted to the anon/
-- authenticated roles -- this is a direct consequence of leaving
-- "Automatically expose new tables" OFF in project settings (the right
-- default, but it means grants are now our job). RLS policies below only
-- control *row-level* access; without these GRANTs, Postgres blocks the
-- operation before RLS is even evaluated.
grant usage on schema public to anon, authenticated;
grant select, insert on fragments to anon, authenticated;
grant update, delete on fragments to authenticated;

-- Anyone (using the app's anon key) can read every fragment. This is a
-- public community library -- there's no private/unlisted concept yet.
drop policy if exists "Public fragments are viewable by everyone" on fragments;
create policy "Public fragments are viewable by everyone"
  on fragments for select
  using (true);

-- Anyone can submit a fragment, with basic shape validation enforced at
-- the database level (defense in depth -- the client should validate too,
-- but a malicious client bypassing the UI can't bypass this).
--
-- fragment_type is allow-listed explicitly rather than left open, so a
-- typo'd or malicious type can't silently pollute the table. Extend this
-- list every time a new FragmentPayload variant is added on the Rust side
-- (see src-tauri/src/fragments.rs) -- these two lists should stay in sync.

-- Run in Supabase SQL Editor. Adds monitor_alert_rule to the fragment_type
-- allow-list, learning from the clipboard_snippet miss earlier -- doing
-- this proactively alongside the Rust-side change this time, not after
-- someone hits the RLS error.

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

-- UPDATE and DELETE policies are defined in supabase_auth_migration.sql
-- (requires auth: submitted_by = auth.uid()). Moderation/removal for
-- unowned rows still goes through the Supabase dashboard directly (which
-- uses the service_role key, bypassing RLS entirely -- never ship that
-- key in the app).

-- download_count can't be incremented via a plain UPDATE (no policy
-- allows it, deliberately -- see above). This function is a narrow,
-- single-purpose exception: SECURITY DEFINER makes it run with the
-- privileges of whoever defined it (bypassing RLS for this one operation
-- only), while still being callable by the anon role via RPC. It can only
-- ever do exactly this one increment -- it's not a general escape hatch.
create or replace function increment_download_count(fragment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update fragments
  set download_count = download_count + 1
  where id = fragment_id;
end;
$$;

grant execute on function increment_download_count(uuid) to anon, authenticated;