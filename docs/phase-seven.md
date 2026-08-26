# Phase Seven — Dispatch AI

Branch `feat/social-v1`. Read `docs/product-spec.md` (v2), `docs/state-of-play.md`,
`docs/claude-project-context.md` and `docs/phase-six.md` first. Phase six (roles and badges)
must land before this — Dispatch AI is a fifth role and reuses that machinery.

Came out of the mentor conversation in `docs/feedback-log.md`: *"create a Dispatch AI bot that
posts about trends in the community or highlights posts that are interesting."* Eli chose the
posting version, with its own account and a distinct badge.

The published design page is the visual spec.

---

## The one thing to understand before building

**There is no language model in this phase, and that is deliberate.**

Everything Dispatch AI posts is a count, a percentage or a timestamp — facts already sitting in
Postgres and in the Finnhub response the site already fetches. Filling those into a fixed
sentence needs a template, not a model.

Doing it with templates is not a shortcut. It removes an entire class of risk that matters more
here than on most products:

- A model writing free text about securities on a finance site can invent a market claim, and
  it would appear under an account carrying the site's own name.
- Templates are auditable. Every possible sentence can be read before it ships.
- Deterministic output cannot drift, cannot be prompt-injected by the text of a student's post,
  and costs nothing to run.

A model earns its place later, for one job only: reading a post's "what would change my mind"
line and deciding whether a news headline satisfies it. That is genuinely hard to do with rules.
It is also the highest-risk thing this account could ever say, so it is not in this phase. Note
it in the recap as the next candidate.

If Claude Code disagrees and thinks a model is needed for a v1 template, stop and say so rather
than adding one.

---

## A. The account

- A real `profiles` row, `role = 'system'` — a fifth value on the enum added in `0013_roles.sql`.
  Handle `dispatchai`, display name **Dispatch AI**.
- Created by migration or a seed script, never through signup. No auth user should be able to
  sign in as it.
- No school, no grad year. It exercises exactly the same null paths the mentor role needs, so
  build those once and use them for both.
- It has a profile page. One line on it, verbatim: *An automated account. It posts counts and
  moves, never opinions, and never replies.*

## B. The badge — a square, not a rosette

**The rosette means a verified person.** Adding a fifth rosette colour would silently change
what it means to "verified account type," which weakens it for all four human tiers. So the
machine badge is a different *shape*:

- Rounded square, `rx=3.2` on a 16x16 viewBox: `<rect x="1.1" y="1.1" width="13.8" height="13.8" rx="3.2"/>`
- Same check path inside as the human badges: `M4.6 8.2l2.3 2.3 4.5-4.6`
- Slate `#4E5A6B` light, `#8B98AB` dark, as `--v-system`
- Its avatar is a rounded square too, not a circle — the shape rule holds everywhere

Shape carries human-versus-machine; colour carries which kind of human. That rule should be
written into the badge component so nobody adds a sixth rosette later without thinking.

## C. What it posts — five templates

Each is a normal row in `posts` authored by the system profile, so the feed, the ticker pages
and the post permalink all work with no special cases. Add a `posts.generated` boolean (or a
new post type) so the card can be styled and so these can be excluded from counts about human
activity — **a generated post must never be counted as a post about a ticker**, or the bot
starts reporting on itself.

1. **Ticker moved** — a ticker in the site's posts moved more than a threshold today, and
   people here have written about it. *"$NVDA closed up 8.24% today. Six people here have posted
   about it this week."* Links to the ticker page from phase five.
2. **Unanswered question** — a Question post older than ~12 hours with zero replies.
   *"Tom Brennan asked a question about $CMG 18 hours ago and nobody has replied."* This is the
   most useful of the five on a thin site: it converts a dead post into a reply.
3. **First mention** — the first post about a ticker that has never appeared before.
   *"First post about $ANET on The Dispatch."*
4. **Promotion flow** — weekly. *"Four posts came out of spaces and into the feed this week.
   Two were theses."* Never names a space, per the existing rule.
5. **Busiest beat** — weekly. *"Energy was the most-posted beat this week: 11 posts across
   $VST, $CEG and $XOM."*

### The rule that keeps this from becoming a leaderboard

**It states counts. It never ranks, praises or characterises.**

| Allowed | Never |
|---|---|
| "$VST — four posts today, three of them theses." | "The best thesis on Dispatch this week." |
| "Marcus Webb's post has 9 replies." | "Marcus is one of the sharpest posters here." |
| "$NVDA closed up 8.24%." | "$NVDA surged on strong demand." |

The left column is arithmetic anyone can check. The right is a ranking, a reputation score and
a market opinion — the three things this product deliberately does not have. The mentor's word
was "highlights"; highlighting the *best* posts is a leaderboard wearing a hat, and the spec
forbids it. Counts deliver the same usefulness with none of that.

No adjectives about price movement — no *surged*, *plunged*, *rallied*, *collapsed*. State the
number and stop.

## D. Frequency, which is the thing most likely to ruin it

- **At most one post per day**, and only when a template actually has something to report.
- **Silence is the default.** A bot posting "nothing happened today" on a quiet feed is worse
  than an empty feed, because it advertises that nothing happened.
- Weekly templates (4 and 5) fire once, on a fixed day.
- Never two of the same template in a row.
- Suppress everything if the site had fewer than a floor number of human posts that day — while
  there are four people on the site, a bot narrating them is embarrassing. Make the floor a
  constant that is easy to change.

Runs on a scheduled job alongside the existing `/api/cron/digest` and `/api/cron/alerts`.

## E. Interaction

- **Replies: yes.** People can reply under its posts and talk to each other. That is the point
  of putting it in the feed rather than in a sidebar.
- **Pushback: no.** Pushback exists to dispute a claim, and the bot makes none. Disable it on
  generated posts rather than leaving a button that means nothing.
- **It never replies to anyone**, and its profile says so. Do not build a reply path — the
  moment it answers once, people will expect it always to.
- Not editable, not deletable by users. Eli can delete one; it leaves the normal tombstone.

## F. Things that will bite

- **Private spaces must never leak.** Templates 4 and 5 read across spaces. Every query must be
  restricted to public posts, and template 4 reports only that promotion happened, never what
  or where from. Verify with a space Eli is not a member of.
- **Self-reference loop.** If generated posts count as posts, the bot will report on its own
  activity. Exclude `generated = true` from every count it makes.
- **The ticker-moved template needs a price**, which means a provider call. Reuse the cached
  `getTickerSnapshot` path and run the job once daily — do not add a new uncached fetch.
  Twelve Data's ceiling is still 8 requests a minute.
- **A deleted or edited post** referenced by a generated post. Template 2 in particular points
  at a specific question; if it is deleted, the generated post should degrade gracefully rather
  than 404 a reader.
- **Email digest.** Generated posts should probably not appear in the weekly digest — decide
  deliberately and write down which.

---

## Before you call it done

1. `npx tsc --noEmit` and `npm run build` clean; no new lint errors.
2. Real `next start`, then `curl`.
3. Run the job by hand against real data and read all five templates as they actually render.
   Every number must be independently verifiable against the database.
4. Confirm generated posts are excluded from every count the bot itself makes.
5. Confirm no template can surface a private space's contents — test from an account that is
   not a member.
6. Confirm the square badge and squared avatar render beside the four rosettes, light and dark.
7. Confirm pushback is absent, replies work, and the bot never appears in a reply notification.
8. Confirm the daily cap and the quiet-day floor both actually hold — force a run twice.
9. Check a generated card at 390px.

Report in plain language: what it posted, and anything in this brief that turned out wrong.
