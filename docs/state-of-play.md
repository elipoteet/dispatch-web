# The Dispatch — State of Play

August 2026. One page covering what exists, what is left, and what was deliberately deferred.
Written to be the fastest way for anyone, human or Claude, to know where this project stands.

Read `docs/product-spec.md` (v2) for what the product is.

## Where it lives

- **Live old product:** https://www.dispatchresearch.com, serving `master`, untouched
- **The new product:** https://try.dispatchresearch.com, serving the `feat/social-v1`
  branch, public to read, noindexed
- **Branch:** `feat/social-v1`, pushed, **not merged**, no PR
- Vercel Deployment Protection is off for this domain, so strangers can actually open it

## Done, and live on try.dispatchresearch.com

**Identity.** Sign up with a school email, eight-digit code, choose handle, display name, and
graduation year. Past years produce alumni badges automatically. Domain-gated server-side
before any code is sent, rate-limited three per hour by email and by IP. School badge on
every post, tinted with the school's own colour, near-white in dark mode.

**Posting.** Four types: Take, Question, Thesis with a scaffold and a 320-character floor,
and Link with a required reason. Typing a ticker attaches live market data after an 800ms
debounce and freezes it onto the post as JSON, so the feed makes zero provider calls.
Change-my-mind field. Position disclosure, required when a ticker is attached and locked
after publish by a database trigger.

**Conversation.** Replies. Pushback with an 80-character minimum, counted separately.
Editable for twelve hours with an edited marker, deletable any time leaving a tombstone that
keeps its replies.

**Spaces.** Create one and you own it. Invite by link only, resolving all four arrival states
including signed-out signup that lands the new user inside the space. Owner can rename, edit,
remove members, regenerate the link, transfer ownership, and delete. Posting inside is bare:
text and a ticker, no types.

**Promotion.** The author publishes a space post to the public feed through a modal that
collects type, change-my-mind, and position. Creates a public copy, leaves replies behind,
marks both sides. The public copy shows an anonymous "from a space" kicker and never names
the club.

**Everything else.** Public read without an account. Profiles with avatars, uploaded and
resized client-side to 400x400 WebP. Email notifications for replies and pushback plus a
weekly digest, with per-type toggles and unsubscribe tokens. Ticker tape on Finnhub with a
twenty-minute cache. Light and dark themes with a toggle. Footer, disclaimer, and guidelines
pages.

**Database.** Twelve migrations applied by hand. Row level security throughout, including
`security definer` helpers for space membership after a real recursion bug was caught and
fixed.

## Left to do before a club sees it

### Phase four, parity and feel

The visual diff is written and reviewed. Nothing is implemented. In priority order:

1. **Mobile bottom navigation.** Spaces are currently unreachable on a phone, since the nav
   is hidden below 900px with nothing replacing it. This is not polish, it is the core of
   the product being unusable on the device the first club will open the link on.
2. **Optimistic updates** on the composer, reply box, space composer, and promotion. Nothing
   appears until a server round trip completes, which is what makes it feel like a website.
3. **The bordered card container.** The feed sits loose on the page rather than inside a
   card. Biggest visual return for the least work.
4. **Modal behaviour.** Escape does not close, focus is not managed, the page behind still
   scrolls. Backdrop click already works.
5. **Ticker search and the profile card**, both in the left rail.
6. Smaller items: space header tint, position buttons stretching to fill, backdrop blur,
   profile URL chip, name weight, hover pills on the action row.

### Phase five, research inside the site

Specified in `docs/phase-five.md`, approved, not started. `/research` on this branch is
currently the **retired product** — old masthead and nav, the Time Machine, a Leaderboard
link, and a rule-based buy/hold/sell verdict, which the spec forbids outright. Clicking
Research in the left nav throws a student out of the social app.

Phase five moves `/research` and `/research/[ticker]` into the social shell and rebuilds the
ticker page as the prototype's version: header, one-year chart, six numbers, and every post
about that ticker above them. Cashtags in posts, replies and space posts become clickable, so
"one click from any post" stops being aspirational. The Leaderboard is hidden on this branch.
No watchlist, no scorecard, no verdict.

The rate-limit plan is settled: the five Finnhub-backed numbers come free from the existing
`getTickerSnapshot`, and the chart is one Twelve Data request per ticker per day behind
`unstable_cache`.

### Things that have never met reality

Every one of these is built and unverified.

- **SPF and DKIM on the domain, never confirmed.** Every user needs a code to sign up, and
  every notification depends on it. Highest-value unresolved item.
- `RESEND_API_KEY` not confirmed in Vercel production, so notifications may simply not send
  on the live site.
- Unsubscribe verified by code path, never clicked from a real email. Has a legal dimension.
- The weekly digest has never sent a populated email.
- Notification toggles built, never click-tested.
- Avatar upload built, never click-tested against the live bucket.
- Transfer ownership never tested with a second real member.
- The full invite flow has never been walked on a real phone from a real text message.
- Nothing has been tested at 390px.

### Decisions never made

- The moderation escalation path, and who executes it.
- Whether a promoted post should ever name the space it came from.
- Whether spaces can span schools.
- Terms and privacy need a lawyer, particularly the seventeen-year-old freshman question.
- Two handle systems still exist with no shared uniqueness constraint.
- Ticker search has no home on mobile, since the rail is hidden there.
- `getFeedPosts` has a flat limit of fifty with no cursor, so post fifty-one silently does
  not exist for a reader.

## Deliberately deferred

Not cancelled. Waiting until there are users, because a feature built before anyone uses the
product is designed from a guess.

Themes. Watchlists, the public and private toggle, and network aggregates. Thesis-tested
events, still the best deferred idea in the product. School thresholds and school-versus-school
comparisons. Campus editors as a formal role, since a club officer already is one. Push
notifications and the installable web app. Redirects from the old memo URLs. Direct messages, permanently unless something
changes. Brokerage connections. Paid tiers. LinkedIn sign-in for alumni without a school
address.

## Cut

The Open, the pinned daily thread. From the desk, the weekly hand-picked selection. Both
because Spaces do their jobs permanently and better.

## After phases four and five

There is no phase six build. The next thing is a club.

One officer, one conversation, one invite link. The product exists to find out whether a
finance club will move its pitch discussion somewhere it survives, and no further code
answers that question.
