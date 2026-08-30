# Phase Seven Recap — for the Claude Project

Paste this into the Claude Project's knowledge alongside `product-spec.md` (v2),
`phase-six.md`, `phase-six-recap.md`, `phase-seven.md`, `docs/dispatch-ai-design.html`, and
`claude-project-context.md`, all of which live in this repo's `docs/`. Covers Dispatch AI, an
automated, template-only posting account — no language model, deliberately — on
`feat/social-v1`, pushed, **not merged**. `master`/production untouched throughout.

## What shipped

**The account.** `role = 'system'` — a fourth value on the enum from phase six (this brief's
own reference to "`0013_roles.sql`" is stale; the real migration is `0014_roles.sql`, noted in
this phase's own migration comment so it doesn't confuse a future reader). Handle `dispatchai`,
display name "Dispatch AI," no school, no grad year — the same null path the mentor role
already needed, reused rather than rebuilt. `profiles.id` has a hard FK to `auth.users(id)`,
so the account itself was created by a one-off script run once with the service-role key (a
real but unreachable auth user, an email address that isn't a real domain and is never on any
allowlist), not through signup — same pattern as every test/admin account created this
session. Its profile has a one-line description, verbatim from the brief: "An automated
account. It posts counts and moves, never opinions, and never replies."

**The badge is a rounded square, not a rosette.** "Shape carries human-vs-machine, colour
carries which kind of human" — a fifth rosette colour would have quietly changed what
"verified" means for the other four tiers, so `VerifiedBadge.tsx`'s render branches on shape
instead, right in the component, so nobody adds a sixth rosette later without noticing the
rule. Same shape logic reaches the avatar (`Avatar.tsx` gained an optional `verifiedRole`
prop that picks the square variant internally, rather than pushing that decision out to every
call site) and its "AI" initials fallback (one narrow, explicit exception in `initials()` for
this exact display name — the general two-word algorithm would have produced "DA").

**Five templates**, each a normal `posts` row (`generated boolean`, `generated_template`,
`generated_ref_post_id`, `generated_stats jsonb`) so the feed, ticker pages, and permalinks
all work with no special cases. Ticker moved (reuses the existing cached
`getTickerSnapshot`, never a new uncached fetch — candidate tickers come from today's real
posts, zero provider calls, before the one cached lookup per candidate). Unanswered question
(checked first among the daily templates — "the most useful of the five on a thin site," per
the brief). First mention. Promotion flow and busiest beat, weekly, gated to Sunday (matching
the existing digest cron's own weekly day). At most one post a day, never the same template
twice in a row, and a `QUIET_DAY_FLOOR` constant (silence is the documented default below it
— "a bot narrating a four-person feed is embarrassing"). Every template query filters
`space_id is null` and `generated = false` — private Spaces never leak in, and a generated
post never counts toward its own activity. Pushback is disabled on generated posts (replies
stay on) — enforced both client-side (the toggle doesn't render) and, after a live bypass
attempt proved the client-side check alone wasn't enough, at the database layer too.

## Real things found while building, and after — three of them, none in review

- **Reserving the handle "dispatchai" blocked the real account from ever using it.** The
  reserved-handle CHECK has no way to tell "a stranger squatting the name" apart from "the
  actual account being created" — found running the seed script for real, which failed with
  the exact constraint meant to protect the name. `profiles.handle`'s own unique constraint is
  what actually protects it once seeded; reserving it further after that point isn't just
  unneeded, it's wrong. Fixed by dropping it back out of the reserved list, in both the
  database and `lib/social/handle.ts`'s own copy.
- **A generated post mentioning a ticker got rejected by the position-disclosure rule** —
  there's no "does the bot hold this stock" concept, but `posts_ticker_requires_position`
  didn't know that. Found running the cron job for real against a live test question. Fixed
  with the exact same exemption `0011_spaces.sql` already carved out for Space posts, for the
  identical reason — extended to cover `generated = true` too.
- **Pushback-on-a-generated-post was blocked at the application layer only.** Confirmed
  empirically, not assumed: a direct authenticated call straight to the REST API, bypassing
  the app's own route entirely, successfully inserted a pushback reply on a Dispatch AI post.
  This is a real product invariant ("the bot makes no claims, so there's nothing to push back
  on"), the same category of thing this app already backs with a database trigger elsewhere —
  not just a UI nicety, unlike the pushback-minimum-length rule, which stays app-layer-only on
  purpose. Added a trigger; re-verified the same bypass afterward and confirmed it now fails
  with a clear error, while a normal (non-pushback) reply to the same post still succeeds.

**A real post has actually gone out.** With the site's real feed nearly empty, the daily
cron correctly refused to post — the quiet-day floor working exactly as designed, not a
bug. With Eli's explicit, one-time sign-off, the floor was temporarily set to 0 in a local
build only (never committed), the job run once against real data, and the floor put back to 3
immediately after — confirmed reverted with a clean `git diff` before moving on. It posted
the busiest-beat template, honestly: *"$VST was the most-posted ticker this week: 1 post
across $VST"* — accurate, not inflated, since that's genuinely the only real post that ticker
had.

## Known gaps / open items for whoever picks this up

- No admin UI for granting faculty or the mentor allowlist reaches this phase either —
  same as phase six, one-off SQL/scripts, not built because it wasn't asked for.
- The digest-exclusion question the brief raised resolves by construction rather than new
  code: the bot's own `notify_replies`/`notify_pushback`/`notify_digest` are all `false`, and
  the digest cron only ever recaps a recipient's *own* posts, so the bot never becomes a
  recipient and nothing else needed to change.
- 390px was not checked in a real browser, only reasoned through via CSS.
- Everything still open from `docs/phase-six-recap.md` is **still open** — nothing in this
  phase touched any of it.

## Where to look for more

- `docs/phase-seven.md` — the brief this recap summarizes.
- `docs/phase-six-recap.md` — everything before this.
- `docs/state-of-play.md` — current overall status, audited against the live site.
