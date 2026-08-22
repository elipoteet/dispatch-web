# The Dispatch — Project Context

Last updated August 2026, after the phase one social build. A fresh Claude conversation
should be able to pick up this project from this file plus `docs/product-spec.md`,
`docs/phase-one.md`, `ARCHITECTURE.md`, and `AGENTS.md`.

## How to talk to Eli — read this first

Eli is a **finance student, not a software engineer.** He is the sole owner of this project
and makes all the decisions, but he does not read code fluently. When explaining anything —
what you did, how something works, what a change means, what went wrong, or what you
recommend — use **plain, everyday language**:

- **Lead with what it means for him and the site**, not how the code works.
- **Avoid jargon.** If a technical term is truly unavoidable, define it in one short,
  plain-language aside the first time it appears (e.g. "a branch — a separate copy of the
  site's code, so nothing changes on your live site until you approve it").
- **Skip the code walkthroughs unless he asks.** He needs the outcome, the trade-offs, and
  what decision (if any) is his to make.
- **Keep it calm and concrete**, matching the site's own editorial voice. Short sentences.
- This is about **how you explain things to him**, not about lowering the quality or rigor
  of the actual work.

## What this is

**The Dispatch is being rebuilt** as a campus-verified place for college students to argue
about markets. You make an argument, you say what would change your mind, other people push
back. Everyone signs in with a school email and carries their school and class year on a
badge next to their name. Subjects run across all of finance: stocks, macro, rates,
commodities, geopolitics, crypto. The research engine sits inside the conversation rather
than beside it.

**`docs/product-spec.md` is the authoritative description of the product.** Read it before
working on anything user-facing. This file covers stack, brand, and traps.

Phase one shipped on the branch `feat/social-v1`: school-email sign-in, post, reply, edit
within twelve hours, soft-delete with a tombstone, and a feed readable without an account.
`docs/phase-one.md` is that brief.

### What it used to be

Until August 2026 this was an equity-research tool: type a ticker, get an auto-generated
memo with a scorecard and a buy/sell rating. That product is being retired. The rating
machine had no edge, since the inputs were free-tier data anyone could pull, and no reason
to return.

The analysis engine survives, but its job changes from producing a verdict to producing
context inside posts. **There is no rating, no scorecard, no track record, and no
leaderboard in the new product.** Do not reintroduce one.

- **Live site:** https://www.dispatchresearch.com
- **GitHub:** https://github.com/elipoteet/dispatch-web
- **Fallback URL:** https://dispatch-web-psi.vercel.app
- **Hosting:** Vercel, auto-deploys on push to `master`
- **Database/auth:** Supabase (Postgres + Auth)
- **Market data:** Twelve Data, Finnhub, Tiingo, all free-tier, all server-side only
- **Transactional email:** Resend

## Tech stack

- Next.js **16.2.10** (App Router, Turbopack) + React 19 + TypeScript
- `@supabase/ssr` + `@supabase/supabase-js`
- No other runtime dependencies — deliberately lean

## Where things live

- `app/(social)/` — the new product: feed at `/`, `/signup`, `/login`, `/onboarding`,
  `/p/[id]`, `/u/[handle]` (public URL is `/@handle` via a rewrite)
- `app/(research)/` — the retiring product: `/research`, `/portfolio`, `/leaderboard`,
  `/about`, `/give`, with its own layout and chrome
- `app/api/auth/request-code/` — the domain-gated, rate-limited OTP request route
- `lib/analysis/` — the engine: `indicators.ts`, `scoring.ts`, `report.ts`,
  `loadReport.ts`, `historical.ts`
- `lib/providers.ts` — market data wrappers, server-only, cached with `unstable_cache`
- `lib/supabase/` — clients and proxy helpers
- `components/social/` — the new surface's components
- `proxy.ts` — session-refresh middleware (Next 16 renamed `middleware.ts` → `proxy.ts`)
- `supabase/migrations/` — hand-written SQL, pasted into the Supabase SQL editor by hand.
  This repo has never used the Supabase CLI migration runner.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
TWELVE_DATA_API_KEY
FINNHUB_API_KEY
```

(Values are secrets — never commit them, never paste them into a Claude conversation.)

## Brand / design rules

- **Palette:** navy, cream, gold accent, plus red for error and green for positive, defined
  as CSS custom properties in `app/globals.css` that flip under `[data-theme="dark"]` and
  `prefers-color-scheme`. Light and dark are both first-class.
- **Typography:** Inter for body and UI, IBM Plex Mono for labels, data, and uppercase
  micro-copy with wide letter-spacing. Load-bearing for the "newspaper research desk" feel.
- **Radius:** the research surface is zero-radius everywhere, deliberately and strictly.
  **The social surface loosens this**, with roughly 7 to 10px radius, pill buttons and
  badges, and circular avatars. Those tokens are scoped under a `.social` wrapper class so
  the two surfaces never contaminate each other.
- **Voice:** calm, editorial, declarative. Explicitly not a trading terminal. No hype copy.
- **Logo mark:** a navy "D" with a gold ascending-arrow line through it, inline SVG in
  `components/layout/Logo.tsx`, hardcoded light-mode-only in `app/icon.svg`.

## Known, hard-won gotchas

`AGENTS.md` warns: **this Next.js version has real breaking changes from older training
data — read `node_modules/next/dist/docs/` before writing code that touches routing,
caching, or metadata.**

1. **`error.tsx` route boundaries are unreliable** in this Next 16.2.10 + Turbopack setup.
   A documented, standard `error.tsx` worked on the first render pass but sometimes fell
   through to the framework's generic fallback on re-render, even in an isolated repro.
   Handle recoverable failures in the page component's own render instead. If you add one
   anyway, prove it works with a real forced throw.
2. **`notFound()`'s automatic `noindex` doesn't reliably apply** once a custom
   `not-found.tsx` exists for that segment. Set `robots: { index: false }` explicitly.
3. **`@folder` is the parallel-routes slot convention, not a URL segment.** A literal
   `app/@[handle]/` folder silently never routes. The social surface uses a real page at
   `/u/[handle]` plus a `rewrites()` entry so the public URL stays `/@handle`.
4. **Twelve Data's free tier is 8 requests per minute.** A feed strains this far harder
   than a search box ever did. Anything that fans out across symbols must be budgeted
   against that ceiling.
5. **Distinguish "this ticker doesn't exist" from "the provider is down."**
   `lib/providers.ts` throws `NoTickerDataError` when a provider confirms no data, vs a
   plain `Error` for HTTP failures. Collapsing these back into one message was exactly the
   bug that got fixed.
6. **`unstable_cache` is the right tool for durable per-argument caching on Vercel.** A
   plain in-memory `Map` does not persist across serverless invocations. Provider caching is
   already done and live.
7. **Supabase issues eight-digit OTP codes here, not six**, and there is no length setting
   in the dashboard. The code entry UI accepts any non-empty length up to 12. Do not assume
   "six-digit" is literal anywhere in the docs.
8. **Always verify empirically.** Documented Next.js behavior has repeatedly not matched
   actual behavior in this version and bundler combination. Build, run `next start`, hit it
   with curl.

## Workflow conventions

- **Small fixes and content edits:** commit directly to `master`, push, then poll production
  with curl to confirm the deploy landed before reporting done.
- **Bigger features:** create a branch, push it, but **do not merge or open a PR unless
  explicitly asked.**
- **The social rebuild lives on `feat/social-v1`** alongside the live site. The current site
  keeps working until the replacement is real.
- **Always run `npx tsc --noEmit` and `npm run build` before considering something done.**
  `npm run lint` currently fails on about 11 pre-existing errors on `master` unrelated to
  any single change — don't be alarmed by those, don't add new ones.
- Never commit test files or scratch servers. Kill background dev servers and clean up
  before finishing.

## Open items

- `feat/social-v1` is built and pushed, not merged. Awaiting review and sign-off.
- **SPF and DKIM on `dispatchresearch.com` are not fully confirmed.** Resend marks the
  domain verified, but the `send` CNAME never confirmed resolving at the authoritative
  nameserver. This does not block sending but likely affects spam placement, and every user
  has to receive a code to sign up. Worth settling before real users arrive.
- The Monthly Leaderboard on `master` belongs to the retiring product and the new spec
  forbids anything like it. The decision to remove it has not been made.
- Two independent handle systems exist: `competition_profile.handle` from the leaderboard,
  and `profiles.handle` from the social product. No shared uniqueness constraint.
- The old per-ticker memo URLs need 301 redirects to the new ticker pages in phase three.
