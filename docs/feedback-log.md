# Feedback Log

A running record of what real people said when shown The Dispatch prototype, and what
changed because of it. Newest first.

## How to read feedback, before reading any of it

Three rules that make this log worth keeping.

Discount the praise. Everyone who looks at a prototype as a favor is being kind, and
enthusiasm is the cheapest thing a tester can give you.

Take confusions completely at face value. When someone misreads the product, that is never
politeness and it is never their fault. It is the single most reliable signal available, and
it is usually a copy problem rather than a feature problem.

Treat feature requests as symptoms rather than instructions. People describe the fix they
can imagine, not the problem they hit. The useful question is always what made them reach
for that.

---

## August 2026, second round — a mentor conversation, and Eli's own framing question

### Eli's own question, which is sharper than anything below it

Written by Eli, not a tester: *"The biggest product question remains: why do I come back?"*
Four candidate answers — the people ("I follow 15 smart people and want to know what
they're thinking"), the Spaces ("my investment club is actively discussing our pitch"), the
ideas ("something happened that affects a thesis I posted"), and the market ("NVDA just
moved 8%, what is Dispatch saying?").

Worth checking this against what actually exists. B, C and D already have real mechanisms
behind them — Spaces, promotion, and (once phase five ships) a ticker page that surfaces
every post about a name the second something moves it. **A has nothing behind it.** There is
no way today to follow a specific person and be told when they post. Profiles exist, but
nothing routes you back to one. If "the people" is meant to be one of the four legs, it is
currently the only one with no feature — worth naming as a real gap rather than assuming the
other three cover it.

### What a mentor suggested, over text

Discounting the praise itself ("this is a really cool idea," "you have a ton fleshed out") —
three concrete suggestions came with it.

**A single landing page as a 30-second pitch: who it's for, what it does, why.** This is a
real gap. Nothing in the build so far is a marketing page — `try.dispatchresearch.com`
*is* the app, and a stranger arriving cold lands straight in the feed with no framing above
it. Two suggested lines were floated as taglines: *"Share ideas with the best and
brightest"* and *"Sharpen your ideas with critiques from your peers and professors."* The
second one runs straight into the next item below — flagging it rather than adopting it as
written.

**Different verification tiers for different user types — student, professor, business-
school mentor, outside mentor — shown as different-colored checkmarks (white, blue, gold).**
This is the one worth pushing back on rather than logging as a straightforward request. The
entire identity model — the thing that makes a post trustworthy — is built on one rule: a
school email gets you in, an alumni badge marks a graduate, and that is the whole ladder.
Adding professors and outside mentors as first-class posting identities is a materially
different, larger product: it changes who the audience is, raises real questions about a
professor grading a student they're arguing with in public, and adds a moderation surface
that does not exist today. The underlying want is probably real — bringing more credible
voices into a Space, or into a thread — but the fix as described is a bigger decision than a
badge color, and it should be treated as one before anything gets built toward it.

**A "Dispatch AI bot" that posts about trends or highlights interesting posts.** Also worth
resisting as stated. The product's whole differentiator, repeated in the spec, is that every
post is a real, verified person putting their name behind a claim — "an unchecked claim
never looks like a checked one." A bot with posting rights blurs that line at the exact spot
it needs to be sharpest. The want underneath — surfacing what's actually worth reading when
the feed is thin — is legitimate, and might be better served by something that never posts
as a peer: a "trending" rail, or a curated digest email (which already exists as
infrastructure), rather than an account with a byline.

**A working session — screen share, walk through the build.** Not a product decision,
logged so it doesn't get lost as a to-do.

### Not yet asked

Same gap as last round: nobody has been asked to name a specific post they would actually
write. Still the strongest available signal, still uncollected.

---

## August 2026, first prototype round

Shown to a handful of people over text, including a detailed written response from Eli's
father, who is not the target demographic but read the prototype carefully and wrote at
length.

### The finding that mattered most

He came away thinking the product was "for day trading college students."

That is close to the opposite of the position, which has been explicitly not a terminal
since the beginning. Likely causes, none of them features: The Open being anchored to the
opening and closing bell, a feed dense with prices and percentage moves, the watchlist
rail, the composer placeholder using the word "moving," and above all the absence of any
line on the page saying what the thing is. With no orientation he pattern-matched to the
nearest familiar product.

Fixed by adding an orientation strip at the top of the feed reading "The Dispatch is where
college students argue about markets," followed by real names and school, the full scope
including macro and geopolitics, and the words "not a trading app."

### The confusion that was a UI bug

The Open's subtitle read "Daily thread, everyone posts once, closes at the bell." He read
that as a platform-wide limit of one post per day and then reasoned about that non-existent
rule for two paragraphs.

Fixed by rewriting it as "One reply each in this thread, closes at the bell, post freely
everywhere else."

Worth noting he liked the rule he invented. His argument was that a posting limit would
push people into the comments, and comments are engagement. Not a reason to add a cap, but
it does suggest the daily thread carries more weight in the design than it appears to.

### What landed

Pushback, which he singled out as creating engagement and discussion. The post types.
Requiring a reason on link posts, which he called clever. Showing what the network is
saying underneath a ticker's research.

Those are the three most opinionated decisions in the product, so having them land with
someone outside the demographic is real signal.

### What he asked for, and what was decided

Gamifying whose watchlist is performing best, plus badges, awards, and school rankings.
Declined. This is the leaderboard, which was removed deliberately and for reasons that have
not changed. The useful signal underneath it is that he did not mention beats or From the
desk at all, which suggests neither is legible enough to register as the status system that
replaced ranking. That is a design problem worth solving.

Linking a Robinhood account. Declined, since brokerage connections are out of scope for
regulatory reasons and because students with small accounts would make real portfolios a
status contest. The signal underneath is that verification reads as important but
incomplete, which argues for making the school badge and attached data work harder
visually.

A news section drawing from sources users pick. He flagged the API problem himself. Not
built, because this already exists as the Link post type, which is user-curated news with a
required reason and no API dependency. It simply is not visible enough for anyone to
notice.

### What he confirmed that was already known

That more initial users are needed to keep the feed from going stale. Independent
confirmation of the problem already identified as the biggest one.

---

## Open question this round did not answer

Nobody so far has named a specific post they would write. That remains the single strongest
signal available and it has not been collected yet. Ask it directly in every remaining
conversation: not "would you use this" but "what would you post."
