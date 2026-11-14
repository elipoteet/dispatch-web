# Phase ten, Stage A: paper trading retired

Written 2 November 2026. Branch `feat/research-site`. The brief is `docs/phase-ten/phase-ten.md`, and the five design boards are saved in `docs/design/phase-ten/`.

## What a student sees now

- **No portfolio anywhere.** The Portfolio link is gone from the nav, the Paper trade button from every company page, and the Portfolio simulator card from the home page's Tools (Screener and Compare remain, both marked Coming).
- **Old links still work.** `/portfolio`, anything under it, `/leaderboard` and `/competition` each go straight to the research page in one step.
- **The tag under the logo** now reads "Research on every U.S. company" (it said "Equity Research & Analytics").
- **The sign-in window** says "Keep a watchlist and get alerts." instead of mentioning a paper portfolio.
- **Everything else is unchanged:** the watchlist, alerts, the alert bell, the daily alerts job and sign-in.

Nothing in the database changed. The `paper_account`, `paper_position`, `paper_transaction` and `equity_snapshot` tables are untouched, and nothing writes to them any more.

## What was removed

- **Files:** the portfolio page, its three API routes (account, equity curve, trade), the seven portfolio components (provider, desk, chart, trade window, onboarding window, signed-out page, toast), the Paper trade button and `lib/portfolio.ts`.
- **In the root layout:** the portfolio provider and the three pop-ups it drove. The toast was only ever used by trades.
- **Sitemap and robots:** `/portfolio` is no longer listed in the sitemap or blocked in robots.txt, so crawlers can follow the redirect.
- **Stylesheet:** 677 lines of `app/globals.css` (portfolio page, trade window, onboarding window, toast) plus the Paper trade button's row in `app/research-file.css`. Each class was checked unused first.
- **Price lookups only the portfolio used** (`lib/providers.ts`): `fetchLatestQuote`, and with it `fetchFinnhubQuote` and the Tiingo quote fallback, which had no other callers.
- **Comments** in the code and in `docs/claude-project-context.md` that described the portfolio as current.

## How it was checked

- **Type check, tests and build:** `tsc` is clean, all 321 tests pass, and the production build is clean. The build's route list no longer has `/portfolio` or `/api/portfolio/*`.
- **Redirects, with curl on `next start`:** `/portfolio`, `/portfolio/anything`, `/portfolio/a/b`, `/leaderboard`, `/leaderboard/2026-10` and `/competition` each answer a single 308 to `/research`. Following the redirect takes one hop and lands on a 200.
- **Old API routes:** `/api/portfolio/trade`, `/account` and `/equity-curve` answer 404, to both GET and POST.
- **A real browser, signed out**, fresh session each time:
  - Pages: the home page, `/research`, About, Give, all six NVIDIA tabs, a made-up ticker and `/portfolio`.
  - Settings: 1280 and 390 pixels wide, light and dark. That makes 48 page loads.
  - Results:
    - No console errors.
    - No requests to the old portfolio routes, no Paper trade button and no Portfolio link anywhere.
    - No sideways scroll at 390.
    - The new logo tag on every page.
  - The made-up ticker logs one browser line, "Failed to load resource: 404". That is the page's own 404 status, which is correct.
- **Lint adds nothing new.**
  - It reports five problems: four "setState in an effect" errors (AuthModal, AccountModal, Masthead, `useTheme`) and the custom-font warning.
  - All five are present at `a73607e`, checked file by file.
  - Earlier recaps mentioned only the font warning, which was incomplete.

## Not checked: signed in

There's no test account, and making one would write to the live database, so I haven't clicked through signed in. Here is why it should be safe:
- The provider's removal could only break a page through a call to `usePortfolio()`. That function no longer exists anywhere, and the type check passes, so nothing can still call it.
- The signed-in-only parts (the alert bell, the account chip, the account and sign-in windows) import nothing that was removed.

**Please sign in on the preview and click around once:** the home page, a company page, and the alert bell.

## Where this went beyond the brief

- **Also deleted `lib/cache.ts`.** Its only user was the portfolio's quote cache, which is the same reason the brief gives for removing `fetchLatestQuote`.
- **Also removed two unused styles:** `.phase-stub` (used only by the signed-out portfolio page) and `.trade-action-btn` (used by nothing).
- **Cleared `.next/dev/types`.** An old `next dev` session had left a half-written file there that broke `tsc`. It's generated, not in git, and `next dev` rebuilds it.

## What the brief got wrong

- **The done-means grep isn't quite clean.** `grep -riE "portfolio|..." app components lib` also matches `lib/sec/__fixtures__/nvda-risk-factors.json`: NVIDIA's own risk factors say "product portfolio" and "IP portfolios". Those are the company's words in a test fixture, not our code.
- **That grep never sees the redirect rules.** It covers `app`, `components` and `lib`, but the rules live in `next.config.ts`. So once the fixture is set aside it finds nothing at all, rather than "only the redirect rules".

## Left alone

These are outside this stage, so I haven't touched them. They're candidates for a later tidy-up:
- `app/globals.css` still has the leaderboard's styles (dead since 30 October).
- It also still has many of the old memo page's styles, such as the report header, the scorecard, the Time Machine banner and the compare view. None of them is used since the research file replaced the memo.
