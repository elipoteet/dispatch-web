-- Dispatch Social — Phase 1 (schema + RLS). See docs/phase-one.md for the
-- full spec this implements. Written to be run by hand in the Supabase SQL
-- editor, same as every migration before this one — this repo doesn't use
-- the Supabase CLI's migration runner. Not destructive: uses IF NOT EXISTS,
-- CREATE OR REPLACE, and ON CONFLICT DO NOTHING throughout so it's safe to
-- re-run.
--
-- This is a SEPARATE system from both the paper-trading tables
-- (paper_account / paper_position / paper_transaction / equity_snapshot)
-- and the leaderboard tables (competition_*, 0003) — nothing here touches
-- those, and `profiles.handle` here is intentionally a different, unrelated
-- identity from `competition_profile.handle` (leaderboard display name).
-- Every table below is new.

-- ============================================================
-- schools — readable by everyone, writable by nobody through the API
-- (insert/update/delete happen by hand, in this editor, per
-- docs/phase-one.md). Seeded with UNH only; more schools are added the
-- same way, later.
-- ============================================================
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  name text not null,
  short_name text not null,
  -- Whether this school keeps alumni email addresses active after
  -- graduation rather than deactivating/recycling them. Seeded but not yet
  -- read anywhere in phase one — no logic depends on it. See
  -- docs/phase-one.md's note on `claude/alumni-verification.md`, which
  -- isn't in this repo.
  alumni_email_retained boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.schools enable row level security;

drop policy if exists "schools_select_all" on public.schools;
create policy "schools_select_all"
  on public.schools
  for select
  using (true);
-- No insert/update/delete policy for anyone — see table comment above.

insert into public.schools (domain, name, short_name, alumni_email_retained)
values ('unh.edu', 'University of New Hampshire', 'UNH', true)
on conflict (domain) do nothing;

-- ============================================================
-- profiles — one row per user, created at the end of onboarding (never at
-- signup time). Readable by everyone; a user can update only their own row.
-- Student vs. alumni is derived from grad_year at read time — no stored
-- role column, per the brief.
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  display_name text not null,
  school_id uuid not null references public.schools(id),
  grad_year integer not null,
  created_at timestamptz not null default now(),
  -- Lowercase, 3-20 chars, letters/digits/underscore only — enforced here
  -- too (not just in the onboarding form) so it can't be bypassed by a
  -- direct client call. This alone rules out "@" and "." in a handle.
  constraint profiles_handle_format check (handle ~ '^[a-z0-9_]{3,20}$'),
  -- Deliberately short reserved list, same spirit as
  -- competition_profile_handle_reserved (0003) — a basic screen against
  -- impersonation-flavored handles, not a comprehensive filter. This is a
  -- separate list from that table's (separate identity system, see header
  -- comment), so keep both in sync by hand if either changes.
  constraint profiles_handle_reserved check (
    handle not in ('admin', 'dispatch', 'moderator', 'support', 'official', 'help')
  )
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles
  for select
  using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- posts — readable by everyone, including signed-out visitors. Insert/
-- update require auth.uid() = author_id; there is no delete policy at all
-- because deletion is soft (deleted_at via update), never a real DELETE.
-- ============================================================
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint posts_body_not_empty check (length(trim(body)) > 0)
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_author_id_idx on public.posts (author_id);

alter table public.posts enable row level security;

drop policy if exists "posts_select_all" on public.posts;
create policy "posts_select_all"
  on public.posts
  for select
  using (true);

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
  on public.posts
  for insert
  with check (auth.uid() = author_id);

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own"
  on public.posts
  for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- Enforces the twelve-hour edit window on posts.body while always leaving
-- deleted_at free to be set at any time (soft-delete has no time limit, so
-- the window can't live in a single USING clause on the update policy
-- above — it has to distinguish "editing" from "deleting" per-column,
-- which only a trigger can do). Also auto-sets edited_at whenever body
-- actually changes, so the client is never trusted to set it — this is
-- what makes the "edited" marker in the UI trustworthy. Runs regardless of
-- what calls UPDATE (app code, a direct client call, anything), so it
-- can't be bypassed.
create or replace function public.enforce_post_edit_window()
returns trigger
language plpgsql
as $$
begin
  if new.body is distinct from old.body then
    if now() - old.created_at > interval '12 hours' then
      raise exception 'Posts can only be edited within 12 hours of posting.';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists posts_enforce_edit_window on public.posts;
create trigger posts_enforce_edit_window
  before update on public.posts
  for each row
  execute function public.enforce_post_edit_window();

-- ============================================================
-- replies — flat, one level, readable by everyone. Delete-only: the brief
-- gives this table no edited_at column at all (unlike posts), so there is
-- no edit path, intentionally — a typo can only be fixed by deleting and
-- reposting. The trigger below makes that unbypassable rather than just a
-- UI omission.
-- ============================================================
create table if not exists public.replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint replies_body_not_empty check (length(trim(body)) > 0)
);

create index if not exists replies_post_id_created_idx on public.replies (post_id, created_at);
create index if not exists replies_author_id_idx on public.replies (author_id);

alter table public.replies enable row level security;

drop policy if exists "replies_select_all" on public.replies;
create policy "replies_select_all"
  on public.replies
  for select
  using (true);

drop policy if exists "replies_insert_own" on public.replies;
create policy "replies_insert_own"
  on public.replies
  for insert
  with check (auth.uid() = author_id);

drop policy if exists "replies_update_own" on public.replies;
create policy "replies_update_own"
  on public.replies
  for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create or replace function public.enforce_reply_immutable_body()
returns trigger
language plpgsql
as $$
begin
  if new.body is distinct from old.body then
    raise exception 'Replies cannot be edited, only deleted.';
  end if;
  return new;
end;
$$;

drop trigger if exists replies_enforce_immutable_body on public.replies;
create trigger replies_enforce_immutable_body
  before update on public.replies
  for each row
  execute function public.enforce_reply_immutable_body();

-- ============================================================
-- auth_code_requests — rate-limit bookkeeping for the OTP request-code
-- route (app/api/auth/request-code/route.ts): caps requests per email and
-- per IP address to stop the route being used to mail-bomb a stranger's
-- real school inbox. Not user-scoped (there's no session yet at this
-- point) and has no legitimate client access path — same "zero policies"
-- pattern as ticker_snapshot (0002) and competition_month_status (0003).
-- Only the service-role client (the route handler) ever reads/writes it.
-- Supabase has its own built-in OTP rate limits too; this doesn't replace
-- those, it's a second, app-controlled layer in front of them.
-- ============================================================
create table if not exists public.auth_code_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_code_requests_email_created_idx on public.auth_code_requests (email, created_at desc);
create index if not exists auth_code_requests_ip_created_idx on public.auth_code_requests (ip, created_at desc);

alter table public.auth_code_requests enable row level security;
-- Zero policies — see table comment above.
