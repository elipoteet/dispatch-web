-- A self-service LinkedIn link on your own profile — you paste the URL yourself, this is
-- not the deferred LinkedIn-sign-in/alumni-verification path (docs/state-of-play.md's
-- Deferred section, docs/phase-four.md's "Now at" line) and makes no claim the link is
-- verified. Written to be run by hand in the Supabase SQL editor, same as every migration
-- before this one. Additive only: linkedin_url is nullable, so every existing profile is
-- unaffected until its owner sets one.

alter table public.profiles add column if not exists linkedin_url text;

-- No CHECK constraint on shape here, deliberately — unlike profiles_handle_format (a
-- value this app itself generates the rules for), a LinkedIn URL is external, free-form
-- text (regional subdomains, /in/, /pub/, vanity paths) that a hand-written regex would
-- likely reject valid cases of. The app validates "looks like a linkedin.com link" client-
-- side (components/social/LinkedInField.tsx) instead; profiles_update_own (0006_social.sql)
-- already covers this column, so no RLS change is needed.
