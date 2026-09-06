@AGENTS.md

# The Dispatch — working rules

## How to talk to Eli — read this first

Eli is a **finance student, not a software engineer.** He owns this project and makes every
decision, but he does not read code fluently.

- **Lead with what it means for him and the site**, not how the code works.
- **Avoid jargon.** If a technical term is truly unavoidable, define it in one short plain-English
  aside the first time it appears.
- **Skip code walkthroughs unless he asks.** He needs the outcome, the trade-offs, and what
  decision is his to make.
- **Keep it calm and concrete.** Short sentences, matching the site's own editorial voice.
- This governs **how you explain**, never how carefully you work. The engineering stays rigorous;
  only the explanation gets simpler.
- **Report failures plainly.** If something did not work, say so and show the output. Do not
  describe unverified work as done.

## What this is

The Dispatch is a **campus-verified place where college students talk about markets**, with
research inside the conversation. Its shape is **two halves and a pipe**: private, invite-only
**Spaces** where a club works; the public **feed** where conclusions live; and **promotion**, an
author publishing a Space post outward while the replies stay behind. Neither half is the centre —
the passage between them is.

There are **two products in this one repository.** The new one lives in `app/(social)/` and is
served at try.dispatchresearch.com from `feat/social-v1`. The retired research-desk product lives
in `app/(research)/` and still serves dispatchresearch.com from `master`. They share only the
login system.

| Read this | For |
|---|---|
| `docs/product-spec.md` (v2) | What the product is. Authoritative for everything built |
| `docs/product-spec-v3.md` | Where it is going — the research-network direction. **Draft** |
| `docs/state-of-play.md` | What is built, what is unverified, what was deferred |
| `ARCHITECTURE.md` | The map: routes, `lib/`, components, migrations, jobs |
| `docs/claude-project-context.md` | Stack detail and the long-form Next.js gotchas |

## Rules that do not bend

1. **No scores, ratings, or track records.** Not on people, posts, clubs, or anything else. The
   retired product's scoring engine survives to produce *context*, never a verdict. Its code is
   still in the tree, which is exactly why this is easy to reintroduce by accident. Eli rejected
   it explicitly: *"it's subjective, it's just a number not a fact."*
2. **Never run DDL against the live database.** Migrations are written as files in
   `supabase/migrations/` and hand-pasted into the Supabase SQL editor by Eli. Never execute
   schema changes with the service-role key. **If a migration would change or drop an existing
   table, stop and ask.** New objects only.
3. **The feed never fetches live market data.** Ticker data is frozen onto the post as JSON at
   publish time. Twelve Data's free tier allows **eight requests per minute**, and the feed would
   destroy that. Anything that fans out across symbols must be budgeted deliberately — copy
   `lib/analysis/mostTraded.ts`, which fills a whole panel with one request per day.
4. **`feat/social-v1` is not merged and no PR is opened without explicit sign-off from Eli.**
   Small fixes to the retired live site go straight to `master`, pushed, then confirmed with a
   `curl` against production.
5. **Do not coin new vocabulary.** An early tester counted twelve terms a new user had to learn
   before getting any value. "Beat", "Space", "desk", "pushback", "promotion" already exist and
   are plain English. See v2's naming-discipline section.
6. **Never commit secrets, test files, or scratch servers.** Clean up before finishing.

## Where code goes

- `app/(social)/` — the new product's pages. `app/(research)/` — the retired product's pages.
- `app/api/*/route.ts` — HTTP handling, auth checks, input validation. **Thin.**
- `lib/<domain>/` — the actual logic. `lib/social/`, `lib/analysis/`, `lib/competition/`,
  `lib/email/`, `lib/supabase/`.
- `components/<surface>/` — UI, grouped by the surface that owns it.
- New work for the research-network direction follows `docs/product-spec-v3.md`. **That spec is
  still a draft with open decisions in it — do not invent answers to them.** Ask Eli.

### Import boundaries

Enforced by `no-restricted-imports` in `eslint.config.mjs`. If one is in your way, that is a
conversation, not a disable comment.

- **The two products never import each other.** Nothing in `components/social/` imports from
  `components/portfolio/`, `components/research/`, `components/leaderboard/` or
  `components/competition/`, and nothing goes the other way. They share `components/auth/` only.
- **`lib/` never imports from `components/`.** Logic does not depend on UI.
- **`lib/supabase/service.ts` is server-only.** It holds the service-role key, which bypasses
  every row-level-security rule. It must never be reachable from a client component.
- **Shared constants are imported, never re-declared.** `TICKER_PATTERN` lives in `lib/ticker.ts`,
  in its own dependency-free module — three API routes each had a private copy of it before
  September 2026, and the social product was importing the whole research engine to borrow it.

### Business logic belongs in `lib/`, not in a route handler

The canonical example of getting this wrong is in the tree right now: buy/sell mutation logic is
written twice, near-identically, inside `app/api/portfolio/trade/route.ts` and
`app/api/competition/trade/route.ts`, while the read-side equivalents were correctly factored into
`lib/portfolio.ts` and `lib/competition/trading.ts`. A route handler should validate its input,
call into `lib/`, and shape the response.

## Before you call anything done

```bash
npx tsc --noEmit     # must be clean
npm run build        # must be clean
npm test             # Vitest unit tests must pass
npm run lint         # no NEW errors
```

`npm run lint` fails on ~8 pre-existing `react-hooks/set-state-in-effect` errors that predate any
current change. Do not be alarmed by that specific failure, do not "fix" it as a side quest, and
do not add to it.

**Then run it for real.** `next dev` is not proof. Build, start a real server (`next start`), and
hit it with `curl`. For anything user-facing, check 1440px, 1100px, 900px and 390px.

**`npm run test:e2e`** runs the Playwright smoke tests against a local production build.

## Traps in this exact setup

This is **Next.js 16.2.10 + Turbopack**, which differs from most training data. `AGENTS.md` is
right: read `node_modules/next/dist/docs/` before writing routing, caching or metadata code.
**Verify empirically — documented behaviour has repeatedly not matched actual behaviour here.**

1. **`error.tsx` boundaries are unreliable.** They work on first render, then sometimes fall
   through to the framework's generic not-found page. Handle recoverable failures inside the
   component's own render — a normal 200 with inline messaging — instead of throwing.
2. **`notFound()`'s automatic `noindex` does not reliably apply** once a custom `not-found.tsx`
   exists. Set `robots: { index: false }` explicitly in `generateMetadata`.
3. **`@folder` is the parallel-routes slot convention, not a URL segment.** `/@handle` works via a
   `rewrites()` rule in `next.config.ts` mapping it to `/u/:handle`.
4. **An API route folder starting with `_` silently 404s.** No error, no warning.
5. **RLS policies that query their own table recurse infinitely** — and error on a real click, not
   at migration time. Use the `security definer` helper pattern from `0012`.
6. **An inline `style` colour can only be overridden by another inline style.** School tinting
   sets the `--school-accent` custom property and lets the stylesheet consume it.
7. **Supabase issues eight-digit codes here, not six.** There is no setting for it. Any UI,
   validation or copy assuming six will break.
8. **Distinguish "no such ticker" from "the provider is down."** `lib/providers.ts` throws
   `NoTickerDataError` for the former; `loadReport.ts` turns that into a 404, while a plain
   `Error` shows "temporarily unavailable." Collapsing the two was a real bug.
9. **Use `unstable_cache` for durable server-side caching.** A plain in-memory `Map` does not
   survive between serverless invocations on Vercel.
10. **Vercel issues a unique CNAME target per domain** — read it off that domain's own page.
11. **Vercel Deployment Protection blocks preview URLs for anyone outside the team.** It looks
    fine to the signed-in owner and like a login wall to everyone else. **Always check a link in
    an incognito window before sending it to anyone.**

## Known dead code — leave it

Verified unreachable, kept deliberately. Do not delete without asking, and do not assume it is
live: `components/research/` (7 files, the retired memo UI), `components/home/TickerTape.tsx`, and
`app/api/tape/route.ts`.
