-- Dispatch Social — Phase 2, Part A (the composer). See docs/phase-two.md.
-- Written to be run by hand in the Supabase SQL editor, same as every migration before
-- this one — this repo doesn't use the Supabase CLI's migration runner. Additive only:
-- every new column is nullable or defaulted, so existing phase-one rows survive
-- unchanged. Uses IF NOT EXISTS / DROP CONSTRAINT IF EXISTS throughout so it's safe to
-- re-run.
--
-- Part B (pushback + notifications) is a separate file, 0008_pushback_notifications.sql
-- — matches the brief's own "Part A can go live on its own" framing, so there's a clean
-- boundary if Part A ships before Part B is ready rather than one file mixing both.

-- ============================================================
-- posts — new composer fields. type/ticker/ticker_snapshot/position/link_url are set
-- once at publish and are not editable afterward (see docs/phase-one-recap.md's note on
-- edit scope) — only body and change_my_mind can change within the existing 12-hour
-- edit window (enforce_post_edit_window, 0006_social.sql, untouched by this file).
-- ============================================================
alter table public.posts add column if not exists type text not null default 'take';
alter table public.posts add column if not exists ticker text;
alter table public.posts add column if not exists ticker_snapshot jsonb;
alter table public.posts add column if not exists position text;
alter table public.posts add column if not exists change_my_mind text;
alter table public.posts add column if not exists link_url text;

alter table public.posts drop constraint if exists posts_type_valid;
alter table public.posts add constraint posts_type_valid
  check (type in ('take', 'question', 'thesis', 'link'));

alter table public.posts drop constraint if exists posts_position_valid;
alter table public.posts add constraint posts_position_valid
  check (position is null or position in ('owns', 'none'));

-- A ticker is only "attached" once it carries a stated position — see docs/phase-two.md:
-- "Whenever a ticker is attached, the author must state whether they hold a position."
alter table public.posts drop constraint if exists posts_ticker_requires_position;
alter table public.posts add constraint posts_ticker_requires_position
  check (ticker is null or position is not null);

-- Enforced here as well as in the composer UI, so it can't be bypassed by a direct
-- client call — same reasoning as every other DB-level constraint in this app.
alter table public.posts drop constraint if exists posts_thesis_min_length;
alter table public.posts add constraint posts_thesis_min_length
  check (type <> 'thesis' or length(body) >= 320);

alter table public.posts drop constraint if exists posts_link_requires_url;
alter table public.posts add constraint posts_link_requires_url
  check (type <> 'link' or link_url is not null);

create index if not exists posts_ticker_idx on public.posts (ticker) where ticker is not null;

-- Locks type/ticker/ticker_snapshot/position/link_url once a post exists — "frozen to
-- this post" (docs/phase-two.md) and position is explicitly "a snapshot of the moment of
-- writing... does not change if the author's position changes later"
-- (docs/product-spec.md). The existing enforce_post_edit_window trigger only reacts to
-- body changing, so without this a determined author could still rewrite these fields
-- via a direct client call after publish — same "DB layer, not just UI" reasoning as
-- every other constraint in this app. body and change_my_mind are unaffected and remain
-- editable within the existing 12-hour window.
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
  then
    raise exception 'Post type, ticker, and position cannot change after publishing.';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_enforce_metadata_immutable on public.posts;
create trigger posts_enforce_metadata_immutable
  before update on public.posts
  for each row
  execute function public.enforce_post_metadata_immutable();

-- No RLS changes needed — posts_select_all/posts_insert_own/posts_update_own
-- (0006_social.sql) are column-agnostic and already cover these new fields correctly.
