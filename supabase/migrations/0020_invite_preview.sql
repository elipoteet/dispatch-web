-- Invite acceptance modal. See docs/invite-modal-build-brief.md.
-- Written to be run by hand in the Supabase SQL editor, same as every migration before this
-- one — this repo doesn't use the Supabase CLI's migration runner.

-- ============================================================
-- get_space_by_invite_token — widened, not replaced with a new name.
-- Previously returned just (id, slug, name); the invite modal needs a
-- description and a member count to show before the visitor has joined
-- (or even signed in), and there is no other RLS-legal read path for a
-- non-member — spaces/space_members/posts/replies are all member-only
-- SELECT (0012_fix_space_rls_recursion.sql). A return-type change needs
-- drop + create in Postgres, not a plain create-or-replace.
--
-- Deliberately still no avatars/member identities here — anyone holding
-- this link can call this function signed out, with no membership check
-- at all (grant below is to anon too, unchanged), so a member list would
-- expose a private club's roster to anyone who'd merely seen a forwarded
-- link. Count only.
--
-- Every existing caller (app/(social)/j/[token]/page.tsx, both call
-- sites) only ever checked `data.length === 0` — never read a specific
-- column — so this widening is fully backward compatible; no other call
-- site needs to change.
-- ============================================================
drop function if exists public.get_space_by_invite_token(text);

create or replace function public.get_space_by_invite_token(p_token text)
returns table(
  id uuid,
  slug text,
  name text,
  description text,
  owner_id uuid,
  member_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id,
    s.slug,
    s.name,
    s.description,
    s.owner_id,
    (select count(*)::integer from public.space_members sm where sm.space_id = s.id) as member_count
  from public.spaces s
  where s.invite_token = p_token
    and s.deleted_at is null;
$$;

grant execute on function public.get_space_by_invite_token(text) to anon, authenticated;
