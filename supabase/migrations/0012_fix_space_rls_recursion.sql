-- Fixes a real bug in 0011_spaces.sql, found live: "infinite recursion detected in policy
-- for relation space_members" (Postgres error 42P17). space_members_select_fellow's USING
-- clause queried space_members from within a policy defined ON space_members itself — a
-- classic Postgres RLS trap. Evaluating the policy requires running the subquery, which is
-- itself subject to the same policy, which requires running the subquery again, forever.
-- Confirmed empirically against the live database (not guessed): creating a space via
-- create_space() worked fine (it's security definer, so it never hit this), but reading it
-- back — via getSpaceBySlug, the nav's getUserSpaces, everything — failed with exactly this
-- error, which is why the space page 404'd right after creation and the nav's Spaces
-- section stayed empty even though the row genuinely existed.
--
-- Standard fix: move the self-referencing check into a `security definer` function. A
-- definer function runs as its owner (the table owner, effectively a superuser in this
-- context), and RLS is bypassed for the table owner by default — so the function's internal
-- query against space_members does NOT re-trigger the policy currently being evaluated,
-- breaking the cycle. Also swaps every other membership-check subquery in 0011 (spaces,
-- posts, replies policies) to call these same two functions instead of repeating the raw
-- subquery — not required for correctness there (those are policies on other tables, so
-- they were never self-referencing), but one well-tested definition of "is a member of" is
-- safer than four copies of the same subquery, and it shortens the RLS evaluation chain
-- those policies were otherwise going through (querying space_members still meant paying for
-- its SELECT policy on every check).

create or replace function public.is_space_member(p_space_id uuid, p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.space_members sm
    where sm.space_id = p_space_id and sm.profile_id = p_profile_id
  );
$$;

grant execute on function public.is_space_member(uuid, uuid) to anon, authenticated;

create or replace function public.is_space_owner(p_space_id uuid, p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.spaces s
    where s.id = p_space_id and s.owner_id = p_profile_id
  );
$$;

grant execute on function public.is_space_owner(uuid, uuid) to anon, authenticated;

-- The actual recursion fix.
drop policy if exists "space_members_select_fellow" on public.space_members;
create policy "space_members_select_fellow"
  on public.space_members
  for select
  using (public.is_space_member(space_members.space_id, auth.uid()));

drop policy if exists "space_members_delete_owner" on public.space_members;
create policy "space_members_delete_owner"
  on public.space_members
  for delete
  using (
    space_members.profile_id <> auth.uid()
    and public.is_space_owner(space_members.space_id, auth.uid())
  );

-- Not recursion-prone (different table), but simplified onto the same
-- helper for consistency and a shorter RLS evaluation chain.
drop policy if exists "spaces_select_member" on public.spaces;
create policy "spaces_select_member"
  on public.spaces
  for select
  using (public.is_space_member(spaces.id, auth.uid()));

drop policy if exists "posts_select_all" on public.posts;
create policy "posts_select_all"
  on public.posts
  for select
  using (space_id is null or public.is_space_member(space_id, auth.uid()));

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
  on public.posts
  for insert
  with check (
    auth.uid() = author_id
    and (space_id is null or public.is_space_member(space_id, auth.uid()))
  );

drop policy if exists "replies_select_all" on public.replies;
create policy "replies_select_all"
  on public.replies
  for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = replies.post_id
        and (p.space_id is null or public.is_space_member(p.space_id, auth.uid()))
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
        and (p.space_id is null or public.is_space_member(p.space_id, auth.uid()))
    )
  );
