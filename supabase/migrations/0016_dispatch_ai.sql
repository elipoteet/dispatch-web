-- Dispatch AI: a fifth role for one automated, template-only posting account
-- (docs/phase-seven.md). Note for future readers: that brief cites
-- "0013_roles.sql" for the role migration — the real file is
-- 0014_roles.sql (0013 is the LinkedIn migration). Additive only.

-- ============================================================
-- profiles.role gains 'system'. The account itself is NOT created by this
-- file — profiles.id has a hard FK to auth.users(id), so a profile can't
-- exist without a real auth user first. It's created by a one-off script
-- run once via the service-role key (same pattern used all session for
-- test/admin accounts), documented in this repo's session notes, not run
-- through signup. Since that insert runs with the service-role key
-- (auth.uid() is null in that context), 0014_roles.sql's
-- profiles_enforce_role_not_self_granted trigger's existing
-- "if auth.uid() is null then return new" branch already lets it through
-- untouched — no trigger change needed here.
-- ============================================================
alter table public.profiles drop constraint if exists profiles_role_valid;
alter table public.profiles add constraint profiles_role_valid
  check (role in ('student', 'faculty', 'mentor', 'system'));

-- A mentor has no school/grad year; the bot has neither either — same null
-- path, same reason.
alter table public.profiles drop constraint if exists profiles_school_grad_required_unless_mentor;
alter table public.profiles add constraint profiles_school_grad_required_unless_mentor
  check (role in ('mentor', 'system') or (school_id is not null and grad_year is not null));

-- Reserve the handle before the account exists, same spirit as the
-- existing reserved list (0006_social.sql). Keep lib/social/handle.ts's
-- RESERVED_HANDLES in sync by hand, per that file's own comment.
alter table public.profiles drop constraint if exists profiles_handle_reserved;
alter table public.profiles add constraint profiles_handle_reserved check (
  handle not in ('admin', 'dispatch', 'moderator', 'support', 'official', 'help', 'dispatchai')
);

-- ============================================================
-- posts.generated and its companions. A generated post is a normal posts
-- row (same feed, same ticker pages, same permalink, no special cases
-- there) authored by the system profile, marked so it can be styled
-- differently and — this is the important part — excluded from every
-- count the bot itself makes, so it never reports on its own activity
-- (docs/phase-seven.md section F's "self-reference loop" warning).
-- ============================================================
alter table public.posts add column if not exists generated boolean not null default false;

-- Which of the five templates produced it — drives the label pill and the
-- footer link/copy. Null iff generated = false; the CHECK below is what
-- keeps that bidirectional, not just convention.
alter table public.posts add column if not exists generated_template text;

-- The specific post a generated post points at: the unanswered question
-- (template 2) or the actual first human post about a ticker (template
-- 3). on delete set null — a deleted target degrades the generated post
-- to "no link" rather than ever 404ing a reader who clicks through
-- (docs/phase-seven.md section F).
alter table public.posts add column if not exists generated_ref_post_id uuid references public.posts(id) on delete set null;

-- Only template 1 (ticker moved) uses this — a small frozen array of
-- {label, value} stat tiles (day-change %, posts-this-week count, theses-
-- open count), computed once at generation time. Same "frozen to the
-- post" philosophy as ticker_snapshot elsewhere in this app; not reusing
-- ticker_snapshot itself since the design's stat-tile block is a
-- different shape from TickerCard.
alter table public.posts add column if not exists generated_stats jsonb;

alter table public.posts drop constraint if exists posts_generated_fields_consistent;
alter table public.posts add constraint posts_generated_fields_consistent check (
  (generated = false and generated_template is null and generated_stats is null)
  or (generated = true and generated_template is not null)
);

alter table public.posts drop constraint if exists posts_generated_template_valid;
alter table public.posts add constraint posts_generated_template_valid check (
  generated_template is null or generated_template in (
    'ticker_moved', 'unanswered', 'first_mention', 'promotion_flow', 'busiest_beat'
  )
);

-- Generated posts are never edited (enforce_post_metadata_immutable,
-- 0007_composer.sql, already locks type/ticker/etc — no change needed
-- there) and never pushed back on (enforced in app/api/replies/route.ts,
-- not the DB — pushback is a replies-table concern, not a posts-table
-- one) — no trigger changes needed for either.

create index if not exists posts_generated_idx on public.posts (generated, created_at desc) where generated = true;
