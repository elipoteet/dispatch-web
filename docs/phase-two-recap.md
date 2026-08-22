# Phase Two Recap — for the Claude Project, ahead of Phase Three

Paste this into the Claude Project's knowledge alongside `product-spec.md`,
`phase-one.md`, `phase-one-recap.md`, `phase-two.md`, `alumni-verification.md`,
`legal-and-guidelines.md`, and `claude-project-context.md`, all of which
live in this repo's `docs/`. Written so a fresh Claude conversation — Project
or Code — can pick up exactly where this left off.

## What shipped

Everything in `docs/phase-two.md`, both parts, live-tested end to end. Still
on `feat/social-v1` (continued rather than branched — that was your call
when asked), pushed, **not merged**. `master`/production untouched
throughout.

**Part A — the composer**: four post types (Take/Question/Thesis/Link) as
pills driving placeholder and publish-gating; Thesis auto-inserts the
`What happened / Why it matters / What I am watching from here` scaffold and
stays disabled below 320 characters with a live "N more characters" hint;
Link requires a URL plus a reason sentence. Typing `$TICKER` (any case —
auto-uppercases live as you type) attaches a real data card after an 800ms
debounce — price, day change, P/E, revenue growth, gross margin, 52-week
range — and freezes it onto the post as JSON at publish time. Position
(`owns`/`none`) is required once a ticker's attached and, along with
type/ticker/snapshot/link_url, is locked after publish by a DB trigger; only
`body` and `change_my_mind` stay editable in the existing 12-hour window.
The frozen snapshot renders on the published post (your call, not just
stored data) via the same `TickerCard` component used live in the composer.
**Confirmed empirically that loading the feed fires zero provider calls** —
watched the server log across repeated reloads, line count never moved.

**Part B — pushback and notifications**: replies can be marked pushback
(80-character minimum, enforced in the DB, counted separately from plain
replies everywhere — `PostCard` shows both counts, `ReplyItem` shows a
Pushback label). Reply/pushback authors get a real email containing the
actual reply text (not a teaser), sent via a genuinely new integration —
the `resend` npm package and a `RESEND_API_KEY`, both added this phase (see
below). A weekly Sunday-evening digest recaps replies/pushback received
that week. Every notification email carries a working unsubscribe link
(a stored per-profile token, not a signed link). Three `notify_*` toggles
live on a user's own profile page.

## Real things found while building, not assumptions

- **"Resend is already wired up" (docs/phase-two.md) was only half true.**
  Verified directly before writing any code: Resend powered Supabase Auth's
  SMTP relay for sign-in codes only, configured entirely in the Supabase
  dashboard. The app had zero ability to send an arbitrary email — no
  package, no API key documented anywhere, no code path. Building
  notifications meant adding all of that from scratch, not wiring up
  something that already existed.
- **No existing function returned the composer card's fields in one call.**
  `loadReport`/`loadTickerData` (the existing `/research/[ticker]` composite)
  pulls `fetchPrices` — Twelve Data, the tight 8-req/min quota — plus news
  the card doesn't need, so it was the wrong tool despite being the obvious
  reach-for. Built a new thin `getTickerSnapshot()`
  (`lib/analysis/tickerSnapshot.ts`) composing only `fetchFundamentals` +
  `fetchFinnhubDayChange`, both 100% Finnhub. Verified the gross-margin
  field directly against a live Finnhub response before trusting it
  (`grossMarginTTM`, not explicitly typed on `FundamentalsMetrics`).
- **A shared stateful regex is a real bug, not a style nitpick.** The
  cashtag detection/rendering helpers originally shared one module-level
  `RegExp` with the `g` flag. Confirmed empirically that calling `.exec()`
  in one function silently makes a later `.matchAll()` in another skip
  earlier matches, because `matchAll` starts scanning from the regex's
  current `lastIndex` rather than always resetting to 0. Fixed by compiling
  a fresh `RegExp` per call (`lib/social/cashtags.tsx`).
- **The digest's own content is a real gap in the brief, not a design
  choice I got to skip.** `docs/phase-two.md` describes the digest as
  covering "everything else" beyond immediate pushback/reply emails, but
  its own "Explicitly not in scope" list rules out Follow relationships
  this phase — so there was genuinely nothing else to digest. Resolved
  (your call) as a personal activity recap of the same replies/pushback
  data that already exists, not a placeholder.
- **Reply creation had to move off phase one's direct-client-insert
  pattern.** Sending a notification needs `RESEND_API_KEY`, which can never
  reach the browser, so `ReplyBox` now posts through a new
  `POST /api/replies` route instead. Still uses the same request-scoped,
  RLS-respecting server client for the insert (not service-role — nothing
  escalates privilege); the email send is best-effort in a try/catch that
  can never fail the reply itself. Post creation is untouched.
- **A `_`-prefixed API route folder silently 404s.** Hit this directly
  while verifying email sending for real: Next.js treats any
  underscore-prefixed folder as a private, routing-excluded segment. Not
  documented anywhere obvious; found by testing, not by reading first.
- **CSS written against a class name doesn't apply if the element's actual
  class doesn't match — and a semantic HTML element can inherit unwanted
  styling from the *other* surface's generic element selectors.** Two real
  bugs from this in one session: `.reply-box`'s textarea never matched the
  `.composer textarea` selector at all (different class), so it rendered
  fully unstyled; and the new `Footer.tsx` component's plain `<footer>` tag
  inherited the equity-research surface's `footer { background: navy;
  text-transform: uppercase; ... }` rule (keyed off the bare element, not a
  class) straight through, since nothing explicitly overrode it. Both
  fixed; the footer fix is now written defensively (explicitly resets
  every property the old rule sets) rather than just patching the visible
  symptom.

## Data model

`supabase/migrations/0007_composer.sql` (Part A) — `posts` gains
`type`/`ticker`/`ticker_snapshot`/`position`/`change_my_mind`/`link_url`,
all nullable/defaulted, plus a `posts_enforce_metadata_immutable` trigger
locking everything but `body`/`change_my_mind` after publish.

`supabase/migrations/0008_pushback_notifications.sql` (Part B) — `replies`
gains `is_pushback` + an 80-character CHECK constraint; `profiles` gains
`notify_replies`/`notify_pushback`/`notify_digest` (default true) and a
unique `unsub_token`. Both applied by hand in the Supabase SQL editor, same
convention as every migration so far — this repo still has no CLI runner.

## New environment variable

`RESEND_API_KEY` — a real Resend API key (Resend dashboard → API Keys),
distinct from the SMTP username/password used for sign-in codes. Documented
in README and `.env.local.example`; set in local `.env.local`, **not yet
confirmed set in Vercel's production environment** — needs doing before
Part B reaches real users.

## Known gaps / open items for whoever picks this up

- **SPF on `dispatchresearch.com` still never fully confirmed** — flagged
  in `docs/phase-one-recap.md`, still true, and now matters for two more
  email types instead of just the sign-up code.
- **Unsubscribe was verified by code path, not by clicking a real link** —
  the one link actually clicked used a deliberately fake token from a
  throwaway test route (since deleted). The lookup logic is simple
  (`profiles.unsub_token` equality) but hasn't been exercised by a real
  email's real link yet.
- **The digest has never sent a populated email** — confirmed it runs
  clean end to end (`{sent, skipped, total}`), but the only live run
  happened right after test replies were cleared, so `sent` was 0. Worth
  triggering again once there's real activity to summarize.
- **Notification toggles were built, not click-tested** — on a user's own
  profile page, direct client-side update, same pattern as `AccountModal`.
- **No `docs/phase-three.md` exists yet.** `docs/product-spec.md`'s build
  order has phase three as ticker research pages, clickable cashtags,
  thesis-tested events, and redirects from the old memo URLs — the natural
  next thing, but nothing describing it the way phase one and two had a
  dedicated brief.
- Two independent handle systems and the Monthly Leaderboard's fate are
  still open from `docs/phase-one-recap.md` — untouched this phase.

## Where to look for more

- `docs/product-spec.md` — full product vision, phase 3–5 build order.
- `docs/phase-one-recap.md` — phase one's equivalent of this document.
- `docs/phase-two.md` — the brief this recap summarizes.
- `docs/claude-project-context.md` — tech stack, brand rules, Next.js
  gotchas, and the "how to talk to Eli" plain-language note (he's a finance
  student, not an engineer — keep explanations outcome-first, jargon-light).
