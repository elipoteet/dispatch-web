# Phase Four Recap — for the Claude Project, ahead of Phase Five

Paste this into the Claude Project's knowledge alongside `product-spec.md` (v2),
`phase-three.md`, `phase-three-recap.md`, `phase-four.md`, and `claude-project-context.md`,
all of which live in this repo's `docs/`. Covers the visual-parity and feel/mobile pass —
"no new features," per the brief's own explicit scope — on `feat/social-v1`, pushed, **not
merged**. `master`/production untouched throughout.

## What shipped

**Part 1 — visual parity.** A full screen-by-screen diff against `docs/prototype-v2.html`
was written and shown before any code changed, per the brief's own "do not start coding
until I approve it." Every row was either fixed or explicitly kept with a stated reason.
Shipped: `.social-content-card` (the bordered, rounded wrapper the feed/post/profile/space
pages sit inside, matching the prototype's `.main` — applied per-page, not to the shared
layout slot, so it doesn't nest inside signup/login's own auth card); a header search bar for
tickers (`TickerSearchBar.tsx`, plain symbol input to `/research/[symbol]`, deliberately not
a live autocomplete — no fuzzy-search endpoint exists anywhere in the app, and building one
would be new backend capability); a profile card in the left rail under Spaces
(`.nav-me`, avatar/name/handle/school); the "+ Ticker" hint made explicit ("Type a $TICKER...
and its data attaches automatically" — nothing previously told a first-time composer that
typing `$` does anything); dark-mode contrast fix for `.post-type--thesis`; the hover-pill
treatment on reply/pushback actions; the promote modal's backdrop blur and full-width
position-toggle buttons; the profile's shareable-URL chip; a two-step progress indicator
(`AuthSteps.tsx`) on signup/onboarding.

**Part 2 — feel.** Optimistic updates throughout, via React 19's `useOptimistic` (first use
in this codebase): a new post/reply appears instantly, before the server confirms
(`useOptimisticFeed.ts`/`useOptimisticReplies`, `FeedClient.tsx`/`SpaceFeedClient.tsx`/
`ReplyListClient.tsx` each owning one shared instance between their composer and their list).
Edit and delete are optimistic too — delete patches `deletedAt` in place rather than removing
the row, since the real row survives as a tombstone after `router.refresh()` and an actual
removal would just pop back. Modal accessibility (`useModalA11y.ts`): Escape closes, focus
moves in on open and restores on close, body scroll locks — built once, deliberately scoped,
since this app has exactly one modal (`PromoteAction`). Skeleton loading via Next's
`loading.tsx` convention on the feed/post/profile/space routes, reusing the existing
`.skeleton`/shimmer CSS rather than building new. Avatar upload shows a local
`URL.createObjectURL()` preview immediately, ahead of the real Storage round trip.

**Part 3 — mobile.** A bottom nav (Feed/Spaces/Profile) at the same ≤900px breakpoint the
left rail already hides at, mutually exclusive with it. A new `/spaces` index page, since
Spaces had no reachable entry point on a phone before this. 44px minimum tap targets at
≤640px. Header `flex-wrap` plus hiding the redundant school badge at ≤480px (now one tap away
via the Profile tab). The ticker tape (still on at the time) stacks above the mobile nav
rather than overlapping it, without changing its own separate ≤640px hide threshold.

## Real things found while building, and after

- **`redirect()` silently stopped producing real HTTP redirects on several routes** —
  `/onboarding`, the new `/spaces`, `/s/new` — found live, testing the new `/spaces` page with
  curl and getting a `200` with full page content instead of a `307`. Root cause, confirmed
  against this Next version's actual docs (`node_modules/next/dist/docs/`, not training data):
  `redirect()` degrades to a client-side meta-refresh instead of a real 307 "in a streaming
  context," and `app/(social)/loading.tsx` — added earlier in this same phase for the feed's
  skeleton — sat at the root of the whole `(social)` route group, putting *every* sibling
  route under it into that streaming context, not just the feed. Invisible to a browser
  (which follows the meta-refresh transparently) but a real break for curl, and for anything
  else that expects an actual redirect. Fixed by moving the feed's `page.tsx` and
  `loading.tsx` into their own nested route group, `app/(social)/(feed)/` — route groups
  don't affect the URL, so `/` still resolves the same, but the skeleton's Suspense boundary
  no longer cascades to `/onboarding` and every other sibling that doesn't have — and
  shouldn't need — a `loading.tsx` of its own. Verified after: real 307s confirmed via curl on
  all three previously-affected routes.
- **The invite link pointed at production while testing locally** — `.env.local` deliberately
  pins `NEXT_PUBLIC_SITE_URL` for reply-notification emails (correct there, since those get
  opened from any device), but wrong for an invite link meant to be pasted back into the same
  browser being tested. Fixed by deriving the origin from the actual request's headers
  instead.
- **The "from a space" marker was rendering in the wrong place, then found missing on two of
  three pages entirely.** First fix moved it above the post header instead of inside the
  actions row (matching a screenshot report: "it should say what group it's from... not right
  under Reply"); in fixing that, found the deeper cause — the marker had been threaded through
  each page's own `actions` prop individually and silently never wired into the feed or
  profile pages. Moved the logic inside `PostCard` itself, derived directly from
  `post.promotedFrom`/`post.spaceId`, so no future call site can forget it.
- **Composer/reply spacing was too tight**, reported with a screenshot. Fixed with a margin on
  `.composer` and a border between consecutive `.reply` elements.

## Known gaps / open items for whoever picks this up

- **The real-phone invite walk was never done.** Every mobile item above was verified
  structurally (curl, CSS review) and against a desktop browser at a simulated width, never on
  an actual device.
- **Scroll position on back-navigation and layout shift were reasoned about, not
  independently measured** — relying on Next's default behavior rather than a real
  network-throttled test.
- Everything still open from `docs/phase-three-recap.md` (SPF/DKIM, unsubscribe never clicked
  from a real email, digest never sent populated, two handle systems, the flat 50-post limit
  with no cursor) is **still open** — nothing in this phase touched any of it.

## Where to look for more

- `docs/phase-four.md` — the brief this recap summarizes.
- `docs/phase-three-recap.md` — everything before this.
- `docs/state-of-play.md` — current overall status, audited against the live site.
