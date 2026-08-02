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
drop policy if exists "Anyone can submit a fragment" on fragments;
create policy "Anyone can submit a fragment"
  on fragments for insert
  with check (
    fragment_type in ('macro')
    and char_length(name) between 1 and 100
    and (tags is null or array_length(tags, 1) <= 10)
  );

-- Deliberately no UPDATE or DELETE policy yet. Without real user accounts,
-- there's no reliable way to prove "this is my fragment" to gate edits or
-- deletes -- under RLS, no policy means no access, so the table is
-- effectively append-only from the anon key. Moderation/removal for now
-- goes through the Supabase dashboard directly (which uses the
-- service_role key, bypassing RLS entirely -- never ship that key in the
-- app).
--
-- download_count therefore also can't be incremented yet (that's an
-- UPDATE). When that's wanted, the standard Supabase pattern is a
-- SECURITY DEFINER Postgres function exposed as an RPC
-- (supabase.rpc('increment_download_count', { fragment_id })) rather than
-- a blanket UPDATE policy -- intentionally not building that yet to avoid
-- guessing at a shape before the read/submit flow is even live.