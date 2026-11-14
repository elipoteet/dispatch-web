# Phase eleven: the screener, live

14 November 2026. `feat/screener` and `fix/units-cover-page` are merged into `master` (be5e513 and 3228e5c) and deployed, with the About page rewrite (17597f6) right behind them. The screener is on the live site at dispatchresearch.com/screener.

The stage recaps in this folder (A to D, then the review recap) hold the detail. This is the summary: what a visitor sees, and what is still open.

## What a visitor now sees

**Getting there.** "Screener" in the top navigation, and the "Open: Screener" card under Tools on the home page.

**The opening page** shows thirteen starting screens, grouped under the question each answers:
- Quality: High return on capital; Revenue up ten years in a row; Strong free cash flow.
- Growth: Fast growth, already profitable; Rule of 40; Margins widening; Fast growth, still losing money.
- Shareholder returns: Buying back shares; Dividends covered by cash flow.
- Balance sheet: More cash than debt; Profits without the cash.
- Dilution: Issuing shares fast.
- Place: Based in New England.

Each card says in plain words what the screen finds, with its filters written out. "Open the filters" starts a screen of the visitor's own, at revenue of $100 million or more.

**A screen's page** restates the screen in one sentence, gives one line on why investors look at it, and lists the companies that match, sorted by the screen's own measure:
- The table shows the screen's measure first, then its other filters, then revenue, with sector and the year each company's figures come from. Column headings sort.
- Every company links to its research file, and "What the price assumes" opens its Valuation tab.
- Each screen has a count ("107 companies"), and lists show 50 at a time.
- On a phone the table becomes a two-line list.

**The filter panel** has the main eleven measures, sector, and under "More filters" eighteen more, plus a dividend switch and headquarters by state. Every measure has a one-line definition and where the middle company sits ("Half of companies: above 5.5%"). The whole screen lives in the link, so a filtered page can be shared.

**The figures** come from each company's latest annual report, through the SEC's data, refreshed nightly at 09:00 UTC by the cron on Vercel. About 4,580 companies: those listed on a U.S. exchange, reporting under U.S. accounting rules, with an annual report in the last 18 months; commodity and crypto funds are left out. A note at the foot of every screen explains what's calculated, what n/a means and the coverage.

**Rules a reader may notice** (all in the review recap):
- Return on invested capital is n/a for banks, insurers, REITs and companies holding customers' money, where invested capital is under a tenth of total assets, and above 100% where it's under a quarter. Where a company files no operating income line it starts from pretax income plus interest expense, marked †.
- Free cash flow margin and net cash are n/a for banks, insurers, REITs and 34 payments, payroll and fintech companies holding customers' money.
- Revenue growth is n/a from a starting year under $10 million.
- Sectors follow the SEC's industry codes, corrected by hand for 95 companies (Visa and Mastercard are Financials, Alphabet and Meta Communication).

## What also changed on the live site

- **The About page** was rewritten with Eli's copy. It had still described the memo, technicals and sentiment, and the Time Machine; it now describes the six tabs, the screener, where the numbers come from, and what the site is not. Eli asked for this before the screener merge; it arrived after that merge had been pushed, so it went live a few minutes later on its own merge. The rendered page contains none of "memo", "Time Machine", "technical", "sentiment" or "scorecard"; "rating" appears only in the sentence saying there is none (and the site footer's "No Ratings"). The home page's six-tab section, three points and Screener card already matched the site and weren't changed.
- **A standing rule** in CLAUDE.md and the phase eleven brief: before any merge to master, the About page is read against what the site does and updated in the same branch.

- **Research file, normaliser:** a filing with every dollar figure in the wrong units is set aside (Universe Pharmaceuticals' pattern). It changes none of the 163 stored companies; `NORMALIZER_VERSION` is now 11, from the screener branch's two new total-debt tags, so each stored company refreshes once on its next visit.
- **Shared SEC code:** the units checks (`lib/sec/units.ts`), the balance sheet page reader (`lib/sec/statementPage.ts`) and the frames client are new or extended. Nothing in the research file's own tag lists changed except the debt tags above.

## Left open

**Data rules Eli may want to revisit**
- **No debt line (about 1,500 companies):** net cash and ROIC stay n/a. Most are debt-free (Ulta); a few carry debt under their own labels (Ford). The balance sheet page reader could fill some of these, as it does for Caterpillar's current debt, but it hasn't been pointed at them.
- **Interest expense** is missing for about 250 companies that file no operating income line and no interest line the SEC's data carries (GE, Johnson Controls, Nike, Deere), so their ROIC is n/a.
- **Companies the classification check didn't settle** stay where SIC puts them: Leidos, CACI, SAIC, Parsons, Roper, Teledyne, Veralto, Toast, Boise Cascade, Gold.com, Arko and Murphy USA. The sector list covers companies over $5 billion of revenue, plus InterDigital and Wise; below that line SIC decides.
- **Customer money** is judged from standard tags and restricted cash in five industries, with Wise and Applied Digital decided by hand. A payments company filing customer funds only under its own label would be missed.
- **IFRS filers** (foreign companies filing 20-Fs) are outside both the screener and the research file.

**Product**
- **Compare** (two companies side by side) is still the "Coming" card on the home page.
- The screener has no saved screens, alerts or export; the link is the saved state.
- Medians are across all companies; there is no per-sector median.

**Operations**
- The nightly job's first run after a rule change reads every balance sheet page and interest figure (about 170 s); a normal night is about 100 s against a 280 s budget. If the SEC's frames fail to download, the job keeps last night's table and says so in `screener_runs`.
- The job's first production run is the 09:00 UTC cron after this deploy; until then the table holds the run of 9 November (4,581 companies).
- `migrations/`, `playwright-report/` and `test-results/` at the repo root are untracked strays, left alone.

## Live checks, 14 November 2026

In a fresh browser context on www.dispatchresearch.com (nothing stored, as in an incognito window):
- The home page answers 200. "Screener" in the top navigation lands on /screener; the Screener card under Tools does too.
- /screener shows thirteen starting screens with live counts: 96, 130, 116, 136, 113, 125, 128, 88, 130, 141, 77, 130, 178.
- High return on capital: 96 companies, AppLovin first at 114.1%, 50 rows shown, eight † marks on the page.
- More cash than debt: 141 companies. NVIDIA's row shows $54.1B of net cash and opens /research/nvda.
- /about answers 200 with the new copy.
- Both production deploys succeeded (be5e513 at 15:55 UTC, 3228e5c at 15:58), then the About page's.

**Cron and secret.** The screener cron is in `vercel.json` on master (`/api/cron/screener`, 09:00 UTC), so Vercel registers it with this deploy; the Vercel CLI isn't signed in on this machine, so the dashboard wasn't read directly. `CRON_SECRET` is set on production: the alerts cron, which checks the same secret, ran at 21:47 UTC on 13 November (its `ticker_snapshot` writes), and the screener route on production answers 401 without it. The screener's first production run is at 09:00 UTC on 15 November; until then the table holds the run of 9 November.
