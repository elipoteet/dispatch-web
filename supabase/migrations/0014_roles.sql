-- Verified roles: student | faculty | mentor (docs/phase-six.md section B). Faculty and
-- mentor are granted, never self-selected — no public application, no checkbox at signup.

-- ============================================================
-- Alumni stays DERIVED, not stored. It already comes from grad_year < the current year
-- everywhere in this app (lib/social/badge.ts's isAlumni) — adding a stored 'alumni' role
-- value here would be a second source of truth for the same fact, which is exactly the kind
-- of drift bug this phase's own brief warns against. role only ever holds student, faculty,
-- or mentor; a profile's *displayed* badge tier is computed as "role = 'student' and
-- isAlumni(grad_year) -> alumni tier, otherwise role itself" — see
-- components/social/VerifiedBadge.tsx and lib/social/badge.ts.
-- ============================================================
alter table public.profiles add column if not exists role text not null default 'student';
alter table public.profiles drop constraint if exists profiles_role_valid;
alter table public.profiles add constraint profiles_role_valid
  check (role in ('student', 'faculty', 'mentor'));

-- Somewhere to say who a faculty/mentor is beyond a school and class year, since a mentor
-- has neither. A department for faculty ("Finance"), a firm or role for a mentor ("Managing
-- Director, XYZ Capital"). Null and unused for students.
alter table public.profiles add column if not exists affiliation text;

-- ============================================================
-- A mentor has no school email and no class year — school_id/grad_year have to become
-- nullable to let that account exist at all. Every other role still requires both: the
-- CHECK below keeps that guarantee at the database layer rather than trusting the UI to
-- never produce a student/faculty row with a null school. (Eli's call, in the session that
-- produced this migration: relax the signup domain gate for a maintained allowlist rather
-- than have me create mentor accounts by hand — see mentor_allowlist below.)
-- ============================================================
alter table public.profiles alter column school_id drop not null;
alter table public.profiles alter column grad_year drop not null;
alter table public.profiles drop constraint if exists profiles_school_grad_required_unless_mentor;
alter table public.profiles add constraint profiles_school_grad_required_unless_mentor
  check (role = 'mentor' or (school_id is not null and grad_year is not null));

-- ============================================================
-- mentor_allowlist — the maintained list of non-school emails allowed to request a signup
-- code (app/api/auth/request-code/route.ts checks this as a fallback once the normal
-- schools.domain lookup misses). Same "zero policies, service-role only" pattern as
-- auth_code_requests above — this table has no legitimate client access path either.
-- ============================================================
create table if not exists public.mentor_allowlist (
  email text primary key,
  affiliation text,
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.mentor_allowlist enable row level security;
-- Zero policies — see table comment above.

-- ============================================================
-- role/affiliation are readable by anyone already (profiles_select_all, 0006_social.sql, is
-- column-agnostic — no change needed there) but must never be SET by the row's own owner
-- through the normal client path. profiles_insert_own/profiles_update_own are ALSO
-- column-agnostic, so without this trigger a signed-in user could set their own role at
-- signup (INSERT) or grant themselves "mentor" with a plain .update() call later (UPDATE).
--
-- On INSERT, this also does the actual granting for an allowlisted mentor: their onboarding
-- INSERT still requests role='student' (OnboardingForm.tsx never sends anything else, and
-- couldn't usefully — school_id/grad_year would be null with role left at 'student', which
-- profiles_school_grad_required_unless_mentor above would reject outright), but if their
-- auth email is on mentor_allowlist, this function overwrites role/affiliation onto the row
-- being inserted itself, server-side, before profiles_school_grad_required_unless_mentor
-- ever evaluates. The client never successfully requests "mentor" for itself; whether that
-- request gets honored is decided here, against a table only Eli's own service-role scripts
-- can write to. Everyone else's INSERT is rejected if it tries to set anything but the
-- student default, same as before.
--
-- security definer + set search_path: needs to read auth.users (to get the inserting user's
-- email) and mentor_allowlist, neither of which the invoking authenticated role can select
-- directly — same reasoning is_space_member/is_space_owner already use in this codebase
-- (0012_fix_space_rls_recursion.sql) for a table-owner-privileged helper.
--
-- Confirm both directions by an actual attempt from a signed-in client before calling this
-- done, not by reading this comment: (1) a plain signup still can't self-grant mentor/
-- faculty, (2) an allowlisted email's onboarding INSERT really does come out as role=mentor.
-- ============================================================
create or replace function public.enforce_role_not_self_granted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_allowlist_affiliation text;
  v_on_allowlist boolean;
begin
  if TG_OP = 'INSERT' then
    if auth.uid() is null then
      return new; -- service-role insert (not the normal signup path) — trusted as-is
    end if;

    select email into v_email from auth.users where id = new.id;
    select affiliation, true into v_allowlist_affiliation, v_on_allowlist
      from public.mentor_allowlist where email = lower(coalesce(v_email, ''));

    if v_on_allowlist then
      new.role := 'mentor';
      new.affiliation := v_allowlist_affiliation;
      return new;
    end if;

    if new.role is distinct from 'student' or new.affiliation is not null then
      raise exception 'role and affiliation can only be granted, not self-set.';
    end if;
    return new;
  end if;

  if (new.role is distinct from old.role or new.affiliation is distinct from old.affiliation)
    and auth.uid() = old.id
  then
    raise exception 'role and affiliation can only be granted, not self-set.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_role_not_self_granted on public.profiles;
create trigger profiles_enforce_role_not_self_granted
  before insert or update on public.profiles
  for each row
  execute function public.enforce_role_not_self_granted();
