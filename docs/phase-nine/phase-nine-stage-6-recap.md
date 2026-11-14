# Phase nine, Stage 6 recap: Insiders

Written 2 November 2026. Branch `feat/research-site`. Not on the live site until Eli signs off. Migration `0023_insider_trades.sql` was pasted on 2 November.

## What a student now sees

An Insiders tab after Earnings, at `/research/{ticker}/insiders`:

- **A summary of the past 12 months** in plain sentences. NVIDIA, for example: "Over the past 12 months, insiders sold $1.88 billion of shares in 187 sales by 11 people. None bought shares on the open market. 18% of the sales by value were made under preset trading plans (Rule 10b5-1), set up in advance." Three figures sit under it: bought, sold, and the share of sales made on preset plans.
- **A table of trades** from the last two years: date, insider and role, what they did, shares, price, value, shares owned afterwards, and a link to the filing. A trade made under a preset plan is marked "On a preset plan".
- **Two views.** Purchases and sales on the open market by default. "All transactions" adds grants, exercises and vesting, shares withheld for tax, gifts and the rest, each named plainly.

## Verified

- **The Form 4 reader:** 9 tests on seven real filings saved from EDGAR, each checked against the filing by hand. They cover:
  - a sale on a plan (NVIDIA, 2026)
  - an open-market purchase by a director who is also the CEO (Culp)
  - option exercises with tax withholding (Culp)
  - vesting, tax and plan sales in one filing (Apple)
  - a 2021 filing from before the plan checkbox existed, where only footnotes mark the plan (NVIDIA)
  - a gift, and a filing with no trades at all (JPMorgan)
- **The summary and wording:** 11 tests, including amendments counted once and identical lots within one filing kept.
- **Real companies, after the background reads finished:**

  | Company | Past 12 months |
  |---|---|
  | NVIDIA | $1.88B sold, 18% on plans |
  | Apple | $209M sold, 58% on plans |
  | JPMorgan | $126M sold, all on plans |
  | Culp | $169K bought in 14 purchases by 5 people, nothing sold |
- **NVIDIA's 18% was checked against the filings.** Director Mark Stevens sold about $1.5 billion with the plan box unticked and no mention of a plan; every executive's sales were on plans.
- **First visit:** 4 to 6 seconds while the newest 10 filings are read. The rest are read after the page is sent (NVIDIA: 150 in the background), and later visits read only what's new.
- **Banned words and verdicts.** Searched as whole words on five Insiders pages, along with "bullish", "bearish" and "dumping". There were no matches. Filers' own security titles such as "Employee Stock Option (Right to Buy)" are never shown; the page names each transaction in its own words.
- **Addresses.** `/research/NVDA/insiders` answers 308; SPY and an unknown ticker give a 404.
- **Tests:** 290 pass. `tsc` and `next build` are clean, and lint adds nothing new.
- **Screenshots** at 1280px and 390px, in light and dark mode. Nothing is wider than the screen, and the browser reported no errors.
- **Twelve Data:** this tab makes no requests.

## How it reads the SEC

- **One small XML file per Form 4,** found through the company's submissions file, at about seven a second under the SEC's limit. NVIDIA filed 80 in the past year and JPMorgan 133, too many to read while a visitor waits. So:
  - a first visit reads the newest 10 before the page is sent and up to 150 more after;
  - each filing is stored once and never downloaded again;
  - the daily cron reads new filings for every company whose tab has been opened, within 20 of its 60 seconds, before its existing alert checks.
- **A failed download records nothing,** so the filing is tried again later. A filing that can't be read at all is recorded as such, so it isn't retried forever.

## What deviated from the brief, or it didn't know

- **The plan checkbox is one per filing, not one per trade.** Apple ticks it on filings that also hold vesting and tax lines, and footnotes only the sales. So a trade's own footnote decides first; the box counts only when nothing in the filing is footnoted. Before April 2023 there was no box, and footnotes are the only record.
- **The box is written "1", "true" or "0"** depending on the filing agent.
- **Amendments repeat lines.** A Form 4/A often restates the original word for word, so an exact repeat from another filing is counted once, keeping the later one.
- **JPMorgan's recent-filings list reaches back only to November 2025,** because it files thousands of prospectus supplements. Its page says the year's totals can't include trades before that date, and the table is headed with the real start date.
- **Values are as filed:** shares times the price reported, often an average across a day's trades. A grant or a vesting has no price and shows no value.

## Still to confirm

- **On the Vercel preview,** after this push builds with `SEC_CONTACT_EMAIL` set.
- **Intraday delay**, carried over from Stage 3.
