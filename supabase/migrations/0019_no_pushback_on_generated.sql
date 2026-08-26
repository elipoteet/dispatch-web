-- Fixes a real gap found live: app/api/replies/route.ts blocks pushback on a generated post
-- at the application layer only. Confirmed empirically — a direct authenticated call straight
-- to the REST API, bypassing that route entirely, successfully inserted a pushback reply on a
-- Dispatch AI post. The min-pushback-length rule has this same shape (app-layer only) and
-- that's an acceptable gap for a UX nag; this one is different — "the bot makes no claims, so
-- there is nothing to push back on" is a real product invariant (docs/phase-seven.md section
-- E), the same category of thing this app already backs with a DB trigger elsewhere (role
-- grants, post metadata immutability), not just a UI nicety.

create or replace function public.enforce_no_pushback_on_generated()
returns trigger
language plpgsql
as $$
begin
  if new.is_pushback then
    if exists (select 1 from public.posts where id = new.post_id and generated = true) then
      raise exception 'This post is generated and can''t be pushed back on.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists replies_no_pushback_on_generated on public.replies;
create trigger replies_no_pushback_on_generated
  before insert on public.replies
  for each row
  execute function public.enforce_no_pushback_on_generated();
