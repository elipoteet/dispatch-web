-- School color accent for the badge dot. See docs/phase-two-recap.md for context on this
-- point in the build. Written to be run by hand in the Supabase SQL editor, same as
-- every migration before this one. Additive only: both columns nullable, so a school
-- with no colors set just falls back to the existing gold accent (enforced in the
-- SchoolBadge component, not here) rather than breaking.

alter table public.schools add column if not exists color_primary text;
alter table public.schools add column if not exists color_secondary text;

-- UNH Blue, Pantone 282C — https://www.brandcolorcode.com/university-of-new-hampshire.
-- color_secondary left null: UNH's official secondary is white, which isn't a usable
-- accent dot against a cream page — better to fall back to gold than seed an invisible
-- color. Fill in per-school as more schools are added, same as every other schools row.
update public.schools
set color_primary = '#041E42'
where domain = 'unh.edu' and color_primary is null;
