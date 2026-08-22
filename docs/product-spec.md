# The Dispatch — Product Spec v1

Written August 2026. This describes the product The Dispatch is becoming, replacing the
ticker-rating tool that came before it. Read this before working on anything user-facing.
`claude-project-context.md` still holds the tech stack, brand rules, and the Next.js
gotchas, all of which are unchanged.

## What it is

The Dispatch is a campus-verified place for college students to argue about markets. You
make an argument, you say what would change your mind, and other people push back. Everyone
signs in with a school email and carries their school next to their name, posts run from
two lines to two thousand words, subjects range from a single company to a shipping lane to
a rate decision to a token, and the research sits inside the conversation rather than
beside it.

It is not a trading terminal, not a brokerage, and not a place that ranks people.

## The loop

Everything in this product should serve one loop, and anything that does not serve it is a
candidate for deletion.

See an interesting idea, understand the argument, challenge it, follow the ticker or theme,
and come back when the thesis is tested.

The last step is the one that keeps people. It is also the one nothing else offers, and it
is described in its own section below.

The loop the product must not become is browse research, browse stocks, build a watchlist,
browse themes. That is a finance dashboard, and there are four hundred of those.

## Access: open to read, verified to post

**Anyone can read The Dispatch without an account. Only verified members can post, reply,
push back, or keep a watchlist.**

Reading and writing are two different doors and only one of them needs a wall. The wall on
writing is the whole identity system and it stays hard. A wall on reading buys very little
and costs a great deal.

It costs the profile, first of all. The profile is the most valuable artifact this product
creates and it is meant to be shareable to a recruiter and linkable from a LinkedIn bio. A
recruiter cannot make an account here, does not have a school email, and never will. Wall
the site and that artifact is worthless to exactly the audience it exists for.

It costs the redirects. Years of indexed ticker URLs point at this site, and sending that
traffic into a login screen wastes all of it. Landing instead on real student discussion
about that ticker is a long-tail organic asset no competitor can copy, built by users, on a
project with no marketing budget.

It costs the lurkers, who are the on-ramp rather than freeloaders. Ninety percent read.
Requiring commitment before anyone can see anything means most people never see anything,
and every campus editor pitch is a link that has to work for someone who has not signed up.

And the usual argument for walling, that people write more candidly among peers, is already
answered. Every post carries a real name and a real school. The identity system already made
people careful; a read wall adds almost nothing on top.

Scarcity is real and it lives on the signup door instead. "You cannot join yet, UNH only"
works perfectly well while anyone can read.

### The one caveat, which is timing rather than architecture

Public means the first visitor sees whatever is there, including an empty room, and there is
one first impression per person.

So build it public from the start and control exposure with a setting rather than a
redesign. Keep the site noindexed and unlisted through phase one, while there are eleven
posts and a handful of testers. Flip it to indexed once there is a week of content worth
landing on. Same code, one switch, nothing to rebuild later.

## Who it is for

Current college students, first and for a while. The launch audience is people who already
argue about this in a group chat where nothing is searchable, nothing is sourced, and
nothing survives the week, starting at one campus and spreading by rivalry rather than by
advertising.

Alumni can join from day one and are not the marketing target yet. Those are two different
things and both are deliberate. The account structure supports alumni from the start,
because a badge that survives graduation is what stops a campus product from losing its
entire user base every four years, and turning away a recent grad who wants in would be
strange. What is deferred is building *for* them: no directory, no alumni-specific surfaces,
no pitch aimed at them. That comes once the people graduating are people who actually used
this.

### On expertise, and who actually posts

A reasonable worry is that only a small minority of college investors can write a real
thesis. That is true, and it is also how every online community works: roughly ninety
percent read, nine percent reply, and one percent create. Needing the top slice to produce
the best posts is the normal shape of a community rather than a defect in this one.

The relevant question is whether that slice is large enough, and it is. Against something
like seven million US college students who own individual stocks, one percent is tens of
thousands of people, and the launch cohort at a single school is twenty to fifty. Designing
for the median college investor would produce a worse version of r/wallstreetbets.

The design consequence matters more than the arithmetic. If a small group creates, everyone
else needs something real to do, and the product must present a ladder rather than a
membership test. Adding a name to a watchlist takes no writing. Answering The Open takes one
sentence. A Question post makes not knowing something a legitimate thing to post. Pushback
is far easier than proposing, because spotting a hole in an argument takes much less
knowledge than building one. Only at the top of that ladder is a thesis.

The knowledge gap is the reason this has value, not an obstacle to it. If everyone already
knew what they were doing there would be nothing to come here for.

## The decisions that are already made

These shape everything downstream, and changing one of them is a real decision rather than
a tweak.

There are no scores, no ratings, and no track records attached to people. A number that
compresses a judgment and then presents itself as a fact is dishonest, and that was exactly
what made the original version of this site feel hollow. Status on The Dispatch comes from
covering a subject consistently and from being picked by the desk, never from a leaderboard.

Identity is real and campus-scoped. A verified school email produces a badge, the badge
shows the school and the class year, and it sits next to the name on every post. Real names
attached to real schools solve most of what moderation would otherwise have to solve,
because it is difficult to behave like an anonymous account when your school is on the line.

**Open to read, verified to post.** See the access section above.

**An unchecked claim never looks like a checked one.** This is the rule that keeps the
badge meaning anything, and it governs verification, LinkedIn links, and anything else the
platform displays on a person's behalf.

**The research serves the conversation, not the other way around.** This is a community
where the argument is the product and the numbers are evidence inside it. It is not a
research platform that happens to have social features. Price, chart, and multiples are
available in four hundred other places and are not a reason for anyone to show up here.
Where the two compete for space, the conversation wins, and the ticker page is laid out
accordingly.

**Connections are an outcome, not a mechanic.** Professional connection is one of the most
valuable things this product produces and it is deliberately not built as a feature. See
the profiles section for what that means in practice.

The subject is all of finance, not equities. Stocks, macro, rates, commodities, currencies,
geopolitics, and crypto all belong here. Most of the young investors this is built for hold
crypto, with survey work putting a majority of Gen Z investors primarily in it, so an
equities-only platform would quietly exclude a large share of the audience while claiming
to be about markets. Crypto is a theme like any other and gets no special treatment,
positive or negative.

The main feed is every school at once. Campus identity is what you carry, not where you are
put, and the reasoning is in the feed section below.

Watchlists are public by default with a per-name private toggle, and anything marked
private stays out of the network aggregates as well as off your profile, because privacy
that still counts you is not privacy.

Replies and pushback are counted in public. Likes are not, and there is no follower count
on display anywhere. You get more of whatever you count, and counting likes produces posts
written for likes.

Markets do not move one ticker at a time, so the product is not organized one ticker at a
time either. Themes are first-class objects that you can follow the same way you follow a
company, and a single post can carry several tickers and several themes at once.

Market data attaches to a post at the moment it is written and freezes there, so a thread
still makes sense a year later instead of decaying into people reacting to a price nobody
can see anymore.

Disagreement is a first-class action with its own button and its own visible count, and it
requires a reason. A downvote is free and produces nothing, while a disagreement that costs
you a sentence produces an argument, and arguments are where the substance lives.

Curation is done by hand. Three posts a week get picked by the desk, with no algorithm
involved, because that teaches the standard by example far better than any rule and costs
nothing to build.

## Naming discipline

An early tester counted the vocabulary a new user has to learn before receiving any value:
The Wire, Research, Watchlists, Themes, Take, Question, Thesis, Link, beat, pushback, From
the desk, The Open. That is a real tax and it was self-inflicted.

The rule going forward: **a coined name earns its cost only when the thing is genuinely
new.**

Pushback is new, nothing else calls it that, and the word does work. The Open is a specific
recurring event. From the desk is a section header rather than navigation. Those stay.

The feed is called Feed, not The Wire, because "wire" carries zero information for someone
who has never used the product and it is the first thing they hit. A beat renders in plain
language as "covers Energy" rather than as a term the reader has to decode.

Apply the same test to anything new. Editorial character is worth having, but not at the
price of making someone study before they can read.

## Identity and verification

Signing up requires an email at a recognized .edu domain, and the domain maps to a school
name held in a lookup table maintained in the database. The email address itself is never
displayed and is used only to confirm the school and recover the account.

The badge renders as school plus class year, for example `UNH '27`. Once the class year
passes, the badge becomes an alumni badge and the account keeps everything it built. This
matters more than it looks: a campus product loses its entire user base every four years
unless graduating is a promotion rather than an exit.

One account per verified email. No anonymous accounts and no pseudonymous accounts in
version one.

Beats are assigned by hand at first. A beat is a subject someone covers consistently, it
shows next to their name in plain language, and it is the qualitative substitute for a rank.

### The signup flow

One flow, no fork. Do not ask people to choose between student and alumni at the door,
because the graduation year already answers it and a decision screen before any value has
been delivered is where people quietly leave.

Enter a school email, confirm it with a code, pick a graduation year from a list that
includes past years. If the year is in the past, the account is an alumni account and the
badge says so. Alumni also get an optional single-line "now at" field at this point, since
it is the one thing an underclassman most wants to know and the moment they are most likely
to fill it in.

### Alumni

The default path for an alum is the same as everyone else's, and for UNH that appears to be
the only path needed. UNH alumni retain their campus email address after graduation while
the account stays compliant with USNH policy, which means an alum verifies exactly like a
student and earns exactly the same checkmarked badge with ALUM after it.

Retention policy varies by school, so it is a per-campus fact rather than a platform-wide
one. The schools table carries a flag for it alongside the domain mapping.

The LinkedIn path exists for alumni whose school address is gone, and it is an edge case
rather than a pillar. It covers two small groups: alumni from schools without retention, and
accounts that lapsed. It can wait until a school without retention actually joins.

When it is built, be precise about what it proves. Signing in with LinkedIn confirms that a
person controls a LinkedIn account. It does not confirm their school or employer, because
LinkedIn does not check those either. That is a gentleman's system, and at LinkedIn's scale
it works, since a profile sits in front of hundreds of people who know the person. A new
account here has no such protection, and the abuse case is predictable: any product
advertising access to alumni in finance attracts people pretending to be alumni in finance.

The response is labelling, not gatekeeping. Two badge states, visibly different:

- **Email verified.** Carries the checkmark. The school was confirmed.
- **LinkedIn verified.** No checkmark, muted treatment. The person is real, the school is
  stated.

Both can post, both get full profiles, both are full members. The only difference is what
the badge claims, because a checkmark that means two different things means nothing.

A vouch from an already verified member is worth considering as a third path, since at a
scale of fifty people a named member putting their own badge behind someone else's claim
carries more weight than any API call.

## Profiles and connections

The profile is not a footnote. It is the single most valuable artifact this product creates
for the person who made it, and it should be the best page on the site.

### Why connection matters here

LinkedIn shows credentials and cannot show competence. You can read someone's LinkedIn all
day and have no idea whether they can think about a company. The Dispatch shows exactly
that, in public, attributed, accumulating over time.

For a college student that is not a nice-to-have. A place to talk about markets is
optional; a place where demonstrating that you can think is what gets you an interview is
not. This is also structurally unavailable to the competition: Reddit and StockTwits are
anonymous so no connection is possible at all, a group chat is invisible from outside, and
LinkedIn has the identity with none of the substance.

Note this only works because the site is readable without an account. A walled profile
cannot be sent to anyone who matters.

### But connection is an outcome, not a mechanic

There is no connect button, no in-product messaging, no connection count, no
people-you-may-know. What exists instead: writing that is public, attributed, and
permanent, with a full profile one click from every post.

Someone reads a good argument, clicks the name, and reaches out on their own. The
connection happens because the work was good. That is not a weaker form of networking, it
is the only form that works, since a product where everyone is visibly networking is worth
nothing and everyone already knows what that feels like.

**LinkedIn appears on the profile and never on a post.** That one click of distance is the
entire design and it is worth defending. The failure mode is specific: once professional
identity is visible in the feed, people write to be seen rather than to be right, and the
first casualty is the change-my-mind field, because nobody admits doubt to an audience they
are performing for. The result would be a feed of confident, unfalsifiable, slightly boring
takes, which is to say LinkedIn.

### What the profile contains

Name, avatar, school badge, class year, and what they cover if anything. The handle and a
real, shareable URL at `dispatchresearch.com/@handle`, good enough to put in a LinkedIn bio,
on a resume, or in a cold email to an alum. An optional single-line "now at" field. An
optional LinkedIn link. Their public watchlist, with a one-line reason beside each name.
Then every post they have written.

The watchlist reasons deserve emphasis. Seeing what someone watches is mildly interesting;
seeing why each name is there is genuinely interesting, and it connects the watchlist back
to the loop instead of leaving it as a dashboard artifact.

Both the LinkedIn link and the "now at" line are optional, always. Plenty of people have
good reasons not to attach their professional identity to their market opinions.

The displayed LinkedIn link is self-reported and must be styled so it visibly reads as a
claim rather than as something verified, the same rule as the badge.

The two uses of LinkedIn are different and should not be conflated. Signing in with LinkedIn
is an authentication path and needs OAuth. The link shown on a profile is display only, and
a pasted URL validated for format is enough. Do not build OAuth for the profile link.

### Where to say it out loud

The connection argument belongs in the positioning and the marketing copy, not inside the
feed. On the landing page and in the pitch: the best thing you can hand a recruiter is proof
that you can think. That is a reason to sign up, and it costs the feed nothing because it
lives outside the feed.

## The post

A post has an author, a type, a body, optional tickers, optional themes, an optional
"what would change my mind" line, and a timestamp. There is no character ceiling.

Four types, and the type is chosen before writing rather than inferred afterward:

- Take, for a short observation, with no length requirement.
- Question, for something the author is trying to work out, explicitly legitimate at two
  lines so that asking never looks like low-effort posting.
- Thesis, for an argument, which opens a taller box, drops in a light scaffold of what
  happened, why it matters, and what the author is watching, and stays unpostable until
  there is real length behind it.
- Link, which requires a sentence saying why the link matters, because a link with no
  reason gets skipped by everyone anyway.

Any `$TICKER` written in the body becomes a link to that company's research page, and any
`#theme` becomes a link to the theme. The first ticker in a post also attaches a data card
carrying the price, the day's move, and a few fundamentals, stamped as of the moment of
posting and frozen there.

The "what would change my mind" field appears in the composer as soon as a ticker is
attached, stays optional, and renders on the post as its own marked block. It is optional
on purpose, because requiring it would suppress posting, and it will still be the most
useful line in most posts that have one.

Anyone posting about a specific ticker must mark whether they hold a position in it. Two
states, own it or no position, required rather than optional, because a default that means
"no position" makes a claim by inaction. It renders on the post as a small factual line and
is a snapshot of the moment of writing, like the price data.

### Editing and deleting

A post can be edited for twelve hours after publishing. After that it is fixed. An edited
post carries an "edited" marker with its revision history visible to anyone who wants it,
because a silent edit to an argument other people have already replied to is a small
dishonesty and this product cannot afford those.

A post can be deleted at any time, and deletion leaves a tombstone rather than a hole.

Two consequences follow from the tombstone and both matter. Replies and pushback survive on
it, so deleting is not a way to erase someone's disagreement with you. And any open
change-my-mind condition attached to that post drops out of theses in play, since a live
condition pointing at a deleted argument is worse than no condition at all.

The balance being struck: permanence is what makes the thesis mechanic meaningful, and fear
of permanence is what stops a nervous freshman from posting at all. A generous edit window
with visible history, plus an exit that does not silently rewrite history, gets most of both.

## When a thesis is tested

This is the retention mechanic and it is the most defensible thing in the product.

The "what would change my mind" field is not decoration. It is a stated, falsifiable
condition sitting in a structured field, attached to a named person at a known school, with
the market data frozen at the moment they said it. Nobody else on the internet collects
that, which means nobody else can do what follows.

When the stated condition actually occurs, that is an event. It surfaces in the feed as its
own item: the person, the claim, the condition they named, and what just happened. It links
back to the original post, where the argument and the pushback are already sitting.

Three things it must not become. It is not a score, because nothing is tallied and nobody
is ranked. It is not a verdict, because a condition being met does not mean the person was
wrong, it means the thing they said they were watching happened. And it is not automated
judgment, since the honest version of this in the early days is a human noticing and
flagging it rather than a system pretending to detect it.

A supporting view is worth building alongside: open conditions across the network, visible
as "theses in play," both in the sidebar and on each ticker page. That view is quietly the
most interesting page on the platform, because it is a live list of what a group of people
have publicly agreed to be persuaded by.

Detection starts manual. Whoever runs the desk notices and posts it. Some conditions are
mechanically checkable later, meaning a price level or a reported number, and those can be
automated once the volume justifies it. Most will always need a person, and that is fine.

**The open risk worth measuring:** this whole mechanic runs on an optional field. If the
fill rate turns out to be ten percent there is no supply of events to surface. Measure it
explicitly in phase two rather than assuming.

## The composer

The composer is the highest-leverage screen in the product, because it shapes how people
write before they write anything.

The type pills sit above the box and change both the placeholder and the bar. The data card
appears inside the draft the moment a recognized ticker is typed, which is the mechanism
that makes specificity cheap: nobody has to leave the app to look up a multiple, so nobody
has an excuse to be vague. The change-my-mind field appears underneath when relevant. A
hint near the Post button says what is still needed rather than blocking silently.

## The feed

**All schools is the main feed and the default for everyone, permanently.** Not a fallback
for small campuses and not a tab people have to find. It is where you land.

The reason is that one busy room beats a dozen quiet ones. At the size this network will be
for its first year or two, splitting people by campus would manufacture exactly the
empty-room problem that the entire launch plan is designed to avoid, and it would do it to
every campus at once. Campus identity is what a person carries on their badge, not a wall
they are put behind.

Your own school is a tab you choose. Following and your own tickers are the other two.

Sorting is by recency within the selected tab. There is deliberately no engagement ranking,
since an engagement-ranked feed teaches people to write for the ranking within about two
weeks.

Thesis-tested events appear in the feed as their own item type, above the daily thread.

A pinned daily thread called The Open runs every trading day at 9:30, asks what people are
watching and what would change their mind, and closes at the bell. Its job is to give the
feed a heartbeat so that it is never empty on a slow day.

The thread's own copy must make clear that the one-reply rule applies to that thread only.
An early tester read "everyone posts once" as a platform-wide daily limit, which is exactly
the kind of misreading that turns into a complaint about a rule that does not exist.

### When a school becomes public

A school becomes a public entity on The Dispatch once it has five verified users. Below
that, the people there still have their badge and still have their school tab, it is simply
sparse. What the threshold gates is everything facing outward: being listed among the
schools on the platform, and being included in the school-versus-school comparisons, which
are meaningless at a sample of one.

Crossing five should produce a visible moment, since it is the concrete goal a campus editor
works toward and the thing that turns recruiting into a finishable task.

## Research

Every ticker has a page, and the order of that page is the point.

The conversation comes first: open theses on that name, then every post in the network
about it. The numbers come underneath, as evidence supporting the argument rather than as
the reason to be on the page. Anyone can get a chart and a P/E somewhere else, and building
the page the other way around would make The Dispatch a worse version of four hundred
existing products.

The page is reachable from any ticker anywhere in the product, from the search box in the
header, and from a Research tab for the times someone wants to look something up without a
post prompting it. That tab exists as a utility, not as a pillar.

The engine that produces this is the one already in `lib/analysis/` and `lib/providers.ts`.
Its job changes from producing a verdict to producing context. There is no rating, no
scorecard, and no buy or sell badge anywhere on the page.

Coverage is worth separating from scope. The conversation covers all of finance from day
one, because a theme needs no data behind it and a post about rates or a token works
whether or not the platform can price it. Research pages are a different question: US
equities are the starting point because that is what the existing engine already does well.
Crypto, currencies, and commodities should get research pages once the provider situation
is understood, and the honest answer today is that nobody has checked what the current
providers return for a crypto pair or what it costs against the rate limit. Do that
investigation before promising a `$BTC` page.

Until then, crypto and macro posts still work fully. They carry themes rather than an
attached data card, which is a smaller loss than it sounds.

Twelve Data's eight requests per minute is the binding constraint, and a feed will strain
it far harder than a search box ever did, so anything new that fans out across symbols
needs to be budgeted against that ceiling deliberately.

## Retiring the old product

The rating engine, the paper-trading portfolio, and the auto-generated memo are being
retired. The code stays in the repository rather than being deleted, because parts of the
analysis engine are reused for context, but none of it stays reachable in the product.

**Every indexed URL redirects rather than dying.** The old per-ticker memo pages have real
search history behind them and that traffic is worth more now than it was before, since it
lands on a page with discussion rather than a generated verdict. Old `/research/[ticker]`
URLs point at the new ticker page for that symbol. Use permanent redirects, the 301 kind, so
ranking actually carries across rather than being treated as temporary.

Anything with no natural destination goes to the homepage rather than a 404.

This is also the reason the site stays readable without an account. Redirecting years of
accumulated search traffic into a login screen would throw away the entire asset.

## Watchlists

A watchlist is a list of tickers with a public or private flag on each name, and an optional
one-line reason beside each. Public names appear on your profile, are followable by other
people, and count toward the network aggregates. Private names appear only to you and count
toward nothing.

The aggregate view is worth building properly: what the network added this week, what one
school is watching versus another, what seniors watch that freshmen do not. None of it is a
judgment or a ranking, it is simply a fact about what verified student investors are
looking at, and nobody else is positioned to publish it.

School-level comparisons only include schools past the five-user threshold.

## Themes

A theme is a followable subject with a name, a description, and a feed of every post tagged
with it. Starting set covers semis, energy, macro, geopolitics, ai, consumer, china, rates,
and crypto, curated by hand rather than created freely by users, at least until there is a
reason to open it up.

Themes are what make this about markets rather than about stocks, and they are the only
sane home for a post about an election, a shipping lane, or a token with no fundamentals to
attach.

## Not in version one

Real brokerage connections of any kind, which would move the product into a different
regulatory universe overnight. Direct messages of any sort, including anything that would
let one user contact another inside the product. Connection counts, follower counts, or any
people-you-may-know surface. A native mobile app, since a responsive website reaches a phone
perfectly well without a second codebase or an app store. Free-form theme creation. Anything
resembling a score. Paid tiers, because the goal for the next year is audience and
credibility rather than revenue. OAuth for the profile's displayed LinkedIn link, which is
display only and needs nothing more than a validated URL.

An alumni directory is explicitly deferred, along with every other alumni-specific surface.
Alumni can join and post from day one; what is deferred is building pages and pitches aimed
at them, because those only work once there is a real alumni population and building them
now would mean building an empty room.

Opening the network beyond students and alumni is also deferred rather than rejected. The
.edu wall is what makes this coherent and scarce right now, and removing it early would
dissolve the one thing that is not replicable. The alumni badge is already the release
valve, and it opens on its own schedule.

## Build order

Build the risky assumption first. The risk is not whether a feed can be built, it is
whether anyone posts.

Phase one is sign in, write a post, reply, and see the feed. Nothing else at all. The school
email path is the only one needed here. Ship it public but noindexed, so the architecture is
right from the start and nobody stumbles onto eleven posts. Put it in front of twenty to
fifty real people and watch whether they argue with each other without being prompted. If
the feed only stays alive because the founder keeps seeding it, that is the warning sign,
and it is worth catching before a semester goes into the rest.

Phase two adds the composer properly, meaning the types, the attached data card, the
change-my-mind field, and the position disclosure, which is where post quality is actually
won. Labelled pushback replies belong here too rather than later, since challenging an
argument is half the loop. Email notifications belong here.

Phase three wires the ticker pages to the existing engine with the conversation on top and
the numbers underneath, makes every cashtag live, adds thesis-tested events, and lands the
redirects from the old memo URLs. The events matter more than the numbers do. The web app
manifest and service worker belong here, so the site installs to a desktop dock or a phone
home screen and push notifications become possible.

Phase four builds the profile out properly: the shareable `@handle` URL, the optional
LinkedIn and "now at" fields, and the public watchlist with reasons. Then the network
aggregates. This is where a large share of the product's value to its own users lives, so it
deserves real design attention rather than being treated as a settings page.

Phase five adds themes and From the desk.

All of it goes on a branch alongside the current site rather than on top of it, so the
thing that works today keeps working until the replacement is real.

## Still undecided

What happens to the Monthly Leaderboard currently live on master. It belongs to the product
being retired and this spec forbids anything like it, but the decision to remove it has not
actually been made.

What the moderation escalation path is, and who executes it. Not if, when.

Whether the network keeps the name The Dispatch or whether the feed and the long-form desk
need separate names inside one brand.

Whether beats are assigned, claimed, or earned.

What happens in June, since campus products die over the summer and there is no answer for
that yet.

Whether signups are gated to UNH only at launch. Note this is a separate question from both
the feed default and the read access, which are settled: all schools always, and open to
read.

Whether the vouch path is worth building in version one.

Whether crypto, currencies, and commodities get real research pages, which is a provider
and rate-limit question rather than a scope question. The scope is settled.

How much thesis-tested detection can eventually be automated without turning it into the
scoring system this product deliberately does not have.
