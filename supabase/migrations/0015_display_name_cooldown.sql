-- Self-service display name editing, rate-limited to once every 14 days (Eli's call). Found
-- because onboarding pre-fills the display name field from the email's local part and a
-- mentor signing up with a personal Gmail address ended up stuck with "eli.poteet" — there
-- was no way for anyone to fix that afterward. Additive only.

alter table public.profiles add column if not exists display_name_changed_at timestamptz;

-- Null until the first real change — the value onboarding sets isn't a "change," it's the
-- initial value, so it never starts the cooldown clock on its own.

-- ============================================================
-- BEFORE UPDATE, same "DB layer, not just UI" reasoning as every other rate limit/window in
-- this app (the twelve-hour post edit window, the reply/pushback rate limits). Whoever makes
-- the change, this stamps display_name_changed_at to now() whenever display_name actually
-- changes — that's what makes the 14-day cooldown mean anything, including for a service-
-- role-driven fix (an admin correction should still reset the clock; the point is limiting
-- how often the NAME changes, not who's allowed to change it once). The block itself only
-- applies when the account's own owner is the one making the change (auth.uid() = old.id) —
-- a service-role call is trusted not to need rate-limiting against itself.
-- ============================================================
create or replace function public.enforce_display_name_cooldown()
returns trigger
language plpgsql
as $$
begin
  if new.display_name is distinct from old.display_name then
    if auth.uid() = old.id
      and old.display_name_changed_at is not null
      and now() - old.display_name_changed_at < interval '14 days'
    then
      raise exception 'You can change your display name once every 14 days. Try again on %.',
        to_char(old.display_name_changed_at + interval '14 days', 'FMMonth FMDD, YYYY');
    end if;
    new.display_name_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_display_name_cooldown on public.profiles;
create trigger profiles_enforce_display_name_cooldown
  before update on public.profiles
  for each row
  execute function public.enforce_display_name_cooldown();
