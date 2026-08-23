# Pre-Launch Polish Recap — for the Claude Project, ahead of Phase Three

Paste this into the Claude Project's knowledge alongside `product-spec.md`,
`phase-one.md`, `phase-one-recap.md`, `phase-two.md`, `phase-two-recap.md`,
`alumni-verification.md`, `legal-and-guidelines.md`, and
`claude-project-context.md`, all of which live in this repo's `docs/`.
Covers the work done *after* `phase-two-recap.md` and before phase three —
four small requests, worked through in order, still on `feat/social-v1`
(continued, not branched), pushed, **not merged**. `master`/production
untouched throughout.

## What shipped

**1. Signed-out and empty-state polish** (three items, one request):
- Zero counts no longer render. A post with no replies shows a plain
  "Reply" link instead of "0 replies"; the pushback link is omitted
  entirely until there's at least one, rather than showing "0 pushbacks."
- Signed-out visitors clicking Reply or the post-detail reply box, or
  landing on the feed's composer slot, now get a plain-text prompt
  ("Posting and replying require a verified school email address," with
  Sign up / Sign in links) instead of a form that would silently fail,
  error, or do nothing — checked directly, not assumed.
- The signed-out composer prompt states the school-email requirement up
  front, before anyone clicks through and finds out only after typing.

**2. Profile pictures.** `profiles.avatar_url` (nullable text); a new
public-read Supabase Storage bucket `avatars`, with insert/update/delete
policies scoped to `(storage.foldername(name))[1] = auth.uid()::text` —
path convention `{user_id}/avatar.webp`, always overwritten in place so old
versions never accumulate. Upload UI is a plain
`<input type="file" accept="image/*">` (that attribute alone is what gets
mobile to offer camera roll *and* camera — no special mobile handling
needed), with client-side canvas resizing to a centre-cropped 400×400 WebP
before upload, a 5MB reject with a clear message, and a Remove photo
action. New shared `Avatar` component (photo or initials fallback) is
wired into the feed, replies, the profile page, the header, the composer,
and the reply box — falls back to initials wherever `avatar_url` is null,
so nothing breaks for anyone who never sets one.

**3. School colors, twice.** First pass: `schools.color_primary` /
`color_secondary` (nullable text), UNH seeded with its official navy blue,
rendered as a small dot before the school badge. Live feedback after
seeing it in the actual feed — with only one school's color in play, the
dot read as decorative rather than informative — so it was replaced with
the second, current version: the badge's own "UNH '28" text is tinted
`color_primary` directly (the checkmark stays the badge's normal color, so
it still reads as a distinct verification mark), falling back to the
existing gold accent when a school has no color set.

**4. Ticker tape restored, plus a real light/dark toggle on this surface.**
`components/home/TickerTape.tsx` and `app/api/tape/route.ts` were recovered
from `master`'s git history (deleted in phase one when the old homepage
hero moved into `app/(research)/`) rather than rebuilt, specifically to
keep the rate-limit fix already baked into that version — Finnhub's quote
endpoint instead of Twelve Data, so the tape can't compete with a real
`/research/[ticker]` search for the same 8-req/min budget. Restyled as a
thin, low-contrast bar fixed to the bottom of the viewport on desktop,
hidden below 640px (a fixed bottom bar would fight the composer and
browser chrome on a phone). Cache lengthened 10 → 20 minutes since the
composer's `$TICKER` lookup now also draws on Finnhub. Separately, added
the app's existing `ThemeToggle` button to the social header — it already
existed and worked (research surface's `TopNav` has had it since before
phase one), it just was never placed anywhere on this surface, so there
was no way to switch themes here at all. Because of that toggle, the school
badge's dark-mode behavior became a real requirement, not a hypothetical:
most school colors (UNH's navy, e.g.) are unreadable against a dark badge,
so dark mode now ignores `color_primary` entirely and always renders
near-white instead.

## Real things found while building, not assumptions

- **The dot vs. text-color decision was reversed based on how it actually
  looked, not on a spec change.** Ships as text-color from the start of
  phase three; the dot never shipped to production. Worth remembering if
  anything downstream (screenshots, other docs) still shows the dot
  version.
- **An inline `color` style can never be overridden by a stylesheet
  rule** — only another inline style can win. Dark mode's "always white"
  override had to go through a CSS custom property
  (`style={{ "--school-accent": colorPrimary }}`, then
  `.school-badge-school { color: var(--school-accent) }` in the actual
  stylesheet) rather than setting `color` directly inline, specifically so
  `[data-theme="dark"] .school-badge-school { color: var(--ink) }` could
  win. Any future per-instance dynamic color needs to go through this same
  pattern if a theme (or anything else) might need to override it later.
- **The theme toggle button and all its CSS variables already existed
  app-wide** — root `layout.tsx`'s flash-avoiding init script,
  `[data-theme]`/`prefers-color-scheme` variable flips, `useIsDarkMode()` —
  none of that was new work. The gap was narrower than "add dark mode":
  the *button* was never rendered anywhere on the social surface, so
  visitors here had no way to reach a mode the app already fully supported
  outside of matching their OS setting.
- **Explicit-choice-beats-OS-preference is a two-part CSS pattern in this
  codebase, not one rule.** `[data-theme="dark"] .foo {}` only fires once
  someone has actually clicked the toggle (that's when `data-theme` gets
  set on `<html>` at all — see the root layout's init script). Someone
  whose OS is in dark mode but who has never clicked anything needs a
  second rule inside `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...} }`.
  Missing the second half is an easy way to ship something that "works in
  testing" (because testing usually means clicking the toggle) but misses
  the more common real case.
- **The 5-symbol/cached-fetch tape fix was recovered exactly, not
  reconstructed from memory.** Diffed the pre-deletion file against
  `master`'s current tip first to confirm they were byte-identical before
  restoring, so there was no risk of silently losing a later fix that
  might have landed on `master` after the deletion commit. Verified the
  "no provider-call growth" claim empirically against a production build
  with a temporary cache-miss log, not by reading `withCache`'s code and
  assuming it worked — five repeated `/api/tape` hits plus a full feed load
  produced exactly one real Finnhub call.

## Data model

`supabase/migrations/0009_school_colors.sql` — `schools` gains
`color_primary`/`color_secondary` (nullable text); UNH seeded with
`#041E42`. `color_secondary` deliberately left null — UNH's official
secondary is white, unusable as a dot against a cream page (though notably
that's exactly the color dark mode now hardcodes for badge text instead of
reading the column).

`supabase/migrations/0010_avatars.sql` — `profiles` gains `avatar_url`
(nullable text); new `avatars` Storage bucket (public read) plus its four
`storage.objects` policies (select-all, insert/update/delete scoped to the
uploader's own folder).

**Both written by hand and handed to you to paste into the Supabase SQL
editor this session — status of whether they've actually been run against
the live database is not confirmed from this side.** Confirm before
assuming avatar upload or school-color badges work in production; the code
handles either column being absent from a not-yet-migrated database about
as gracefully as it can (avatar falls back to initials, badge falls back
to gold), but Storage uploads will hit a real error without 0010 applied.

## Known gaps / open items for whoever picks this up

- **0009 and 0010 need confirming as applied** (see above) — this is the
  first thing to check before touching anything else.
- **Only one school (UNH) has a color set.** The dot-vs-text-color call
  was made almost blind — worth a second look once a handful of schools
  with genuinely different colors are seeded, to confirm the palette
  doesn't clash or wash out against the cream/dark backgrounds at scale.
- **Avatar upload has been built and typechecked/built/linted, not
  click-tested with a real image against the live bucket** — same
  situation phase two's notification toggles were in at handoff.
- **The ticker tape's mobile behavior is "hidden entirely" below 640px**,
  per your instruction — if a later request wants it inline at the end of
  the feed on mobile instead, that's a different, not-yet-built path.
- Every open item listed in `docs/phase-two-recap.md` (SPF on
  `dispatchresearch.com`, unsubscribe not yet clicked from a real email,
  digest never sent a populated email, two independent handle systems, the
  Monthly Leaderboard's fate) is **still open** — nothing in this pass
  touched any of them.
- **`docs/phase-three.md` still doesn't exist.** `docs/product-spec.md`'s
  build order has phase three as ticker research pages, clickable
  cashtags, thesis-tested events, and redirects from the old memo URLs —
  same as noted in `phase-two-recap.md`, still nothing describing it the
  way phase one and two had a dedicated brief.

## Where to look for more

- `docs/product-spec.md` — full product vision, phase 3–5 build order.
- `docs/phase-two-recap.md` — everything before this document.
- `docs/claude-project-context.md` — tech stack, brand rules, Next.js
  gotchas, and the "how to talk to Eli" plain-language note.
