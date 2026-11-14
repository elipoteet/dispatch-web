# Phase eleven, Stage B: the nightly job, the backfill, and the research-page fixes

5 to 6 November 2026. Branch `feat/screener`, apart from the units fix, which is live on master. There is still no screener page; that's Stage C. Visitors to the live site see one change from this stage: Tigo Energy's revenue.

## In short

- **The screener's numbers are built and published nightly.** `screener_metrics` holds a row for every exchange-listed U.S. filer with an annual report from the last 18 months: **4,651 companies**.
  - By exchange: 2,851 Nasdaq, 1,776 NYSE, 15 Cboe, 9 Texas Stock Exchange.
  - Industry is known for 4,601 and headquarters for 4,649.
- **A normal nightly run takes about a minute (58.5 seconds)** against Vercel's 5-minute limit. 51 seconds of that is downloading from the SEC.
- **A run cut off partway never shows a half-updated screener.** Each run writes into a separate staging table and publishes the whole set in one step, which either happens completely or not at all. I tested every way a run can stop, for real:
  - killed mid-run on this computer;
  - stopped by Vercel at its 5-minute limit;
  - cut off during the swap itself.

  The published screener stayed byte-for-byte as it was, or changed in one piece.
- **Every figure checked against its 10-K matches, with one caveat.** Ten companies, 31 figures exact to the dollar (30 found by the checking script, 1 more by hand where Caterpillar uses its own tag).
  - **By design:** banks and REITs are n/a by rule, and FedEx's year-end cash is the restated figure.
  - **The caveat:** Chevron exposed that the site's "debt" has always meant long-term debt, leaving out short-term borrowings. Your call; see Done-means.
- **A second run changes nothing:** all 4,651 rows were identical in every field apart from the update time.
- **Two new migrations, both already pasted by you:** 0027 (the staging table and the publish function) and 0028 (a fix to that function, found by the first real publish).
- **Done separately:** the units-error fix (Tigo Energy), live on master; and the removal of your marketing research from the branch's history.

## What changed on the live site today: Tigo Energy and units errors

- **Tigo Energy's page now shows the right revenue.** Its 10-K tags 2025 revenue twice, once correctly as $103.5 million and once a thousand times too large, and its page had taken the wrong one.
  - **Now:** the research file checks for that pattern (the same figure tagged in two units) and settles it from the filing's own arithmetic. Revenue must equal gross profit plus cost of revenue: $44.4M + $59.2M = $103.5M. Net income is checked against earnings per share times shares. If nothing settles it, the figure is left blank, never guessed.
  - **Live check:** dispatchresearch.com/research/tygo shows "Revenue FY25 $103.5M", and the financials table shows 103.5 (2025) and 54.0 (2024) in $ millions.
- **Stored companies whose numbers changed: none.** I ran every one of the 160 stored companies through the old and new rules on fresh filings and compared every figure.
  - The first version of the check was too loose: it would have blanked CarGurus' 2021 net income and Match Group's 2017 revenue, both real.
  - I tightened it to "the same figure, almost exactly a thousand or a million times apart". After that, none of the 160 changed.
  - Tigo wasn't stored yet; its first visit after the fix stored the right figures.
- **Checks:** all tests pass (396 on master, none of the existing ones changed), including the live twenty-company check. The build is clean and lint is at its baseline.
- Shipped to master as two commits (335f79a, f3dce97).
- One thing seen while checking: Tigo's very first page load after the fix said "The SEC's figures for this company couldn't be loaded just now". It loaded correctly a moment later. A company's first-ever load has always downloaded its whole filing history, and this one took long enough to hit that message. That's not new; if it matters, it's a separate fix.

## Debt: two more tags, on the research pages and in the screener

- **Added:** two tags that mean total debt including the part due within a year. GM files its whole debt ($131.57 billion: $16.60B automotive plus $114.98B GM Financial) only under one of them.
- **Screener:** **17 companies' net cash goes from n/a to a figure**, and none goes the other way:
  - The 17: GM, APD, CNH, DKS, HTZ, LKQ, IEP, RHP, PKOH, CRMT, CCS, UPBD, CVCO, BRT, LADR, SMA and TPCS.
  - 15 also gain debt-to-equity.
- **Research pages:** 18 of the 160 stored companies get different debt figures. They are Alphabet, HPE, Dollar General, JPMorgan, PNC, Oracle, Unifi, Coca-Cola, Micron, Chevron, U.S. Bancorp, Viasat, Home Depot, HP, Super Micro, Kodak, Coca-Cola Consolidated and QuickLogic.
  - Mostly, quarters that showed only long-term debt now show the total including the part due within a year.
  - Example: Alphabet's 2024 third quarter goes from $12.3B to $14.8B.
  - Only debt changes, which also moves enterprise value on the Valuation tab. Nothing changes on the live site until this branch is merged.
- **Spot checks against the 10-Ks:**
  - **GM: matches.** Total debt $131.57B and cash $20.95B, so net cash is -$110.6B.
  - **Ford: still n/a, correctly.** Its 10-K gives every debt figure split between Ford and Ford Credit, with no company-wide total, and the SEC's data services leave split figures out.
  - **Deere: still n/a, correctly.** It tags short-term debt ($13.80B) in a standard tag but long-term debt ($43.54B) under its own custom element. The true total, $57.3B, isn't available from the SEC's data services, and showing only the short-term part would understate it.
- **Considered and left out:** tags for one slice of debt (convertible notes, notes payable). Treating a slice as the total would understate debt, the kind of wrong number the site avoids.

### Why Ford's and Deere's net cash stays n/a, and whether that's fixable

The screener reads the SEC's two data services: the frames, and each company's facts file. Both carry only figures that are (a) standard tags and (b) for the whole company. Ford and Deere each break one of those rules for their debt. Read straight from their 10-Ks (year-ends 31 December 2025 and 2 November 2025):

**Ford files no company-wide debt figure at all.** Every debt figure in its 10-K is split by business:

| Tag | Ford excluding Ford Credit | Ford Credit |
|---|---|---|
| Debt and finance leases, total (`DebtAndCapitalLeaseObligations`) | $21.92B | $141.42B |
| Due within a year (`DebtCurrent`) | $5.55B | $51.75B |
| Due after a year (`LongTermDebtAndCapitalLeaseObligations`) | $16.37B | $89.67B |

Ford's total debt is therefore $163.34B, but only as two parts the SEC's data services leave out.

- **Fixable later?** Yes, but only by reading each 10-K's own tagged figures (inline XBRL) instead of the SEC's data services, and adding the parts.
- **The risk is double-counting.** Ford also tags $52.05B of debt held in special-purpose vehicles under a different split, and that $52.05B is already inside the $163B.
- **What a safe rule needs:** add only the parts of one split that together make up the whole company (Ford and Ford Credit here), and check the sum against something the filing states. A rule that "adds whatever parts are tagged" would have reported $215B for Ford.

**Deere files half of its debt under its own custom tag.**
- Short-term borrowings: $13.80B, as the standard `DebtCurrent`.
- Long-term borrowings: $43.54B, only as `de:LongTermDebtAndFinanceLeasesNoncurrent`, a tag Deere invented. Companies may add their own tags, and the SEC's data services carry only standard ones.
- Its total is $57.34B. The screener could see only the $13.80B, and showing that as Deere's debt would make it look $43.5 billion less indebted than it is.
- **Fixable later?** Yes, the same way as Ford: read the 10-K itself.
  - **Option 1:** a list of known custom tags per company (Deere's long-term-debt tag). That's safe, but must be rechecked when a company changes tags.
  - **Option 2:** use the standard long-term debt figure Deere tags in its fair-value note ($43.47B "carrying amount", without finance leases: $57.27B in total, 0.1% low). That figure only appears in a split by measurement basis, so the same split-reading is needed.

**How many companies are like this:** of the 1,634 exchange-listed companies that file cash but no total-debt figure, 24 file short-term debt and 38 file current maturities of long-term debt in standard tags, some both: between 38 and 62 companies with the Ford/Deere pattern of part of their debt visible and no total. Ford itself isn't among them, because even its parts are split. Most of the rest have no debt.

**My recommendation:** leave them n/a for now. A later "read the balance sheet from the 10-K" step for those few dozen companies is worth doing if you want them; it's a contained piece of work, but it needs the checks above to stay free of wrong numbers.
- **Most remaining n/a's are genuinely debt-free companies** (Intuitive Surgical, Lululemon, Ulta). They file no debt line, and under the rule that a missing number is never a zero they show n/a.
- `NORMALIZER_VERSION` is now 11 on this branch (10 on master).

## Your marketing research

- `docs/strategy/marketing-research.md` was removed from the branch's history. It never appears in any commit on `feat/screener`; GitHub's API confirms no commit on the branch touches it and the file returns "not found".
  - The line in CLAUDE.md that pointed to it was removed from history too, and so was the mention in the docs-move commit message.
  - The branch was force-pushed (twice: once for the removal, once after moving it onto the new master).
- **Caveat:** the old commit can still be opened on GitHub by anyone who has its exact 40-character id. It's on no branch, and GitHub removes such commits only in its own clean-up; GitHub Support can purge it sooner if you want. The file was public for about three hours before the rewrite.
- **Your copy is safe** at `C:\Users\elipo\Documents\dispatch-private\marketing-research.md`, and also in its usual place, now untracked and ignored locally so it can't be committed again.

## The nightly job

- `/api/cron/screener` runs every day at 09:00 UTC (about 4 or 5 a.m. Eastern), a second cron beside the existing alerts job. It starts once this branch is merged.
- **What one run does:**
  1. downloads all 341 SEC bulk files (70 MB);
  2. builds every exchange-listed company's years and figures;
  3. looks up industry and headquarters for any company new to the list;
  4. takes net income from the 10-K where the bulk files hold the proxy statement's figure (1,726 companies; the answers are remembered, so only new filings need a request);
  5. writes every row to a staging table;
  6. publishes them all at once;
  7. logs the run.
- **The first-time backlog took seven runs** (one on this computer, six on the preview). Company profiles were complete after the sixth (833 to 978 a run), and net income lookups (about 1,700) after the seventh. Each run stops at its time budget and the next one carries on, so on a fresh start the screener fills in over the first week.

### How long a normal run takes

Timed on the preview (the same Vercel setup as the live site), once the backlog was done:

| Step | Time |
|---|---|
| Download all 341 SEC files | 51 seconds |
| Build every company, compute every measure, stage and publish 4,651 rows | 7 seconds |
| **Whole run** | **58.5 seconds** |
| Vercel's limit (Hobby plan, Fluid Compute on) | 300 seconds |

That's about a fifth of the limit, leaving room for:
- **Busy filing seasons.** In February and March many 10-Ks arrive, so more companies need a fresh net income lookup (about 0.2 seconds each). 500 in one night would add under two minutes.
- **A slow SEC.** The download is the one step without its own time limit. If the SEC were about five times slower than usual, a run would hit the 5-minute limit and be cut off. The previous night's numbers would keep showing (tested below), and the next night tries again.

How a cut-off run looks in the log: `screener_runs` has a start time and no finish time.

### A run cut off partway: tested, not assumed

The job never writes to the table the screener reads until every row is ready. It writes into `screener_metrics_next`, then calls `screener_publish`, which replaces the published set in one database transaction. Anyone reading sees the old set until the instant it commits, then the new one.

Each test compared a fingerprint (SHA-256) of every row and every column of the published screener, read with the public key the site uses:

| Test | What happened | Published screener |
|---|---|---|
| **A. Killed while writing**, on this computer | I force-killed the server process 70 seconds into a run, when the staging table held 500 of 4,651 rows (2,000 once writes already in flight landed). | Byte-for-byte unchanged (same fingerprint before and after) |
| **C. Cut off by Vercel at its 5-minute limit**, on the preview | A test-only pause held the run after staging all 4,651 rows. Vercel stopped it at 300.4 seconds ("FUNCTION_INVOCATION_TIMEOUT"). | Byte-for-byte unchanged; the staged rows were never published |
| **B1. Cut off just before the swap** | The call to publish was aborted after 40 ms. 47 reads of the live table during the test. | Unchanged; every read saw the whole old set |
| **B2. Cut off during the swap** | Aborted after 300 ms, by which point the database had begun; it finished the swap on its own. 49 reads during the test. | Changed in one piece to the whole new set; no read ever saw a mixture, an empty table or a partial count |
| **A normal run with a reader hammering the table** | Four connections counted the published rows continuously through the whole run: 4,912 reads. | Every read saw exactly 4,651 rows, before, during and after publishing |

- **An unplanned fifth case came first.** The very first real publish failed: Supabase refuses a delete without a condition, even inside a function. Because the swap is one transaction, it published nothing, and the screener kept the previous run's complete set; I checked the fingerprint. Migration 0028 fixed the function.
- **Two more guards:**
  - The job only publishes after a run that downloaded every file and staged at least nine in ten of the rows currently showing.
  - The database function checks that count again itself, so a run that lost most of its rows can never empty the screener.
- The test-only pause has been removed from the code.

### Done-means

**Row count:** 4,651, every exchange-listed U.S. filer with an annual report from the last 18 months. OTC companies are left out, as you decided.

**How many have each measure, and why the rest are n/a** (from the database after the final run):

| Measure | Has a value | n/a | Mostly because |
|---|---|---|---|
| Revenue | 3,879 | 772 | no revenue line: banks (they report interest income), drug developers with no sales, SPACs |
| Revenue growth, 1 year | 3,749 | 902 | no revenue; 135 have only one year so far |
| Revenue growth, 3 years | 3,405 | 1,246 | not enough years (1,065) |
| Gross margin | 2,392 | 2,259 | banks, insurers and REITs by rule (960); no cost-of-sales line (1,292) |
| Operating margin | 3,290 | 1,361 | no operating income line |
| Net margin | 3,803 | 848 | no revenue; only 2 have net income their filing contradicts |
| Free cash flow margin | 2,862 | 1,789 | banks, insurers, REITs by rule (960); no capex line (788) |
| Net cash or debt | 2,169 | 2,482 | banks and insurers by rule (785); no debt figure filed (1,697, mostly debt-free) |
| Share count change | 4,144 | 507 | not filed (368); first year (135); suspected split (3) |
| Return on equity | 4,089 | 562 | zero or negative equity (462) |
| Return on assets | 4,620 | 31 | |
| Net income growth | 2,463 | 2,188 | last year was a loss (2,042) |
| EPS growth | 2,247 | 2,404 | last year was a loss (1,848) |
| R&D share of revenue | 1,832 | 2,819 | no R&D line (most non-tech companies) |
| Capex share of revenue | 2,943 | 1,708 | not filed; banks and insurers by rule |
| SG&A share of revenue | 2,409 | 2,242 | no combined SG&A line |
| Pays a dividend (yes) | 1,746 yes or no | 2,905 unknown | no dividend line filed; the page will offer only "Yes" and "Either", as you decided |
| Dividends / free cash flow | 851 | 3,800 | no dividends; no free cash flow figure |
| Buybacks / free cash flow | 1,218 | 3,433 | same |
| Debt to equity | 1,947 | 2,704 | no debt figure; banks by rule; negative equity |
| Current ratio | 3,784 | 867 | banks and REITs file no current assets |
| Interest coverage | 1,220 | 3,431 | the SEC bulk-file gap for the newer interest tag (Stage A report); banks by rule |
| Revenue growth, 5 / 10 years | 2,966 / 1,903 | 1,685 / 2,748 | not enough years |
| Years of revenue growth | 3,816 | 835 | |

**Ten companies against their own 10-Ks.** Revenue, net income, free cash flow (10-K operating cash flow less capex) and net cash (10-K cash less debt), read straight from each company's 10-K:

| Company | Kind | Result |
|---|---|---|
| NVIDIA | large, tech, January year-end | all 4 exact; net income taken from the 10-K (the bulk file held the proxy's) |
| JPMorgan | bank | revenue and net income exact (net income from the 10-K: $57.048B, not the proxy's rounded $57.000B); free cash flow and net cash n/a by rule |
| Realty Income | REIT | revenue and net income exact; free cash flow n/a by rule |
| Coca-Cola | large, staples | all 4 exact |
| Caterpillar | large, industrial | all 4 exact; net income checked by hand, because its 10-K files it as "profit attributable to common" ($8.884B) rather than the plain tag |
| Chevron | large, energy | revenue, net income, free cash flow exact. Net cash -$33.49B matches its research page: worked-out cash ($7.285B less $0.992B restricted = $6.293B) less $39.78B of long-term debt. But see the caveat below: Chevron also has $10.92B of short-term debt that neither counts |
| Arista | mid, tech | all 3 that apply exact; net income $3.5114B is the 10-K's, where the bulk file held $3,511 from the proxy |
| FedEx | large, May year-end | revenue, net income, free cash flow exact; net cash differs from the 10-K by $251M because FedEx restated that year-end cash in its next quarterly report ($13.06B, from $13.31B), and the screener, like the research file, uses the latest restatement |
| GM | large, autos, new debt tag | all 4 exact, including debt of $131.57B |
| Culp | small, May year-end | revenue and free cash flow exact; net income and net cash n/a (not filed in the standard tags) |

**A caveat the Chevron check exposed: "debt" means long-term debt.**
- **The definition:** since phase nine, the site's debt figure (for net cash, debt-to-equity, and enterprise value on the Valuation tab) is long-term debt, including the part due within a year where a company files it that way.
- **What it leaves out:** it has never included short-term borrowings such as commercial paper.
- **Chevron, for example:**
  - Its 10-K shows $39.78B of long-term debt (tagged as excluding the current part) and $10.92B of short-term debt.
  - Its next quarterly report re-tagged the same $39.78B as "including current maturities", which is the figure the screener uses.
  - Counting the short-term debt would make its net cash about -$44.4B instead of -$33.49B.
- **Which companies it affects:** any company with meaningful commercial paper or bank borrowings: oil majors, consumer staples, industrials.
- **Why it isn't a one-line fix:** adding short-term debt needs care, because some long-term debt figures already include the current part, and adding "debt due within a year" on top would double-count it.
- **Decision for you:** keep debt as long-term debt and say so on the page, or have me work out a total-debt figure that includes short-term borrowings without double-counting, for both the research pages and the screener.

**A second run changes nothing it shouldn't.** Two consecutive runs of the final code: same 4,651 companies, and every field of every row identical apart from the update time. The second run fetched nothing new from the SEC beyond the bulk files.

## Deviations from the brief, and what it got wrong

- **Publishing in one step needed two migrations the brief didn't plan:** 0027 (a staging table and a publish function) and 0028 (a fix to the function). Both are new objects only, nothing existing altered, and you've pasted both.
- **OTC companies are left out and the page will say "about 4,700"**, per your answer; the brief said "about 5,600".
- **Net income comes from the 10-K, not the bulk file, for 1,726 companies.** The brief assumed the bulk files hold annual-report figures; for net income they often hold the proxy statement's restatement.
- **The brief expected the backlog to load "once".** It does, but spread over the first several runs, each stopping at its time budget.
- **Not done, worth doing later:** company profiles (industry, headquarters) are fetched once and never re-checked. A company that changes industry code or moves its headquarters keeps the old one. A small nightly refresh of the oldest few hundred would fix that, at about a minute of a run's spare time.
- **A cosmetic leftover in the git history:** the probe commits from Stage A ("Temporary: a probe…" and its removal) remain in the branch. They're harmless.
