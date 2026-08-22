# Phase One Build Brief

August 2026. Everything needed to build the first shippable version of the new Dispatch.

**Copy this file into the repo** at `docs/phase-one.md` before starting. Claude Code reads
the repository, not the Claude Project, so a brief that lives only here is invisible to it.

## What phase one is

Sign in with a school email, write a post, reply to a post, read the feed.

That is the entire product. It exists to answer one question that no amount of planning can
answer: **will college students post and argue with each other without being prompted?**

Everything else in `claude/product-spec.md` waits.

### Why replies are in scope

The spec originally put replies in phase two. That was wrong. The thing being tested is
whether people argue with each other, and there is no way to observe arguing without a reply
box. A feed of unanswerable posts tests whether people will broadcast, which is a different
and less interesting question.

Replies here are plain and flat. No pushback type, no nesting beyond one level, no counts
beyond a simple number. The labelled Pushback action arrives in phase two.

## Explicitly not in scope

Do not build any of these, even if they seem small. Every one of them is specified elsewhere
and every one of them is a reason phase one ships late.

Post types (Take, Question, Thesis, Link). Ticker detection or cashtags. Attached market
data. The change-my-mind field. Themes and tags. Watchlists. The research pages. Ticker
search. The Open daily thread. From the desk. Thesis-tested events. Notifications of any
kind. Email digests. LinkedIn anything. The `now at` field. Beats. School leaderboards or
the five-user threshold. Follow relationships. The installable web app manifest. Redirects
from the old site. Deleting the old product's pages.

The old site keeps running untouched on `master` throughout.

## Data model

Four tables. Supabase Postgres, with row level security on all of them.

**`schools`**
- `id` uuid primary key
- `domain` text unique, e.g. `unh.edu`
- `name` text, e.g. `University of New Hampshire`
- `short_name` text, e.g. `UNH`, used on the badge
- `alumni_email_retained` boolean, see `claude/alumni-verification.md`
- `created_at` timestamptz

Seed with UNH only for now. Additional schools are inserted by hand.

**`profiles`**
- `id` uuid primary key, references `auth.users(id)` on delete cascade
- `handle` text unique, lowercase, 3 to 20 chars, letters numbers and underscore only
- `display_name` text
- `school_id` uuid references `schools(id)`
- `grad_year` integer
- `created_at` timestamptz

Derive student versus alumni from `grad_year` at read time. Do not store a role.

**`posts`**
- `id` uuid primary key
- `author_id` uuid references `profiles(id)`
- `body` text, not empty, no maximum length
- `created_at` timestamptz
- `edited_at` timestamptz nullable
- `deleted_at` timestamptz nullable

**`replies`**
- `id` uuid primary key
- `post_id` uuid references `posts(id)`
- `author_id` uuid references `profiles(id)`
- `body` text
- `created_at` timestamptz
- `deleted_at` timestamptz nullable

Deletion is soft in both cases. A deleted post renders as a tombstone that still shows its
replies. Editing is allowed for twelve hours after `created_at` and sets `edited_at`; full
revision history is phase two, but the twelve hour rule and the `edited` marker ship now.

### Row level security

Posts and replies are readable by everyone including signed-out visitors, since the site is
open to read. Insert requires an authenticated user whose `profiles.id` matches
`author_id`. Update and delete require the same and are the only writes a user can make to
someone else's rows, which is to say none.

Profiles are readable by everyone. A user can update only their own.

Schools are readable by everyone and writable by nobody through the API.

## Auth

Supabase email OTP with a six digit code rather than a magic link. Codes work when someone
signs up on a laptop and checks mail on a phone, which magic links handle badly.

The domain check happens server-side before the code is sent. Take the submitted address,
extract the domain, look it up in `schools`, and refuse politely if there is no match.
Never call `signInWithOtp` for an unrecognised domain, and never rely on client-side
validation for this.

After first verification the user lands on onboarding: choose a handle, confirm display
name, pick a graduation year from a list including past years. Create the profile row, then
go to the feed.

Session refresh already works through `proxy.ts`. Do not rebuild it.

## Routes

- `/` — the feed. Public. Newest first. Composer at top for signed-in users, a sign-in
  prompt for everyone else.
- `/signup` and `/login` — email entry, then code entry.
- `/onboarding` — handle, display name, graduation year. Only reachable with a session and
  no profile row.
- `/p/[id]` — a single post with its replies and a reply box.
- `/@[handle]` — minimal profile: name, badge, graduation year, their posts. Nothing else.
- `/auth/*` — whatever Supabase needs.

## Interface

Match the existing brand: navy, cream, gold, Inter and IBM Plex Mono. The loosened radius
from the prototype applies here, meaning roughly 7 to 10 pixels, pill buttons and badges,
round avatars.

`claude/social-prototype.html` in the Claude Project is the visual reference. It is a
standalone HTML mockup, not code to copy, but the feed layout, post card, badge, and
composer should end up looking like it.

Two pieces of copy that are already decided and should ship as written:

The orientation line at the top of the feed: *Make an argument. Say what would change your
mind. Let people push back.* Followed by: *College students talking about markets under
their real name and school. Stocks, macro, crypto, geopolitics, anything that moves things.
Not a trading app.*

The badge renders as short name plus apostrophe year, for example `✓ UNH '27`, with ` ALUM`
appended when the graduation year is in the past.

## Constraints that will bite

Read `AGENTS.md` and `node_modules/next/dist/docs/` before touching routing, caching, or
metadata. This Next version has real breaking changes from older training data.

`error.tsx` boundaries are unreliable in this exact Next 16.2.10 and Turbopack combination.
Handle recoverable failures in the page component's own render rather than throwing to a
boundary. If you add one anyway, prove it works with a real forced throw before trusting it.

Set `robots: { index: false }` across the whole new surface for now. Phase one ships public
to read but unindexed, and indexing gets switched on later once there is content worth
landing on.

Verify empirically rather than against documentation. Build, run `next start`, and hit it
with curl. Documented behaviour has repeatedly not matched actual behaviour in this setup.

## Done means

- A stranger can open the site with no account and read the feed and any post.
- Someone with a `@unh.edu` address can sign up, receive a code, verify, choose a handle
  and graduation year, and land on the feed.
- Someone with a `@gmail.com` address is refused clearly and is never sent a code.
- A signed-in user can post, reply, edit within twelve hours, and delete.
- A deleted post shows as a tombstone with its replies intact.
- The badge shows the right school, the right year, and ALUM when the year is past.
- `npx tsc --noEmit` passes. `npm run build` passes. No new lint errors beyond the eight
  pre-existing `react-hooks/set-state-in-effect` ones.
- Nothing on `master` changed and the live site still works.

## Workflow

Branch named `feat/social-v1`. Push it. **Do not merge or open a pull request without
explicit sign-off.**

Small commits with real messages. Clean up scratch files and kill background dev servers
before declaring anything finished.

## The first prompt

Paste this into Claude Code in the repo:

> Read `docs/phase-one.md`, `AGENTS.md`, and `ARCHITECTURE.md` before writing anything.
>
> We are rebuilding The Dispatch from an equity-research tool into a campus-verified social
> platform where college students argue about markets. `docs/phase-one.md` describes the
> first shippable slice and the things deliberately left out of it.
>
> Start by reading those files and the existing auth and Supabase setup, then come back with
> a plan for phase one before writing code. Tell me what you found, what you plan to build in
> what order, and anything in the brief that conflicts with how the codebase actually works.
>
> Do not start coding until I approve the plan. Work on a branch called `feat/social-v1` and
> do not merge anything.
