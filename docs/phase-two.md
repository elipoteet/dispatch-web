# Phase Two Build Brief — The Composer

August 2026. Follows `docs/phase-one.md`. Read `docs/product-spec.md` first, especially the
sections on the post, when a thesis is tested, and the composer.

## What phase two is

Phase one proved people can post. Phase two is about what they post.

This is the highest-leverage phase in the whole plan, because the composer shapes how people
write before they write anything. Every mechanism here exists to make being specific easier
than being vague.

It splits into two shippable parts. Part A can go live on its own.

---

# Part A — the composer

## 1. Post types

Four types, chosen before writing rather than inferred afterward. The type sits as a row of
pills above the text box and changes both the placeholder and the bar for posting.

- **Take.** A short observation. No length requirement.
- **Question.** Something the author is working out. Explicitly legitimate at two lines, so
  that asking never looks like low-effort posting. No length requirement.
- **Thesis.** An argument. Taller text box. On selection, drop a light scaffold into the
  empty box: `What happened`, `Why it matters`, `What I am watching from here`, each on its
  own line with blank space beneath. Post stays disabled until the body is at least 320
  characters. A hint near the button says how many more are needed rather than failing
  silently.
- **Link.** Requires a URL and at least one sentence saying why it matters. A link with no
  reason gets skipped by everyone anyway.

The scaffold is inserted automatically on choosing Thesis, not behind an optional button.
Almost nobody clicks an optional formatting button; almost everybody types into a structure
that is already there. If the author switches away from Thesis and the body is still the
untouched scaffold, clear it.

## 2. Ticker detection and the attached data card

Typing `$NVDA` anywhere in the draft attaches that company's data to the post, displayed
inside the composer as the author writes.

The card shows symbol, company name, price, day change, P/E, revenue growth, gross margin,
and the 52-week range. It is labelled as pulled in automatically and frozen to this post.

**This is the mechanism that makes specificity cheap.** Nobody has to leave the app to look
up a multiple, so nobody has an excuse to be vague. It is the single most valuable thing in
this phase.

### The rate limit rules, which are not optional

Twelve Data's free tier is eight requests per minute and a composer that fires on every
keystroke will destroy it.

- Debounce the lookup by at least 800ms after typing stops.
- Only the **first** recognized ticker in a draft triggers a fetch. Later ones render as
  styled text and attach nothing.
- Reuse the existing `unstable_cache` wrappers in `lib/providers.ts`. Do not add a new
  fetch path.
- **The snapshot is stored on the post as JSON at publish time.** Rendering a feed of fifty
  posts must cost zero API calls, ever. This is the most important architectural rule in
  this phase, and getting it wrong will not be obvious until the feed has real traffic.
- If a lookup fails or the symbol is unknown, fail quietly. The text stays, no card appears,
  the post still works.

### Cashtag rendering

`$TICKER` in a published post body renders in gold monospace, visually distinct.

**It does not link anywhere yet.** Ticker research pages arrive in phase three, and linking
to the old research pages would send people to a rating badge the spec forbids. Style it,
leave it inert, wire it up next phase.

## 3. The change-my-mind field

As soon as a ticker is attached, an optional single-line field appears beneath the composer:
**What would change your mind?**

Optional on purpose. Requiring it would suppress posting. It will still be the most useful
line in most posts that have one.

On a published post it renders as its own marked block: a gold left rule, a small uppercase
label reading `WHAT WOULD CHANGE MY MIND`, then the text.

This field is the raw material for the retention mechanic in phase three, so store it as its
own column rather than parsing it out of the body later.

**Instrument the fill rate.** What percentage of ticker posts include this line is the
single most important number to come out of phase two, because the whole thesis-tested
mechanic runs on it. If it is ten percent, phase three needs rethinking.

## 4. Position disclosure

Whenever a ticker is attached, the author must state whether they hold a position. Two
states, **own it** or **no position**, and the post cannot publish until one is chosen.

Required rather than optional, because a default that means "no position" makes a claim by
inaction, and a false claim by inaction is worse than no claim at all.

It renders on the post as a small factual line next to the ticker. Not a badge of shame,
just a fact. It is a snapshot of the moment of writing, like the price data, and does not
change if the author's position changes later.

Nobody else in retail research does this. Say so in the guidelines copy, which is already
written in `docs/legal-and-guidelines.md`.

---

# Part B — pushback and notifications

## 5. Pushback

A reply can be marked as pushback: a disagreement, with a reason.

- A `Push back` action sits alongside `Reply` on every post.
- A pushback requires at least 80 characters, which is the mechanism that enforces "with a
  reason." A downvote is free and produces nothing; a disagreement that costs you a sentence
  produces an argument.
- It renders with a distinct label on the reply and is counted separately from replies.
- Both counts are public. **Likes stay uncounted and there are still no follower counts
  anywhere.** You get more of whatever you count.

Pushback is half the loop and it is the behavior most worth encouraging.

## 6. Email notifications

Resend is already wired up. Three events, and only three:

- Someone pushed back on your post.
- Someone replied to you.
- The weekly digest.

**The rule that keeps this from becoming noise: only notify about something that names you
or something you explicitly chose to follow.** No "five new posts you missed."

Immediate emails for the first two. A weekly digest on Sunday evening for everything else,
because a school inbox mid-week is where mail goes to die.

**The email must be the thing, not an advertisement for the thing.** A pushback email
contains the actual argument, readable in the inbox without clicking. People who can get the
value without visiting will trust the emails and open them.

Per-type toggles in settings, and every email needs a working unsubscribe.

Before any of this reaches real users, settle the SPF and DKIM question flagged in
`docs/phase-one-recap.md`. Verification codes already depend on deliverability and
notifications will depend on it more.

---

## Data model

Additive only. New migration `0007_composer.sql`, hand-written, pasted into the Supabase SQL
editor by hand, same as every other migration in this repo.

**`posts`** gains:
- `type` text not null default `'take'`, checked against take, question, thesis, link
- `ticker` text nullable, uppercase
- `ticker_snapshot` jsonb nullable, the frozen data at publish time
- `position` text nullable, checked against `owns`, `none`
- `change_my_mind` text nullable
- `link_url` text nullable

Constraints worth enforcing in the database rather than only in the UI:
- if `ticker` is not null then `position` must not be null
- if `type = 'thesis'` then `length(body) >= 320`
- if `type = 'link'` then `link_url` must not be null

**`replies`** gains:
- `is_pushback` boolean not null default false
- a check that a pushback body is at least 80 characters

**`profiles`** gains:
- `notify_replies` boolean not null default true
- `notify_pushback` boolean not null default true
- `notify_digest` boolean not null default true

Existing rows must survive the migration unchanged, which the defaults handle.

## Explicitly not in scope

Ticker research pages and clickable cashtags. Thesis-tested events and the theses-in-play
view. Themes and tags of any kind. Watchlists. Network aggregates. The profile build-out,
`@handle` sharing, LinkedIn, or the now-at field. From the desk. The Open daily thread.
Push notifications, the web app manifest, or the service worker. Redirects from the old
memo URLs. School leaderboards or the five-user threshold. Follow relationships.

Every one of those is specified elsewhere and every one of them is a reason phase two ships
late.

## Done means

- All four post types work, each with its own placeholder and its own bar.
- Choosing Thesis inserts the scaffold and the button stays disabled until 320 characters.
- Typing a ticker attaches a live data card to the draft, debounced, one fetch per draft.
- The snapshot is stored on the post, and loading a feed of many posts makes zero provider
  calls. Verify this by watching the network, not by reading the code.
- The change-my-mind field appears with a ticker, is optional, and renders as its own block.
- A ticker post cannot publish without a position stated.
- Pushback works, is labelled, requires 80 characters, and is counted separately.
- Reply and pushback emails send, contain the actual content, and can be turned off.
- The weekly digest sends and can be turned off.
- The change-my-mind fill rate is measurable.
- `npx tsc --noEmit` and `npm run build` pass, no new lint errors.
- `master` untouched, old routes unchanged.

## Workflow

Continue on `feat/social-v1`, or branch `feat/social-v2` from it if phase one is being
reviewed separately. **No merge and no PR without explicit sign-off.**

Small commits. Clean up scratch files and kill background servers before finishing.
