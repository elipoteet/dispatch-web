-- Fixes a real bug in 0016_dispatch_ai.sql, found live running the cron job by hand: a
-- generated post that mentions a ticker (templates 1 and 3) has no position to disclose —
-- there's no "does the bot hold this stock" concept — but posts_ticker_requires_position
-- (0007_composer.sql) doesn't know that, and rejected the insert outright.
--
-- 0011_spaces.sql already relaxed this exact constraint for the exact same reason on Space
-- posts ("no position-disclosure UI at all, by design") — same fix, same precedent, just
-- adding the generated case alongside the space_id one already there.

alter table public.posts drop constraint if exists posts_ticker_requires_position;
alter table public.posts add constraint posts_ticker_requires_position
  check (space_id is not null or generated = true or ticker is null or position is not null);
