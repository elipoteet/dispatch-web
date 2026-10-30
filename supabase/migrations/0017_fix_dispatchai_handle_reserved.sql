-- Fixes a real bug in 0016_dispatch_ai.sql, found live: adding "dispatchai" to
-- profiles_handle_reserved blocks it from EVERYONE, including the seed script trying to
-- create the actual Dispatch AI account with that exact handle — the CHECK has no way to
-- tell "a stranger squatting the name" apart from "the real account being created."
--
-- The reserved list's actual job is closing the window before the real account exists;
-- profiles.handle already has its own `unique` constraint (0006_social.sql), which is what
-- actually stops anyone else from also claiming "dispatchai" once the real account has it.
-- So once seeded, reserving it further is not just unnecessary, it's actively wrong. Simplest
-- correct fix: drop it back out of the reserved list.

alter table public.profiles drop constraint if exists profiles_handle_reserved;
alter table public.profiles add constraint profiles_handle_reserved check (
  handle not in ('admin', 'dispatch', 'moderator', 'support', 'official', 'help')
);
