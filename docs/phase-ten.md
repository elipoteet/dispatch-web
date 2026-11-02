# Phase Ten: retire paper trading, add Recently viewed, refresh the look

Written 2 November 2026. Build brief for Claude Code. Branch `feat/research-site`, on top of `a73607e` ("Fixes from the 2 November review of stages 2 to 7"). Nothing reaches dispatchresearch.com until Eli signs off.

## Setup

Save this brief as `docs/phase-ten.md` and the five design files that came with it as `docs/design/phase-ten/` (`Main.dc.html`, `Financials.dc.html`, `Phone.dc.html`, `Home.dc.html`, `Style.dc.html`). Commit both with Stage A.

The design files are exported from the Design canvas "Dispatch Visual Refresh". They won't render on their own (they load the canvas's runtime), so read them as source: every size, weight, colour and spacing in their `<style>` blocks and inline styles is the value to build. Copy those numbers exactly rather than estimating. Their figures are illustrative; the site keeps every number exactly as it computes it today.

## For Eli, in plain English

Three changes, built in this order. The portfolio simulator and its Paper trade button go away, and old links to it land on the research page. A Recently viewed list appears on the home page and drops down under the search box, so a student can get back to the companies they were looking at; it's saved in their own browser, so it needs no account and puts nothing in the database. Then the whole research site gets the new look from the canvas: bigger, easier type, more space between sections, fewer boxes, and gold used only to mark the latest figure.

## Read first

`docs/direction-2026-10-30.md`, `docs/phase-nine.md`, `docs/phase-nine-review-fixes.md`, and `docs/claude-project-context.md` for the stack and the Next.js 16 gotchas.

## Decisions already made, do not relitigate

1. Paper trading is retired from the site. Its tables (`paper_account`, `paper_position`, `paper_transaction`, `equity_snapshot`) stay in the database untouched. No migration, nothing dropped.
2. Recently viewed lives in the visitor's browser (localStorage), not Supabase. It works the same signed in or out and never leaves the device.
3. The watchlist, alerts, the alert bell, the daily alerts job and sign-in all stay exactly as they are in this phase. Whether they survive is Eli's call, still open. Don't remove or change them.
4. Square corners, Inter and IBM Plex Mono stay. The palette stays navy, cream and gold, with the adjusted greys below. The canvas has two looks to try (Newsreader headlines, soft 6px corners); build neither unless Eli says so.
5. No rating, score, verdict, target, fair value or buy/sell language anywhere, as before.

## Stage A. Retire paper trading

Remove:
- `app/portfolio/`, `app/api/portfolio/` (account, equity-curve, trade), all of `components/portfolio/`, `components/company/PaperTradeButton.tsx` and `lib/portfolio.ts`.
- In `app/layout.tsx`: the `PortfolioProvider` wrapper, `OnboardingModal`, `TradeModal` and `Toast`. Confirm nothing else uses `Toast` first.
- In `components/company/CompanyHeader.tsx`: the Paper trade button and its `rf-actions` row.
- In `app/page.tsx`: the Portfolio simulator card under Tools.
- In `components/layout/TopNav.tsx`: the Portfolio link. Change the tag under the logo from "Equity Research & Analytics" to "Research on every U.S. company".
- In `components/auth/AuthModal.tsx`: "Access your watchlist and paper portfolio." becomes "Keep a watchlist and get alerts."
- In `app/sitemap.ts` and `app/robots.ts`: `/portfolio`.
- In `app/globals.css`: the portfolio, trade modal, onboarding and toast styles, once a search shows nothing references their class names.
- In `lib/providers.ts`: `fetchLatestQuote` if nothing else calls it once `lib/portfolio.ts` is gone. Keep `fetchFinnhubQuote` if anything still uses it. Delete comments that mention the portfolio.

Redirects in `next.config.ts`, all permanent: `/portfolio` and `/portfolio/:path*` go to `/research`. Repoint the existing `/leaderboard`, `/leaderboard/:path*` and `/competition` rules from `/portfolio` straight to `/research`, so nobody takes two hops.

Done means:
- `grep -riE "portfolio|paper.?trad|PaperTrade|TradeModal" app components lib` finds only the redirect rules and comments that explain them.
- On `next start`, `/portfolio`, `/portfolio/anything`, `/leaderboard` and `/competition` each answer a single 308 to `/research`, checked with curl.
- `/api/portfolio/trade` answers 404.
- Every page renders signed in and signed out with no console errors. Removing the provider is where a missing context would show up.

## Stage B. Recently viewed

What a student sees (the Home board):
- On the home page, between the hero and "Start with a company", a Recently viewed section, shown only when the list isn't empty. Up to 8 cards, newest first. Each shows the ticker, the company name, when it was viewed ("Just now", "2 hours ago", "Yesterday", "3 days ago", "Last week", then a date) and the tab last open, and links to that company at that tab. Each card has a remove button with the aria-label "Remove {name} from recently viewed". The heading row has "Saved on this device only" and a "Clear all" button.
- Under the search box on the home page, on `/research`, and in the new nav search on company pages: when the box is focused and empty, a dropdown headed "Recently viewed" with the latest 5 and a Clear button, then the line "Type to search every U.S. company by ticker or name." Once the visitor types, the existing search results take its place. Arrow keys, Enter and Escape work as they do in the results list today.
- `/research` shows the same section under its search.

How it works:
- One client-only module, `lib/recent.ts`: `readRecent()`, `addRecent(entry)`, `removeRecent(symbol)`, `clearRecent()`. Storage key `dispatch.recent.v1`. An entry is `{ symbol, name, tab, viewedAt }`, symbol uppercase. Adding a company already listed moves it to the top and updates its tab. Keep 12, show 8.
- Every read and write sits in try/catch. A private window, blocked storage or a corrupted value gives an empty list, never an error. Parse defensively and drop entries that aren't the right shape. Names are display text only; never pass them to `dangerouslySetInnerHTML`.
- Recording: a small client component rendered in `app/research/[ticker]/layout.tsx` after the `notFound()` checks, given the symbol and name. It reads the tab from the pathname and calls `addRecent` in an effect. Only real company pages get recorded; a 404 never does.
- Reading: the section is a client component that renders nothing on the server and fills in after mount, so there's no hydration mismatch and the pages stay cacheable. Use `useSyncExternalStore` with a `storage` event listener, so a second tab stays in step and no new set-state-in-effect lint error appears. Its `getSnapshot` must return the same array while the stored string hasn't changed (cache the parsed value by the raw string), or React re-renders forever. `getServerSnapshot` returns a shared empty array.
- `prefetch={false}` on every recent link, for the same reason as the home page's example cards: a prefetched company page spends Twelve Data requests.

Done means:
- Unit tests for `lib/recent.ts`: add, move to top, cap at 12, remove, clear, corrupted JSON, storage that throws, and an entry of the wrong shape.
- On `next start` in a real browser: open NVDA Overview, then COST Valuation, then JPM Insiders; the home page shows JPM, COST, NVDA in that order with those tabs. Remove and Clear all both work and survive a reload. The dropdown opens on focus and gives way to results on typing.
- In a private window the home page renders with no Recently viewed section and no console errors.
- A home page visit with eight recent companies costs zero Twelve Data and zero SEC requests.

## Stage C. The visual refresh

Build the look into `app/research-file.css` and the components, keeping existing class names where possible so all six tabs move together.

Tokens (Style board). Add these to `app/globals.css` in all three places the theme is set (the light root, `[data-theme="dark"]` and the `prefers-color-scheme` block), so older pages pick them up too:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface` | #fffdf8 | #131d2a | Panels, tables, search |
| `--surface-2` | #efe8d9 | #1a2635 | Row hover, notes |
| `--ink-2` | #2f3e55 | #c3ccd8 | Secondary text, bars |
| `--rule-2` | #cbc1ab | #34465d | Control borders, stat rules |
| `--gold-ink` | #7d5c00 | #e2bb5c | Gold text and marks |
| `--gold-wash` | rgba(166,124,0,.10) | rgba(212,168,67,.13) | Latest table column |
| `--pos-wash` | rgba(30,86,49,.09) | rgba(110,191,127,.12) | Rise pill |
| `--neg-wash` | rgba(139,26,26,.08) | rgba(229,138,138,.12) | Fall pill |

The canvas files use their own names for the existing tokens: `--ink` is the site's `--navy`, `--bg` is `--cream`, `--neg` is `--accent` and `--pos` is `--green`. Keep the site's names. Where a canvas value differs from the site's current one (`--rule` is #e3dbcb on the canvas against #d9d2c0 today; #223041 against #243244 in dark), use the canvas value.

Change `--muted` to #56657a in light (from #5c6b7f) and #93a0b2 in dark (from #8a96a8), so 11px labels pass 4.5:1. Change dark `--accent` (falls) to #e58a8a. `--gold` is for fills only; gold text uses `--gold-ink`. Fix `.rf-mark` and `.rf-insider-plan`, which use `--gold` for text today.

Type:
- Load Inter with its optical-size axis: `family=Inter:opsz,wght@14..32,400..700` in `app/layout.tsx`, and set `font-optical-sizing: auto`. Big headlines then use Inter's display cut on their own.
- Research pages: body 16px at line-height 1.6 (from 14 and 15). Notes and sources 14px. Labels Plex Mono 11.5px, letter-spacing 0.1em.
- Company name 60px (38px at 390px). Price 40px. Home headline 68px. Section titles 26px (30px on home). Stat values 30px. "What stands out" figures 48px. The "In its own words" quote 26px at line-height 1.45, under a large gold opening quote mark. Figures use tabular lining numerals everywhere.
- Paragraphs stop at about 68 characters.

Layout and components:
- Masthead and nav (every board). Masthead padding drops to 9px. Nav: logo left; then a compact company search (a compact variant of `CompanySearch`) on research pages, the links, the theme toggle and Sign in. Every nav control at least 44px tall. At 390px: the logo, a search button and a menu button, with the links in the menu.
- Company header (Main board). Kicker line; name with the ticker in a small outlined tag; price with the day's change in a tinted pill that carries an arrow (▲ or ▼), so a rise or fall never relies on colour alone. On the right, the 52-week bar at 4px with a gold dot for today ringed in the page colour, and under it a "Next earnings" row from the existing `nextEarnings`.
- Tabs: 52px tall, 16px text, gold underline on the open tab, sideways scroll with no visible scrollbar on a phone.
- Sections: each opens with the kicker (a short gold dash before the mono label) and a real `h2`. 72px between sections on desktop, 44px on a phone. Hairlines replace boxes; no box sits inside another.
- Overview. "In its own words" gets the quote treatment. "What stands out" becomes three columns, each a large figure over its sentence with an ink rule above. Get the figure from the rule itself: add a `figure` field to each rule's output in `lib/research/standsOut.ts` (the multiple, the margin, the amount), with tests, rather than parsing the sentence. A fact with no natural figure shows its sentence alone. Key stats become an open grid with hairlines.
- Price chart (Main and Phone boards). Caption states the move at 22px, signed and coloured. The ranges become one segmented control, 44px tall, a 4 by 2 grid on a phone. Gridlines at high, middle and low with labels on the right; a light fill under the line; today's point an ink dot with a gold ring; earnings dots as now; the legend under a hairline.
- Financials (Financials board). Chips and the Annual/Quarterly switch on one row. Bars in `--ink-2` with the latest in gold, values above, growth under the years. Table at 15px with more padding, mono column headers, sections in mono caps under a heavier rule, growth and margin rows tucked under their line in smaller grey, the latest column on the gold wash, row highlight on hover, line names fixed while the figures scroll sideways.
- Valuation, Earnings, Insiders and Filings aren't drawn on the canvas. Give them the same system: kicker and heading per section, hairlines over boxes, the same panel, table, chip and segmented-control styles, gold only for the latest or current figure. Keep the outlook hatch as it is.
- Try-again and not-available messages use the `.rf-note` style on the Style board: tinted, with an info icon, no border.
- Home (Home board). Taller hero with the 62px search box and a solid "Open file" button; the Recently viewed section; example companies as an open grid with ink rules; "What's in a file" as a numbered list; Screener and Compare as dashed "Coming" cards; "How it works" as three short columns.

Done means:
- `npx tsc --noEmit`, `npm test` and `npm run build` clean; lint adds nothing new.
- Screenshots of every tab for NVDA, and of the home page with and without recent companies, at 1280px and 390px, light and dark, set beside the matching boards. Report anything that couldn't match and why.
- No sideways page scroll at 390px anywhere. Wide tables scroll inside their own box.
- Every text colour checked against its background in both themes: 4.5:1 for body and labels, 3:1 for text 24px and up. List any that fail.
- Tab reaches every control in order, with a visible gold focus ring.
- The phase nine banned-words scan, rerun on every page.
- Twelve Data calls for a full click-through of one company: no more than before.

## Before calling any stage done

As in phase nine: `tsc`, tests and build clean; a real `next start` checked with curl for routing; an incognito check signed out; light and dark; 390px. Then a short plain-language recap in `docs/phase-ten-stage-X-recap.md`: what a student now sees, what deviated, and what this brief got wrong. Push the branch after each stage so Eli can click through the preview before the next one starts.
