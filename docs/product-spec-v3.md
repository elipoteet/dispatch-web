# The Dispatch — Product Spec v3 (draft)

**Status: draft, awaiting Eli's approval.** Written September 2026. Extends `docs/product-spec.md`
(v2) rather than replacing it — v2 stays authoritative for everything this document does not
change, and every rule in v2's "decisions that are already made" section still holds.

---

## Start here: this is less of a change than it sounds

The direction is a **student research network** — students publish real research, clubs run
desks, and the subject is all of finance rather than only stocks.

Reading v2 closely, most of that is **already the stated intent and simply was never built**:

- v2 already says, in its own decisions section: *"The subject is all of finance, not equities.
  Stocks, macro, rates, commodities, currencies, geopolitics, and crypto."*
- v2 already uses the word **beat** — "a beat renders as *covers Energy*" — and profiles are
  already specified to show "what they cover."
- v2 already has a **Thesis** post type, described as "an argument, taller box, a light scaffold,
  and a length floor."
- v2 already treats **clubs as the unit of adoption**, not individuals.

What was actually built pulled the other way. Every post hangs off a stock ticker, the only place
posts gather is a ticker page, and there is nowhere for a piece about the Fed or private credit
to live. So v3 is mostly **finishing what v2 said**, plus two genuinely new things: beats become
real objects with pages of their own, and clubs get a public face.

That matters for how this gets built. It is not a teardown. Identity, verification, badges,
Spaces, promotion, profiles, ticker pages and the data plumbing all stay.

## What v3 adds

### 1. The published piece

The main unit becomes a **published piece of research** — an argument long enough to be worth
someone's time, written by a student, filed under a beat.

Short posts do not go away (see "One feed" below). What changes is that the site now has a
serious unit at the top of the ladder, and a profile becomes a body of work rather than a stream
of takes.

**Decided (Eli, September 2026): build it as an extended Thesis now, and write it so splitting
it out later is expected rather than a rewrite.**

A piece is a post of type `thesis` carrying a title, a beat, and a length floor. Replies,
pushback, promotion, the twelve-hour edit window, tombstones and profiles all keep working with
no new work, because they already work on posts.

The "plan for the second" half of that decision is a real constraint on how this gets built, not
a footnote. Three rules follow from it:

- **A piece is a named concept in the code**, not a `type === "thesis"` check scattered across
  the codebase. Reading, validating and rendering a piece goes through one module in
  `lib/social/`, so the day storage moves, the call sites do not.
- **Piece-only fields stay recognisably piece-only** — a title and a beat mean nothing on a take,
  and nothing else should start depending on them.
- **Do not build for co-authors or revisions yet.** They are the reason a split would happen;
  building them now is designing from a guess, which v2 warns against. Leave them out and let a
  real need trigger the split.

### 2. Beats — the filing system

Every published piece picks **one beat** from a set list. Each beat gets a page that works the
way `/research/[ticker]` works now: what the beat is, and every piece filed under it.

This is what makes "all of finance" real. A piece about the Fed, private credit or a shipping
lane currently has nowhere to live, because a ticker is the only filing system that exists.

**Decided (Eli, September 2026) — the starting six:**

| Beat | Covers |
|---|---|
| Equities | Individual companies, sectors, equity markets |
| Macro & Rates | Central banks, inflation, growth, government bonds |
| Crypto | Digital assets |
| Commodities | Energy, metals, agriculture, shipping |
| M&A | Deals, activism, restructuring |
| Private Markets | Venture, private equity, secondaries |

Six, not ten, and deliberately so. **An empty beat page is worse than a missing one.** These six
are weighted toward what a college finance club actually talks about and recruits into; Credit,
FX, Real Estate and Policy were cut from the first list and are the obvious candidates if a
seventh is ever needed.

The list lives in the database, so **adding a beat is a row, not a deploy.** That is the whole
reason to start narrow — widening costs nothing later, and a wall of empty pages on launch day
costs real credibility.

Beats are a **fixed list, not free tags.** Free tags fragment ("rates", "interest rates", "the
Fed") and beat pages turn to mush. The list lives in the database so it can grow without a code
change.

**Beats and tickers coexist.** An Equities piece can still attach tickers, ticker pages keep
working exactly as they do now, and nothing about frozen market data changes.

### 3. Club desks

A club gets a **public face**: a page carrying the club's name, school, members, and the pieces
its members have published.

This maps onto what already exists. A Space is a club's private room; a desk is that same club's
public side. Same club, two doors — which is v2's "two halves and a pipe" applied one level up,
and it reuses the `spaces` and `space_members` tables rather than inventing a parallel idea of a
club.

**Authorship stays individual.** A student's name is on the piece; the club appears beside it as
context, the way the school badge does. The club is where you are from, not who wrote it.

This is deliberate and worth defending: v2's whole argument for the profile is that it shows a
person's competence to someone who will never have a school email. Publishing under a club
banner takes that away from the student who earned it.

## Publishing paths

**Decided (Eli, September 2026): both.** A student can write a piece and publish it straight to
the public feed, or work on it in a Space and promote it out as they do today.

This is a deliberate softening of v2, where promotion was the only route to the public feed, and
it is worth being clear about the trade. Requiring a Space makes the club load-bearing — which
is v2's whole adoption argument. But it also means a student at a campus with no club yet cannot
use the product at all, and that is most students.

Consequences:

- **Promotion stays exactly as it is.** Copies rather than moves, replies stay behind, the Space
  post carries a marker. Nothing about it changes.
- **The composer gains a second path**: write a piece from outside a Space and publish it.
- **A directly-published piece still shows its author's club**, if they are in one. The club is
  context beside the name, and it does not depend on which door the piece came through.
- **Nothing marks one path as lesser.** A piece is a piece. A "published from a Space" badge
  would quietly rank two kinds of author, which the no-scoring rule forbids in spirit.

## One feed, two kinds of card

Short posts and published pieces share **one feed**, sorted by recency, with different cards — a
piece shows its title, beat, and an excerpt; a take looks as it does today.

No second feed and no separate "research" tab for pieces. Two feeds would mean the serious work
sits in the room nobody visits, and the site does not have the volume to fill two rooms.

Everything v2 says about the feed is unchanged: **no engagement ranking**, no likes, replies and
pushback counted.

## What does not change

Stated explicitly, because a pivot is exactly when these get lost:

- **No scores, no ratings, no track records.** Not on people, not on pieces, not on clubs. No
  "top desk" leaderboard, no quality score on a piece.
- **Identity stays campus-verified** — school email, badge with school and class year, real names.
- **Market data still freezes at publish time.** The feed makes zero provider calls.
- **Spaces stay private**, and the author still decides what crosses into public.
- **Pushback still requires a reason.** Disagreement is a first-class action.
- **The twelve-hour edit window, tombstones, and visible edit history** apply to pieces too.
- **Naming discipline.** "Beat" and "desk" are v2's words and plain English. Do not coin more.

## What this means for what is built

Roughly, and pending the open decisions below:

**Keep as-is:** login and verification, profiles, badges and roles, Spaces and invite links,
ticker pages, the market-data layer, email notifications, Dispatch AI.

**Extend:** the composer (a title, a beat picker, a length floor for pieces), the post card (a
piece renders differently), profiles (show the beats someone covers, and their pieces first),
promotion (choose a beat at the moment of publishing).

**New:** beat pages and a beat index, club desk pages, and a `beats` table plus a beat column on
posts.

**Untouched:** the entire retired product on the `(research)` surface.

## Open decisions — Eli's, not the agent's

These are listed rather than guessed. Each one changes what gets built.

1. ~~Is a published piece an extension of the Thesis type, or a new object?~~ **Decided:**
   extended Thesis, built so a later split is not a rewrite. See "The published piece" above.
2. **The beat list itself** — is the proposed ten right? Which would you cut?
3. **Can a piece carry more than one beat?** One beat keeps pages clean and forces a choice.
   Several are more honest about how finance actually works. Recommendation: one, with tickers
   carrying the cross-reference for equities.
4. **How does someone get a beat on their profile** — claimed freely, or earned by having
   published in it? v2 left this open ("whether beats are assigned, claimed, or earned").
   Recommendation: earned, so the profile line stays a fact rather than a claim.
5. ~~Can a piece be published straight to the public feed, or must it come out of a Space?~~
   **Decided: either way.** A student can publish a piece directly to the public feed, or promote
   one out of a Space as today. See "Publishing paths" below.
6. **Do the four post types survive?** Take, Question, Thesis and Link. If a piece is an extended
   Thesis, does Link still earn its place?
7. **What is on a club desk page** beyond name, members and pieces — and can a club opt out of
   having a public page at all?
8. **Does the weekly digest include pieces?** And is a new piece worth an email that a take is not?

## Before anything is built

Per the repository's house rule, this brief gets approved before code. The build order and the
schema follow from decisions 1 and 5 above, and the migration is written as a file for Eli to
paste into Supabase by hand — never executed against the live database.
