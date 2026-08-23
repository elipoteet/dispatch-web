# The Dispatch — Product Spec v2

Rewritten August 2026, after Spaces. Supersedes v1. Read this before working on anything
user-facing. `docs/claude-project-context.md` holds the stack, brand rules, and the Next.js
gotchas. `docs/phase-one-recap.md` and `docs/phase-two-recap.md` describe what is already
built.

## What it is

**The Dispatch is where finance groups do their thinking, and where the best of it becomes
public.**

Investment clubs and pitch teams get a private space to work in, with market data built into
the conversation. When something in that room is worth more than the room, its author
publishes it to a public feed under their real name and school, where students at other
schools can push back on it.

It is not a trading terminal, not a brokerage, and not a place that ranks people.

## Two halves and a pipe

This is the shape of the whole product and every decision should be checked against it.

**Spaces** are where work happens. Private, club-scoped, low friction, unpolished.

**The feed** is where conclusions live. Public, structured, permanent, attributed.

**Promotion** is the passage between them, and it is the actual product.

Neither half is the center. Spaces without a public layer is a worse Discord and that fight
is unwinnable. A public feed without Spaces is a worse Twitter and that one is unwinnable
too. What nobody has is the passage: a private room where real work happens, attached to a
public record where the good parts survive under a verified name.

Both ends have to be strong for the middle to mean anything.

### The loop

Think privately, publish selectively, accumulate permanently.

Space, then feed, then profile. Anything that does not serve one of those three is a
candidate for deletion, and that test is what keeps this from becoming three products
instead of one pipeline.

## Access: open to read, verified to post, private inside Spaces

**Anyone can read the public feed without an account. Only verified members can post,
reply, or push back. Spaces are private and readable only by their members.**

Reading and writing are different doors and only one needs a wall. The wall on writing is
the identity system and it stays hard. A wall on public reading costs a great deal: it
breaks the profile as a shareable artifact, since a recruiter will never have a school
email; it wastes years of indexed URLs by redirecting search traffic into a login screen;
and it blocks the lurkers who are the on-ramp rather than freeloaders.

Spaces are the exception, deliberately. That is what makes a club comfortable putting real
work there, and the author decides what crosses into public.

Keep the public surface noindexed until there is a week of content worth landing on. That is
one setting, not a redesign.

## Who it is for

College students, with clubs as the unit of adoption rather than individuals. One officer
saying yes brings thirty people who are already in the habit of talking to each other.

Alumni can join from day one and are not the marketing target yet. The account structure
supports them because a badge that survives graduation is what stops a campus product from
losing its user base every four years. What is deferred is building *for* them.

### On expertise, and who actually posts

Roughly ninety percent read, nine percent reply, one percent create. Needing the top slice
to produce the best posts is the normal shape of a community, not a defect in this one.

The design consequence: the product must present a ladder rather than a membership test.
Reading takes nothing. A question inside a Space makes not knowing something legitimate.
Pushback is far easier than proposing, because spotting a hole takes much less knowledge
than building an argument. Only at the top of that ladder is a published thesis.

The knowledge gap is the reason this has value. If everyone already knew what they were
doing there would be nothing to come here for.

## The decisions that are already made

Changing one of these is a real decision rather than a tweak.

**There are no scores, ratings, or track records attached to people.** A number that
compresses a judgment and presents itself as a fact is dishonest, and that is exactly what
made the original version of this site feel hollow.

**Identity is real and campus-scoped.** A verified school email produces a badge showing
school and class year, and it sits next to the name on every post. Real names attached to
real schools solve most of what moderation would otherwise have to do.

**An unchecked claim never looks like a checked one.** This governs verification, LinkedIn
links, and anything else the platform displays on someone's behalf.

**The research serves the conversation.** The argument is the product and the numbers are
evidence inside it. Price, chart, and multiples are available in four hundred other places
and are not a reason for anyone to show up here.

**Connections are an outcome, not a mechanic.** No connect button, no in-product messaging,
no follower or connection counts.

**The subject is all of finance**, not equities. Stocks, macro, rates, commodities,
currencies, geopolitics, and crypto. Most young investors this is built for hold crypto, so
an equities-only platform would exclude a large share of the audience while claiming to be
about markets.

**Replies and pushback are counted. Likes are not.** You get more of whatever you count, and
counting likes produces posts written for likes.

**Market data freezes at the moment of posting**, so a thread still makes sense a year later.

**Disagreement is a first-class action with its own button, and it requires a reason.** A
downvote is free and produces nothing. A disagreement that costs you a sentence produces an
argument.

**No post types inside Spaces.** A working room should not make you pick a genre before you
write. Structure is chosen at promotion, when the thing becomes a public argument and the
structure starts earning its cost.

## Naming discipline

A coined name earns its cost only when the thing is genuinely new.

Pushback is new and the word does work. Space and promotion are plain English for what they
are. The feed is called Feed. A beat renders as "covers Energy" rather than as a term the
reader has to decode.

An early tester counted twelve pieces of vocabulary a new user had to learn before receiving
any value. Apply this test to anything new.

## Identity and verification

Signing up requires an email at a recognized .edu domain, mapped to a school in a lookup
table. The address is never displayed and is used only to confirm the school and recover the
account.

The badge renders as school plus class year, for example `UNH '27`. Once the year passes it
becomes an alumni badge and the account keeps everything it built.

One account per verified email. No anonymous or pseudonymous accounts.

### Signup

One flow, no fork. Enter a school email, confirm with a code, pick a graduation year from a
list including past years. A past year makes it an alumni account and the badge says so.
Alumni get an optional single-line "now at" field at this point.

Do not ask people to choose between student and alumni at the door. The year already answers
it, and a decision screen before any value has been delivered is where people leave.

Note that this Supabase project issues eight-digit codes, not six, and there is no length
setting. Do not assume "six-digit" is literal anywhere.

### Alumni

UNH alumni retain their campus email after graduation, so an alum verifies exactly like a
student and earns the same checkmarked badge with ALUM appended. Retention policy varies by
school, so the schools table carries a flag for it. See `docs/alumni-verification.md`.

A LinkedIn sign-in path exists for alumni whose school address is gone. It is an edge case,
not a pillar, and can wait until a school without retention actually joins. When built, it
produces a visibly different badge: no checkmark, muted treatment, school stated rather than
confirmed. Both kinds are full members. The only difference is what the badge claims.

## Spaces

A Space is a private room for a club, a pitch team, or any finance group that already talks
somewhere worse.

### What a Space is, and is not

It is a finance workspace that happens to have conversation in it. It is not Discord with
tickers. No channels, no voice, no reactions everywhere, no endless notification surfaces.

The pitch to a club officer is deliberately narrow: **you are not replacing the GroupMe.**
GroupMe is fine for "meeting moved to 7." It is terrible at a real discussion of a pitch,
where the numbers should be present and the argument should still be findable next week.
That second thing is what a Space takes.

### Membership

Invite links, and almost nothing else. The owner generates a link and drops it in the club's
existing group chat. Everyone taps it and they are in.

That matches exactly how clubs already onboard people, and it means no search, invitations,
requests, or approval flows, none of which a thirty-person club needs.

Two constraints. The link is revocable and regeneratable, so a leaked link is a
thirty-second fix. And a verified school email is still required: the link gets you through
the door, the badge system still says who you are.

### Roles

One owner, with the ability to promote members to admin if it turns out to matter. The owner
can remove members, regenerate the link, rename the Space, and delete it.

**Ownership must be transferable, and this is not optional.** Club officers graduate every
year. If ownership cannot move, every Space dies with whoever created it, which is the same
churn problem the alumni badge exists to solve.

### Posting inside a Space

Same post object as the public feed, same ticker attachment, same replies, same pushback.
No post types, no length floors, no scaffolds. Working notes, not polished.

## Promotion

The author of a post inside a Space can publish it to the public feed.

It **copies rather than moves**, so the Space keeps its context. Replies stay behind: the
private discussion stays private, the argument goes public under the author's name. The
Space post then shows a marker saying it was published, linking to the public version.

At the moment of promotion the author chooses the post type and, if a ticker is attached,
confirms the change-my-mind line and the position disclosure. That is the right moment for
structure, because that is when the thing stops being a note and becomes a claim.

This is the mechanic that stops a Space from being a Drive folder with better fonts, and it
is the reason the public feed does not depend on strangers deciding to post cold.

## The post

An author, a type, a body, optional ticker, an optional change-my-mind line, a position
disclosure when a ticker is attached, and a timestamp. No character ceiling.

Four types on public posts, chosen before writing:

- **Take.** A short observation, no length requirement.
- **Question.** Something the author is working out, explicitly legitimate at two lines.
- **Thesis.** An argument. Taller box, a light scaffold, and a length floor.
- **Link.** Requires a URL and a sentence saying why it matters.

`$TICKER` in a body attaches that company's data, frozen at publish time and stored on the
post. The feed must never fetch live data.

The **change-my-mind** field appears when a ticker is attached and stays optional. Requiring
it would suppress posting, and it will still be the most useful line in most posts that have
one.

**Position disclosure** is required whenever a ticker is attached: own it or no position. A
default meaning "no position" would make a claim by inaction. Nobody else in retail research
does this.

### Editing and deleting

Editable for twelve hours, then fixed, with an "edited" marker and visible history. A silent
edit to an argument people have already replied to is a small dishonesty this product cannot
afford.

Deletable at any time, leaving a tombstone rather than a hole. Replies survive on it, so
deleting is not a way to erase someone's disagreement with you.

## The feed

The public feed is every school at once, and it is where a signed-in user lands. Sorting is
by recency. **There is deliberately no engagement ranking**, since an engagement-ranked feed
teaches people to write for the ranking within about two weeks.

Your own school and your Spaces are places you go, not walls you are put behind.

## Profiles

The profile is the third surface and the most valuable artifact this product creates for the
person who made it.

LinkedIn shows credentials and cannot show competence. The Dispatch shows exactly that, in
public, attributed, accumulating over time. For a student that is the difference between a
nice-to-have and a reason to sign up, and it only works because the public feed is readable
without an account.

Contents: name, avatar, school badge, class year, what they cover, a shareable URL at
`dispatchresearch.com/@handle`, an optional "now at" line, an optional LinkedIn link, and
every public post they have written.

**LinkedIn appears on the profile and never on a post.** That one click of distance is the
design. Once professional identity is visible in the feed, people write to be seen rather
than to be right, and the first casualty is the change-my-mind field, because nobody admits
doubt to an audience they are performing for.

The displayed LinkedIn link is self-reported and must be styled as a claim rather than as
something verified.

## Research

A utility, not a pillar.

Ticker pages show the conversation first and the numbers underneath, as evidence supporting
an argument rather than as the reason to be on the page. A Research tab exists for looking
something up without a post prompting it.

The engine in `lib/analysis/` produces context, not verdicts. **There is no rating,
scorecard, or buy/sell badge anywhere.**

Twelve Data's eight requests per minute is the binding constraint and a feed strains it far
harder than a search box did. Anything that fans out across symbols must be budgeted against
that ceiling deliberately.

## Retiring the old product

The rating engine, paper-trading portfolio, and auto-generated memo are retired. The code
stays in the repository because parts of the analysis engine are reused, but none of it stays
reachable.

Every indexed URL redirects rather than dying. Old `/research/[ticker]` URLs point at the new
ticker page for that symbol, with permanent 301 redirects so ranking carries across. Anything
without a natural destination goes to the homepage.

## Deferred

These are not cancelled. They are being built after there are users, because every feature
built before anyone uses the product is designed from a guess.

- **Themes.** An organizing layer for post volume that does not exist yet.
- **Watchlists**, the public and private toggle, and the network aggregates. The loosest fit
  to the loop, and the aggregates need a network to aggregate.
- **Thesis-tested events**, where a stated change-my-mind condition actually occurs and
  surfaces in the feed. Still the most defensible idea in the product and still worth
  building. It was a retention mechanic for a public feed, and retention now comes from the
  club, so it moves later. It also depends on a change-my-mind fill rate nobody has measured.
- **School thresholds and school-versus-school comparisons.** Designed for growth one
  individual at a time. Clubs replace that mechanism.
- **Campus editors** as a formal role. The club officer is already the campus editor, which
  is simpler and real. `docs/campus-editors.md` is partly obsolete for this reason.
- **Push notifications and the installable web app.** Email works everywhere today and
  iPhone web push requires a home-screen install nobody performs.
- **Direct messages**, permanently unless something changes. They do not help club adoption
  and they hand you a harassment surface to police.
- **Brokerage connections** of any kind, which would move this into a different regulatory
  universe.
- **Paid tiers.** The goal for the next year is audience and credibility.

### Cut, not deferred

**The Open**, the pinned daily thread. Its only job was giving an empty public feed a
heartbeat. A club does that permanently and better.

**From the desk**, the hand-picked weekly selection. Promotion *is* curation now. A club
deciding something is worth publishing is a better filter than the operator choosing three
posts a week.

## Build order

Already built and staying: sign-in and verification, the public feed, the composer with its
four types, ticker attachment, change-my-mind, position disclosure, replies, pushback, email
notifications, profiles.

**Next: Spaces and promotion.** Spaces with invite-link membership, owner controls including
transfer, posting without types, and the promotion path to the public feed. This is the only
part of the pipeline that does not exist, and it is the part that changes who adopts.

**Then: users.** Ship it to one club, watch what happens, and let what they actually do
decide the order of the deferred list.

Everything stays on a branch alongside the live site until the replacement is real.

## Still undecided

What happens to the Monthly Leaderboard on `master`. It belongs to the retired product and
this spec forbids anything like it, but the removal decision has not been made.

What the moderation escalation path is, and who executes it. Not if, when.

Whether Spaces can ever be cross-school, or whether they stay within one campus.

Whether beats are assigned, claimed, or earned.

What happens in June, since campus products die over the summer.

Whether the vouch path for alumni verification is worth building.

Two independent handle systems still exist, one from the old leaderboard and one from the
social product, with no shared uniqueness constraint.
