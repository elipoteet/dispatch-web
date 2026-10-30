-- Dispatch Social — Phase 3 (Spaces and Promotion). See docs/phase-three.md.
-- Written to be run by hand in the Supabase SQL editor, same as every migration before this
-- one — this repo doesn't use the Supabase CLI's migration runner. Additive/idempotent
-- throughout (IF NOT EXISTS, DROP ... IF EXISTS, CREATE OR REPLACE) so it's safe to re-run.
--
-- This is the first migration in this repo to introduce real Postgres functions beyond
-- trigger functions, and the first to use `security definer`. Both are deliberate, not
-- shortcuts — see the comments on each function below for why a plain RLS policy couldn't
-- do the job.

-- ============================================================
-- spaces — a private room for a club. Readable only by its own members
-- (spaces_select_member below, added once space_members exists). Creation
-- goes through create_space() rather than a direct insert, because "the
-- creator becomes the owner and the first member" has to happen as one
-- atomic unit or a failed second insert would leave a space nobody (not
-- even its creator) can ever see again.
-- ============================================================
create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  -- Left unused (always null) for now — "whether Spaces can ever span
  -- schools" is an explicit open question in docs/product-spec.md, not
  -- something this migration decides.
  school_id uuid references public.schools(id),
  -- 32 lowercase hex chars from a hyphen-stripped UUID — reuses
  -- gen_random_uuid(), already proven to work in this database (see
  -- unsub_token, 0008_pushback_notifications.sql), rather than reaching
  -- for pgcrypto's gen_random_bytes() and adding an unverified extension
  -- dependency for the same result. Well over the brief's "at least 16
  -- url-safe characters."
  invite_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists spaces_owner_id_idx on public.spaces (owner_id);

-- ============================================================
-- space_members — who belongs to a space, and with what role. Zero
-- insert/update policies, deliberately — same "zero policies, trusted
-- code paths only" pattern as auth_code_requests (0006_social.sql) and
-- ticker_snapshot. Membership is only ever created by create_space() or
-- join_space_via_token(), and last_seen_at is only ever touched by
-- touch_space_last_seen() — all three security-definer functions below.
-- A blanket "update your own row" policy would also let a member set
-- their own role to 'owner', which is exactly what routing this through
-- narrow functions instead of a policy avoids.
-- ============================================================
create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  -- Not in docs/phase-three.md's literal Data Model column list — added so
  -- the Navigation section's "quiet count of posts since the user last
  -- opened it" is actually possible to compute. See touch_space_last_seen()
  -- below for the only place this ever changes.
  last_seen_at timestamptz not null default now(),
  primary key (space_id, profile_id)
);

create index if not exists space_members_profile_id_idx on public.space_members (profile_id);

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;

drop policy if exists "spaces_select_member" on public.spaces;
create policy "spaces_select_member"
  on public.spaces
  for select
  using (
    exists (
      select 1 from public.space_members sm
      where sm.space_id = spaces.id and sm.profile_id = auth.uid()
    )
  );

-- Owner can update name/description/invite_token (rename, edit
-- description, regenerate the invite link) directly — no function needed
-- for these, unlike ownership transfer. owner_id itself is excluded from
-- what this policy effectively allows to change in practice by the
-- trigger below, which raises unless the update is coming from
-- transfer_space_ownership(). Deletion is a soft update (deleted_at),
-- same pattern as posts/replies, so no delete policy exists.
drop policy if exists "spaces_update_own" on public.spaces;
create policy "spaces_update_own"
  on public.spaces
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "space_members_select_fellow" on public.space_members;
create policy "space_members_select_fellow"
  on public.space_members
  for select
  using (
    exists (
      select 1 from public.space_members sm2
      where sm2.space_id = space_members.space_id and sm2.profile_id = auth.uid()
    )
  );

-- Owner can remove any OTHER member (explicitly excluding their own row,
-- so "remove a member" can never be used to strip the space of its owner
-- and orphan it — leaving would have to go through deleting the space
-- entirely, a deliberate choice, not a missing feature).
drop policy if exists "space_members_delete_owner" on public.space_members;
create policy "space_members_delete_owner"
  on public.space_members
  for delete
  using (
    space_members.profile_id <> auth.uid()
    and exists (
      select 1 from public.spaces s
      where s.id = space_members.space_id and s.owner_id = auth.uid()
    )
  );

-- Blocks direct changes to owner_id from anything except
-- transfer_space_ownership() (below), which briefly sets a
-- transaction-local flag to permit its own write. Without this, the
-- spaces_update_own policy above would let an owner set owner_id directly
-- via a raw API call without also updating space_members.role, leaving
-- the two representations of "who owns this" out of sync.
create or replace function public.enforce_space_owner_id_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id
     and coalesce(current_setting('dispatch.allow_owner_change', true), 'false') <> 'true'
  then
    raise exception 'Space ownership can only change via transfer_space_ownership().';
  end if;
  return new;
end;
$$;

drop trigger if exists spaces_enforce_owner_id_immutable on public.spaces;
create trigger spaces_enforce_owner_id_immutable
  before update on public.spaces
  for each row
  execute function public.enforce_space_owner_id_immutable();

-- ============================================================
-- posts — space_id (null = public feed, the single most important column
-- in the schema now) and promoted_from (set only on the public copy a
-- promotion creates). promoted_from -> posts ON DELETE SET NULL, not
-- CASCADE: posts in this app are never hard-deleted (always soft, via
-- deleted_at) so this is belt-and-suspenders rather than a live risk, but
-- a public post's existence must never depend on its private Space
-- source, even in theory. The unique constraint on promoted_from makes
-- "promotion is one-time" a real DB guarantee, not just a UI check a
-- race condition (two tabs, double-submit) could beat.
-- ============================================================
alter table public.posts add column if not exists space_id uuid references public.spaces(id) on delete cascade;
alter table public.posts add column if not exists promoted_from uuid references public.posts(id) on delete set null;

alter table public.posts drop constraint if exists posts_promoted_from_unique;
alter table public.posts add constraint posts_promoted_from_unique unique (promoted_from);

create index if not exists posts_space_id_idx on public.posts (space_id) where space_id is not null;

-- Relaxes posts_ticker_requires_position (0007_composer.sql) for Space
-- posts specifically. That constraint exists to enforce the public feed's
-- "position disclosure is required whenever a ticker is attached" rule —
-- but a Space post has no position-disclosure UI at all, by design
-- (docs/phase-three.md: "No position disclosure… the composer inside a
-- space is a text box plus ticker attachment, and nothing else"). Setting
-- a silent default of 'none' to satisfy the old constraint would forge a
-- disclosure the author never actually made, which is exactly what
-- docs/product-spec.md's "an unchecked claim never looks like a checked
-- one" rules out. Position becomes required for real at promotion time,
-- when the new public post is created — that's where this constraint
-- still applies in full.
alter table public.posts drop constraint if exists posts_ticker_requires_position;
alter table public.posts add constraint posts_ticker_requires_position
  check (space_id is not null or ticker is null or position is not null);

-- Replaces the posts_select_all/posts_insert_own policies from
-- 0006_social.sql: a post with space_id null stays exactly as public as
-- it always was; a post with space_id set is readable/insertable only by
-- a member of that space.
drop policy if exists "posts_select_all" on public.posts;
create policy "posts_select_all"
  on public.posts
  for select
  using (
    space_id is null
    or exists (
      select 1 from public.space_members sm
      where sm.space_id = posts.space_id and sm.profile_id = auth.uid()
    )
  );

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
  on public.posts
  for insert
  with check (
    auth.uid() = author_id
    and (
      space_id is null
      or exists (
        select 1 from public.space_members sm
        where sm.space_id = posts.space_id and sm.profile_id = auth.uid()
      )
    )
  );

-- Extends enforce_post_metadata_immutable (0007_composer.sql) to also
-- lock space_id and promoted_from after publish — without this, a direct
-- API call could rewrite which Space a post belongs to, or forge a
-- promoted_from pointer, both defeating Promotion being a deliberate,
-- one-time, author-only action. The trigger itself
-- (posts_enforce_metadata_immutable) already exists and already points at
-- this function name, so only the function body needs replacing here.
create or replace function public.enforce_post_metadata_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.type is distinct from old.type
    or new.ticker is distinct from old.ticker
    or new.ticker_snapshot is distinct from old.ticker_snapshot
    or new.position is distinct from old.position
    or new.link_url is distinct from old.link_url
    or new.space_id is distinct from old.space_id
    or new.promoted_from is distinct from old.promoted_from
  then
    raise exception 'Post type, ticker, position, space, and promotion cannot change after publishing.';
  end if;
  return new;
end;
$$;

-- ============================================================
-- replies — replies don't carry space_id themselves (per the brief:
-- don't denormalise it, write the policy as a subquery against the
-- parent post instead). Both SELECT and INSERT get the subquery — the
-- brief only calls out the SELECT leak risk, but the same reasoning
-- applies to INSERT: without it, a non-member could blind-write a reply
-- onto a Space post whose id they happened to discover, even though they
-- could never read it back.
-- ============================================================
drop policy if exists "replies_select_all" on public.replies;
create policy "replies_select_all"
  on public.replies
  for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = replies.post_id
        and (
          p.space_id is null
          or exists (
            select 1 from public.space_members sm
            where sm.space_id = p.space_id and sm.profile_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "replies_insert_own" on public.replies;
create policy "replies_insert_own"
  on public.replies
  for insert
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.posts p
      where p.id = replies.post_id
        and (
          p.space_id is null
          or exists (
            select 1 from public.space_members sm
            where sm.space_id = p.space_id and sm.profile_id = auth.uid()
          )
        )
    )
  );

-- ============================================================
-- Functions. All `security definer` — a new pattern for this repo, which
-- until now has only ever used trigger functions. Justified per function
-- below, not a default choice:
--   - create_space / join_space_via_token need to write to two tables
--     (spaces + space_members) atomically. PostgREST/the JS client can't
--     do a multi-table transaction, and a failure between two sequential
--     `.update()`/`.insert()` calls would leave a space nobody (not even
--     its own "owner") could ever see again, since spaces_select_member
--     requires a space_members row to exist first.
--   - get_space_by_invite_token needs to look up a space by exact token
--     match for people who are NOT yet members (that's the entire point
--     of an invite link) — impossible to express as a normal RLS SELECT
--     policy without either making spaces fully public (breaks "no
--     directory, no search, no discovery") or fully private (breaks the
--     invite flow). A definer function doing a `where invite_token = $1`
--     equality lookup is the standard shape for "if you know the exact
--     unguessable token, you get in; otherwise the table doesn't exist
--     for you."
--   - transfer_space_ownership needs the same atomicity as create_space,
--     across spaces.owner_id and two space_members.role rows.
--   - touch_space_last_seen is the only sanctioned way to write
--     last_seen_at, since space_members has no direct update policy at
--     all (see the table comment above).
-- ============================================================

-- Any verified member (has a profiles row) can create a space and becomes
-- its owner and first member, atomically. Slug is generated from the
-- name — lowercased, non-alphanumeric runs collapsed to a single hyphen,
-- trimmed, capped at 40 chars — with a numeric suffix appended on
-- collision.
create or replace function public.create_space(p_name text, p_description text default null)
returns table(slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_slug text;
  v_slug text;
  v_space_id uuid;
  v_suffix int := 1;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Finish setting up your profile first.';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Space name is required.';
  end if;

  v_base_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if length(v_base_slug) = 0 then
    v_base_slug := 'space';
  end if;
  v_base_slug := left(v_base_slug, 40);

  v_slug := v_base_slug;
  while exists (select 1 from public.spaces s where s.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into public.spaces (name, description, owner_id, slug)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), auth.uid(), v_slug)
  returning id into v_space_id;

  insert into public.space_members (space_id, profile_id, role, last_seen_at)
  values (v_space_id, auth.uid(), 'owner', now());

  return query select v_slug;
end;
$$;

grant execute on function public.create_space(text, text) to authenticated;

-- Read-only, exact-token lookup — see the "why definer" note above. Used
-- by /j/[token] both to validate a link before sending a signed-out
-- visitor into signup, and to resolve the slug to redirect to once
-- someone is actually joined.
create or replace function public.get_space_by_invite_token(p_token text)
returns table(id uuid, slug text, name text)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.slug, s.name
  from public.spaces s
  where s.invite_token = p_token
    and s.deleted_at is null;
$$;

grant execute on function public.get_space_by_invite_token(text) to anon, authenticated;

-- Joins the caller to the space identified by an exact invite token.
-- Idempotent (on conflict do nothing) — "already a member" redirects to
-- the space with no error, per the brief, rather than raising.
create or replace function public.join_space_via_token(p_token text)
returns table(slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Finish setting up your profile first.';
  end if;

  select s.id, s.slug into v_space_id, v_slug
  from public.spaces s
  where s.invite_token = p_token
    and s.deleted_at is null;

  if v_space_id is null then
    raise exception 'This invite link is no longer valid.';
  end if;

  insert into public.space_members (space_id, profile_id, role, last_seen_at)
  values (v_space_id, auth.uid(), 'member', now())
  on conflict (space_id, profile_id) do nothing;

  return query select v_slug;
end;
$$;

grant execute on function public.join_space_via_token(text) to authenticated;

-- Owner-only, atomic transfer: updates spaces.owner_id and both
-- space_members.role rows (old owner -> member, new owner -> owner) in
-- one transaction, so the two representations of "who owns this" can
-- never drift. The new owner must already be a member — this transfers
-- ownership within the space, it doesn't add someone new.
create or replace function public.transfer_space_ownership(p_space_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.spaces s
    where s.id = p_space_id and s.owner_id = auth.uid()
  ) then
    raise exception 'Only the current owner can transfer ownership.';
  end if;

  if not exists (
    select 1 from public.space_members sm
    where sm.space_id = p_space_id and sm.profile_id = p_new_owner_id
  ) then
    raise exception 'The new owner must already be a member of this space.';
  end if;

  perform set_config('dispatch.allow_owner_change', 'true', true);

  update public.spaces
  set owner_id = p_new_owner_id
  where id = p_space_id;

  update public.space_members
  set role = 'member'
  where space_id = p_space_id and profile_id = auth.uid();

  update public.space_members
  set role = 'owner'
  where space_id = p_space_id and profile_id = p_new_owner_id;
end;
$$;

grant execute on function public.transfer_space_ownership(uuid, uuid) to authenticated;

-- The only sanctioned way last_seen_at ever changes — called whenever a
-- member opens the space page, so the nav's "posts since you last opened
-- this" count has something to compare against.
create or replace function public.touch_space_last_seen(p_space_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.space_members
  set last_seen_at = now()
  where space_id = p_space_id and profile_id = auth.uid();
$$;

grant execute on function public.touch_space_last_seen(uuid) to authenticated;
