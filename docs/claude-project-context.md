# The Dispatch — Claude Project Context

Last updated August 2026. A fresh Claude conversation should be able to pick up this
project from this file plus `docs/product-spec.md` (v2), `docs/state-of-play.md`,
`ARCHITECTURE.md`, and `AGENTS.md`.

## How to talk to Eli — read this first

Eli is a **finance student, not a software engineer.** He is the sole owner of this
project and makes all the decisions, but he does not read code fluently. When
explaining anything — what you did, how something works, what a change means, what
went wrong, or what you recommend — use **plain, everyday language**:

- **Lead with what it means for him and the site**, not how the code works.
- **Avoid jargon.** If a technical term is truly unavoidable, define it in one short,
  plain-language aside the first time it appears (e.g. "a branch — a separate copy of
  the site's code, so nothing changes on your live site until you approve it").
- **Skip the code walkthroughs unless he asks.** He needs the outcome, the trade-offs,
  and what decision (if any) is his to make.
- **Keep it calm and concrete**, matching the site's own editorial voice. Short
  sentences. No walls of technical detail, no unexplained acronyms.
- This is about **how you explain things to him**, not about lowering the quality or
  rigor of the actual work — the engineering should still be careful and correct; only
  the explanations should be simple.

## What this is

**The Dispatch is a campus-verified place for college students to talk about markets,**
with research sitting inside the conversation rather than beside it. Students sign in
with a school email, carry a school and class-year badge next to their name, and post
about anything that moves markets — a single company, a rate decision, a shipping lane.

The product's shape is **two halves and a pipe**:

- **Spaces** — private, invite-only group feeds where a finance club actually talks.
- **The public feed** — the open, campus-verified conversation anyone can read.
- **Promotion** — the pipe. An author takes a post from a space and publishes it to the
  public feed, deciding at that moment what kind of post it is and what they own. Replies
  stay behind in the space. Neither half is the center; the passage between them is.

**`docs/product-spec.md` (v2) is the authoritative description of the product.** Read it
before working on anything user-facing. **`docs/state-of-play.md` is the authoritative
status** — what is built, what is unverified, what was deferred. This file covers the
stack, the brand, and the traps.

Reference material also in the Project: `claude/social-prototype.html` (the v2 prototype,
also committed at `docs/prototype-v2.html`) and `claude/network-pivot-plan.html` (strategy
deck).

### What it used to be

Until August 2026 the site was an equity-research tool: type a U.S. ticker, get an
auto-generated memo with a scorecard and a buy/sell rating built from live market data.
That product is being retired. The rating machine had no edge — the inputs were free-tier
data anyone could pull — and no reason to return.

The scoring engine survives, but its job changes from producing a verdict to producing
context inside posts. **There is no rating, no score, no scorecard, no track record, and
no buy/sell badge anywhere in the new product. Do not reintroduce one.** Eli rejected this
explicitly: "it's subjective, it's just a number not a fact."

## Where it lives

- **Old product, live:** https://www.dispatchresearch.com — serving `master`, untouched
- **New product:** https://try.dispatchresearch.com — serving the `feat/social-v1` branch,
  public to read, noindexed. This is the link a club officer would be sent.
- **GitHub:** https://github.com/elipoteet/dispatch-web
- **Branch:** `feat/social-v1` — pushed, **not merged**, no PR
- **Fallback/staging URL:** https://dispatch-web-psi.vercel.app
- **Hosting:** Vercel, auto-deploys on push
- **Database/auth:** Supabase (Postgres + Auth)
- **Email:** Resend
- **Market data:** Twelve Data (prices), Finnhub (fundamentals/news/tape), free tier,
  server-side only

## Tech stack

- Next.js **16.2.10** (App Router, Turbopack) + React 19 + TypeScript
- `@supabase/ssr` + `@supabase/supabase-js` for auth and Postgres access
- Deliberately lean — no component library, no state library, no ORM

## Where things live (see `ARCHITECTURE.md` for the full map)

- `app/` — the feed at `/`, `spaces/`, `u/[handle]` (profiles), `research/`, `about/`,
  `settings/`, `signup/`, plus the retired product's `portfolio/` and `pricing/`
- `app/api/` — `analyze/[ticker]`, `watchlist`, `tape`, `portfolio/*`, auth/code routes,
  notification and unsubscribe routes
- `lib/analysis/` — the engine: `indicators.ts`, `scoring.ts`, `report.ts`,
  `loadReport.ts`, `historical.ts`
- `lib/providers.ts` — Twelve Data / Finnhub fetch wrappers, server-only
- `lib/supabase/`, `lib/db.ts` — Supabase clients
- `components/` — `social/`, `research/`, `portfolio/`, `layout/`, `auth/`
- `supabase/migrations/` — `0001`–`0012`, all applied by hand
- `proxy.ts` — session-refresh middleware (Next 16 renamed `middleware.ts` → `proxy.ts`)

## Environment variables required

Set in `.env.local` locally and in Vercel's project settings for production:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
TWELVE_DATA_API_KEY
FINNHUB_API_KEY
RESEND_API_KEY
```

(Values are secrets — never commit them, never paste them into a Claude conversation.)

**`RESEND_API_KEY` has never been confirmed present in Vercel production.** If email is
not arriving, check that first.

## Database and migrations

Twelve migrations, `0001`–`0012`. The social ones: `0006_social.sql` (schools, profiles,
posts, replies, the `auth_code_requests` rate-limit table, the post-edit-window and
reply-immutability triggers), `0007_composer.sql`, `0008_pushback_notifications.sql`,
`0009_school_colors.sql`, `0010_avatars.sql`, `0011_spaces.sql`,
`0012_fix_space_rls_recursion.sql`.

**House convention: migrations are hand-pasted into the Supabase SQL editor by Eli.** An
agent must never execute DDL against the live database with the service role key. Write the
migration file, explain in plain language what it creates, and let him paste it.

**If a migration would change or drop an existing table, stop and ask.** New objects only,
unless he has explicitly approved otherwise.

## Brand / design rules

- **Palette:** navy `--navy`, cream `--cream`, gold `--gold` accent, plus `--accent`
  (red/error) and `--green` (positive). CSS custom properties in `app/globals.css` that
  flip under `[data-theme="dark"]` / `prefers-color-scheme` — light and dark are both
  first-class.
- **Typography:** Inter (body/UI) + IBM Plex Mono (labels, data, uppercase micro-copy with
  wide letter-spacing). Load-bearing for the "newspaper research desk" feel.
- **Radius:** the research and marketing surfaces stay **zero-radius** (strict). The social
  surface, scoped under `.social`, deliberately loosens: modest radii (~7–10px), pill
  buttons, tags and badges, circular avatars. `docs/prototype-v2.html` is the reference.
- **Voice:** calm, editorial, declarative. Explicitly *not* a trading terminal. No hype
  copy, no "institutional-grade" language.
- **Logo mark:** navy "D" with a gold ascending-arrow line through it — inline SVG in
  `components/layout/Logo.tsx`, and hardcoded light-mode-only in `app/icon.svg` (favicons
  render outside page CSS context).
- **School accent:** each school's own colour tints its badge, exposed as the
  `--school-accent` custom property.

## Known, hard-won gotchas — read before touching internals

`AGENTS.md` warns: **this Next.js version has real breaking changes from older training
data — read `node_modules/next/dist/docs/` before writing code that touches routing,
caching, or metadata.** Traps already hit and worked around:

1. **`error.tsx` route boundaries are unreliable in this exact Next 16.2.10 + Turbopack
   setup.** Standard `error.tsx` worked on the first render pass but a subsequent
   re-render sometimes fell through to the framework's generic "page could not be found"
   fallback, even in a minimal isolated repro. **Verify any `error.tsx` you add actually
   works with a real forced-throw test before trusting it.** Current workaround: handle
   recoverable failures in the page component's own render (a normal 200 with inline
   messaging) instead of throwing.
2. **`notFound()`'s documented automatic `noindex` injection doesn't reliably apply** once
   a custom `not-found.tsx` exists for that segment. Set `robots: { index: false }`
   explicitly in `generateMetadata`'s fallback path instead.
3. **`@folder` is the parallel-routes slot convention, not a URL segment.** An `app/@handle`
   directory does not produce `/@someone` URLs. Handle profile URLs are served by a
   `rewrites()` rule mapping `/@:handle` → `/u/:handle`.
4. **API route folders whose name starts with `_` silently 404.** The underscore marks a
   private folder that is excluded from routing. Renaming is the fix; there is no error
   message to tell you.
5. **Row-level-security policies that query their own table recurse infinitely.**
   `space_members`' policy selected from `space_members`, and Postgres errored on a real
   click, not at migration time. Fixed in `0012` with `security definer` helper functions
   `is_space_member()` and `is_space_owner()`. Any future policy on a membership-style
   table should use the same pattern.
6. **An inline `style` colour can only be overridden by another inline style**, not by a
   CSS class, so school-tinted elements set `--school-accent` as a custom property and let
   the stylesheet consume it — rather than writing `color` inline and fighting it later.
7. **Supabase email OTP in this project issues eight-digit codes, not six.** There is no
   dashboard setting for it. Any UI, validation, or copy that assumes six will break.
8. **Twelve Data's free tier is 8 requests/minute** and the social product strains it far
   harder than a search box did. Attached ticker data is therefore **frozen onto the post
   as JSON at publish time**, so rendering the feed makes zero provider calls. Keep it that
   way. The ticker tape runs on **Finnhub** with a twenty-minute cache for the same reason.
9. **Distinguish "this ticker doesn't exist" from "the provider is rate-limited/down."**
   `lib/providers.ts` throws `NoTickerDataError` when Twelve Data confirms no data for a
   symbol, vs. a plain `Error` for HTTP-level failures. `loadReport.ts` converts the former
   into `TickerDataError`, which 404s; a plain `Error` shows "temporarily unavailable."
   Collapsing this distinction was exactly the bug that got fixed.
10. **`unstable_cache` (from `next/cache`) is the right tool for durable, per-argument
    server-side caching on Vercel** — a plain in-memory `Map` does not reliably persist
    across serverless invocations. The unmerged `feat/provider-cache` branch moves provider
    caching into `unstable_cache`. Review it before any feature that multiplies provider
    calls.
11. **Vercel issues a unique CNAME target per domain.** Copying another subdomain's target
    produces "Invalid Configuration" — this cost real time on `try.dispatchresearch.com`.
    Read the value off that specific domain's page.
12. **Vercel Deployment Protection blocks preview URLs for anyone outside the team**, which
    looks like a working site to the signed-in owner and a login wall to everyone else.
    **Always check a link in an incognito window before sending it to anyone.**
13. **Always verify empirically, not just against docs.** Multiple times, documented
    Next.js behavior did not match actual behavior in this version/bundler combo. Build,
    run a real server (`next start`, not just `next dev`), and hit it with `curl`.

## Workflow conventions

- **Small fixes / content edits to the old live site:** commit directly to `master`, push,
  then poll production (`curl` the live URL) to confirm the deploy landed before reporting
  done.
- **The rebuild lives on `feat/social-v1`**, deployed to `try.dispatchresearch.com`. **It is
  not merged and no PR is opened without explicit sign-off from Eli.** The current site
  keeps working until the replacement is real.
- **Always run `npx tsc --noEmit` and `npm run build` before considering something done.**
  `npm run lint` fails on ~8 pre-existing `react-hooks/set-state-in-effect` errors unrelated
  to any single change — don't be alarmed by that specific failure, but don't add new lint
  errors either.
- Test files and scratch servers: never commit them; clean up before finishing.
- Work is organised in **phases**, each with a build brief written before and a recap
  written after. Both live in `docs/` and in the Project under `claude/`.

## Current state

**The old product** is complete and live at dispatchresearch.com and is being left alone.

**The new product** is built through phase three and live at try.dispatchresearch.com:
identity and eight-digit email verification, four post types with frozen ticker data,
replies and pushback, the twelve-hour edit window and tombstones, Spaces with invite links
and ownership transfer, promotion to the public feed, profiles with avatars, email
notifications and a weekly digest, the ticker tape, and light/dark themes.

**Phase four** — mobile bottom navigation, optimistic updates, the bordered card container,
modal accessibility, and rail search — is specified and approved but **not implemented**.
Mobile navigation is the blocker: Spaces are currently unreachable on a phone, which is the
device the first club will open the link on.

**After phase four there is no phase five build.** The next step is one club officer, one
conversation, one invite link. See the end of `docs/state-of-play.md`.

## Open threads

- Phase four, in the priority order given in `docs/state-of-play.md`.
- A list of built-but-never-verified items — SPF/DKIM above all, since every signup depends
  on a code arriving. See `docs/state-of-play.md`.
- Undecided product questions: the Monthly Leaderboard still on `master` (it belongs to the
  retired product), the moderation escalation path, whether promoted posts should name their
  space, cross-school spaces, legal review of terms and privacy, the two parallel handle
  systems, and `getFeedPosts`' flat limit of fifty with no cursor.
- `feat/provider-cache` branch: built, tested, pushed, **not merged**.

## Suggested Project custom instructions

> This project is **The Dispatch** (dispatchresearch.com, GitHub: elipoteet/dispatch-web,
> Next.js 16 + Supabase + Vercel). It is a campus-verified social platform where college
> students talk about markets, with research inside the conversation. Its shape is **two
> halves and a pipe**: private invite-only **Spaces**, the public **feed**, and
> **promotion** — an author publishing a space post outward while replies stay behind.
> Neither half is the center; the passage between them is.
>
> The rebuild lives on the `feat/social-v1` branch and is live at
> **try.dispatchresearch.com**. The old equity-research product still serves `master` at
> dispatchresearch.com and is being left alone.
>
> Read `claude/product-spec.md` for the product, `claude/state-of-play.md` for what is
> built and what is left, and `claude-project-context.md` for the stack, brand rules, and
> hard-won Next.js 16 gotchas — particularly: `error.tsx` boundaries are unreliable here,
> `@folder` is a parallel-routes slot rather than a URL segment, RLS policies that query
> their own table recurse, Supabase issues eight-digit codes here, and Twelve Data's free
> tier is 8 requests/minute. Verify anything routing/caching/metadata-related empirically
> rather than trusting documentation.
>
> There is no rating, score, or track record anywhere in the product; do not reintroduce
> one. Match the brand (navy/cream/gold, Inter + IBM Plex Mono, calm editorial voice;
> research surfaces zero-radius, the social surface loosened). Migrations are hand-pasted
> into Supabase by Eli — never run DDL against the live database, and stop and ask if a
> migration would change or drop an existing table. Small fixes go straight to `master`
> and get pushed once verified; the rebuild is not merged without explicit sign-off.
>
> **Eli is a finance student, not an engineer.** When explaining anything, use plain,
> everyday language. Lead with what it means for him and the site, not how the code
> works. Avoid jargon; if a technical term is unavoidable, define it in one short
> plain-English aside. Skip code walkthroughs unless he asks. Keep the engineering
> rigorous, but keep the explanations simple.
