# The Dispatch — State of Play

30 August 2026. What exists, what is broken, and what is next.
Audited against the live site and the repo, not against the briefs.

Read `docs/product-spec.md` (v2) for what the product is.

## Where it lives

- **Old product:** https://www.dispatchresearch.com, serving `master`, untouched
- **New product:** https://try.dispatchresearch.com, serving `feat/social-v1`
- **Branch:** `feat/social-v1`, not merged, no PR
- Signed-out visitors now get a sign-in screen at the root; every other route stays public

## Built since the last update

Phases five, six and seven were all built between 25 and 26 August. **None of them has a
recap**, which is why this file had drifted so far from reality.

**Phase five — research inside the site.** `/research` and `/research/[ticker]` now live in
the social shell; the retired product's copy is gone. A ticker page carries price, day change,
a one-year chart, the 52-week range, market cap, P/E, revenue growth, gross margin, average
volume, and every post about that ticker. Post matching catches both an attached ticker and a
`$SYM` mention in the body. The desk lists tickers people have actually posted about rather
than a static grid. No rating, no score, no verdict anywhere on it. Confirmed live.

*Deviation, deliberate:* the numbers sit **above** the conversation, not below. Eli's call,
overriding the brief, and documented in the code.

**Phase six — landing screen and roles.** A signed-out visitor at the root gets the sign-in
screen. The gate is scoped to the feed page's own render, exactly as the brief demanded, so
`/j/[token]` invite links still work signed out — verified against the live site, and this was
the highest-risk regression in the phase. Metadata flips correctly: the signed-out screen is
indexable, the signed-in feed is not. `0014_roles.sql` adds the four human roles plus mentor
onboarding. `VerifiedBadge` ships all four rosette tiers and the square system badge, with the
shape rule written into the component so nobody adds a fifth rosette by accident.

**Phase seven — Dispatch AI.** Migrations `0016`–`0019`, a cron route at
`/api/cron/dispatch-ai`, a `generated` flag on posts, pushback disabled on generated posts, and
generated posts excluded from ticker counts so the bot cannot report on itself.

**Also built, unplanned:** LinkedIn on profiles (`0013`), a display-name cooldown (`0015`), and
several phase-four items — the bordered feed card, optimistic posting, and the rail ticker
search.

## Broken or wrong, in priority order

1. **The research desk inherits the retired product's page description.** `/research/page.tsx`
   sets no `description` of its own, so it falls through to the site-wide default in the root
   layout, which still reads *"A full research memo on any U.S. stock in five seconds —
   scored, sourced, and written to be read."* That word "scored" is the retired product's
   language, and the description is what appears in Google results and link previews. The page
   itself is clean. One line to fix.

2. **The sign-in screen is an overlay, not a replacement.** The header, nav and footer are
   still rendered in the page underneath it. Two real consequences: a keyboard user can tab
   into navigation links hidden behind the overlay, and the page that is meant to be indexable
   carries the shell's text. The fix is to mark the background `inert` while the screen is up,
   or not render the shell for a signed-out visitor at all.
3. **No recaps for phases four through seven.** Nothing records what was actually built, what
   deviated, or what was found along the way. This file is the stopgap; the recaps are still
   worth writing while the work is fresh.
4. **Nothing else.** Two items that appeared here in the first draft of this audit were wrong
   and have been removed — see "Corrections" below.

## Corrections to the 30 August audit

Two claims in the first version of this file were checked against the repo and the live site
and did not hold. Recording them so they are not repeated.

- **"`/leaderboard` is live and two clicks from the feed."** Wrong. It is not linked anywhere
  in the social surface — not the nav, not any page — and it was removed from `sitemap.ts`
  with a comment citing `docs/phase-five.md` section D. The brief's instruction was "remove the
  entry, leave the route files in place," and that is exactly what was done. It is reachable
  only by typing the URL. The audit also blamed the wrong phase.
  *Still worth deciding later:* `robots.ts` disallows `/portfolio` and `/api/` but not
  `/leaderboard`. That costs nothing today, because the whole branch is noindexed apart from
  the sign-in screen. It becomes a live question on the day this merges to `master`.
- **"Saturday's changes may not be deployed."** They are pushed and live. Confirmed against
  origin.

## Still never verified

Unchanged from the last audit, and now more urgent because everything else is further along.

- **SPF and DKIM on the domain.** Every signup needs a code to arrive. Still the single
  highest-value unknown in the project.
- `RESEND_API_KEY` present in Vercel production.
- The weekly digest has never sent a populated email.
- Unsubscribe has never been clicked from a real email.
- Avatar upload has never been click-tested against the live bucket.
- Ownership transfer has never been tested with a second real member.
- The invite flow has never been walked on a real phone from a real text.
- Nothing has been tested at 390px.
- **New:** no faculty or mentor account has been granted and viewed end to end.

## The thing no feature fixes

**The site has almost no posts.** Dispatch AI's cron has now been run live and there is a real
generated post up, which is one more than there was. Beyond that, `/research` lists a single ticker, VST, with one post behind it.
Every remaining item on this page is finishing work on a room nobody is in yet.

## Decisions still open

- Moderation escalation, and who executes it.
- Whether a promoted post should ever name the space it came from.
- Whether spaces can span schools.
- Terms and privacy need a lawyer, particularly the seventeen-year-old freshman question.
- Two handle systems with no shared uniqueness constraint.
- `getFeedPosts` has a flat limit of fifty with no cursor.
- Whether generated posts belong in the weekly digest.

## Deferred

Themes. Watchlists and the public/private toggle. Thesis-tested events — still the best
deferred idea in the product, and the natural next job for Dispatch AI. School thresholds and
school-versus-school. Campus editors as a formal role. Push notifications and the installable
app. Redirects from the old memo URLs. Direct messages. Brokerage connections. Paid tiers.

## Cut

The Open. From the desk. Both because Spaces do their jobs better.

## What is next

For Claude Code, in order:

1. Give `/research` its own page description. One line, and it is currently the only place the
   retired product's scoring language still shows to the outside world.
2. Make the shell behind the sign-in screen `inert`, so keyboard users cannot tab into
   navigation hidden underneath it.
3. Write the phase four to seven recaps while the work is still fresh.

For Eli, and only Eli can do it:

4. **Send yourself a signup code from a browser you have never used.** SPF, DKIM and
   `RESEND_API_KEY` in production have never been confirmed. Every single person who joins
   needs that email to arrive. If it does not, nothing above matters.

Then:

5. Put real posts on the site.
6. One club officer, one invite link.
