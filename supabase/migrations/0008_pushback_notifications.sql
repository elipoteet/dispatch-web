-- Dispatch Social — Phase 2, Part B (pushback + notifications). See docs/phase-two.md.
-- Written to be run by hand in the Supabase SQL editor, same as every migration before
-- this one. Additive only: every new column is nullable or defaulted, so existing rows
-- survive unchanged.

-- ============================================================
-- replies — pushback flag. A pushback is a disagreement "with a reason": enforced here
-- as an 80-character minimum, same "DB layer, not just UI" reasoning as every other
-- constraint in this app. Counted separately from plain replies at the query layer
-- (lib/social/queries.ts), not by a separate table.
-- ============================================================
alter table public.replies add column if not exists is_pushback boolean not null default false;

alter table public.replies drop constraint if exists replies_pushback_min_length;
alter table public.replies add constraint replies_pushback_min_length
  check (not is_pushback or length(body) >= 80);

-- No RLS changes needed — replies_insert_own (0006_social.sql) is column-agnostic and
-- already covers is_pushback correctly. enforce_reply_immutable_body (0006_social.sql)
-- already blocks editing body at all, so a pushback reply can't be shortened below 80
-- characters after the fact either — only soft-deleted, same as any other reply.

-- ============================================================
-- profiles — per-type notification toggles, all defaulting to on, plus a stored
-- unsubscribe token. A stored per-profile token is simpler and more easily revocable
-- than a signed-link scheme, and needs no new server secret.
-- ============================================================
alter table public.profiles add column if not exists notify_replies boolean not null default true;
alter table public.profiles add column if not exists notify_pushback boolean not null default true;
alter table public.profiles add column if not exists notify_digest boolean not null default true;
alter table public.profiles add column if not exists unsub_token uuid not null default gen_random_uuid();

alter table public.profiles drop constraint if exists profiles_unsub_token_unique;
alter table public.profiles add constraint profiles_unsub_token_unique unique (unsub_token);

-- No RLS changes needed — profiles_update_own (0006_social.sql) is column-agnostic and
-- already covers the notify_* toggles. The unsubscribe route
-- (app/api/notifications/unsubscribe/route.ts) uses the service-role client, since an
-- unauthenticated recipient clicking an email link has no session to satisfy
-- profiles_update_own's auth.uid() = id check.
