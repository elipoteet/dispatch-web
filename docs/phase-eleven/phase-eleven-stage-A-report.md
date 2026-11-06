# Phase eleven, Stage A: the numbers, and the measurement report

5 November 2026. Branch `feat/screener`. Nothing here is on the live site. Eli pasted migration 0026 the same day. All four tables exist and are empty, checked with the public key; the screener's table has every column the file defines. Nothing has been written to them.

## In short

- **The screener's numbers are right.** For 23 large companies I compared every input with the research file's own figures: 294 inputs, 291 identical to the dollar. The other 3 come from a quirk in the SEC's bulk files, and I've built and tested the fix (below). I also checked 85 inputs straight against five companies' actual 10-Ks: NVIDIA, Apple, JPMorgan, Walmart and McDonald's. Every one matches except that same quirk.
- **NVIDIA's fiscal 2026 matches its 10-K exactly.**
  - Revenue $215.9B, net income $120.1B, operating cash flow $102.7B, capex $6.0B, free cash flow $96.7B.
  - So: gross margin 71.1%, operating margin 60.4%, net margin 55.6%, free cash flow margin 44.8%.
- **The screener would list 5,363 companies today, not about 5,600.** 4,651 trade on an exchange, 694 over the counter, and 18 have no exchange listed. Whether over-the-counter companies stay in is your call (question 1).
- **The nightly download is small.** Re-downloading everything takes under two minutes. That fits comfortably in one nightly run on your current free Vercel plan, so "Updated nightly" stays true.
- **One part is bigger: the first-time load of each company's industry and headquarters**, about 15 minutes in total. That gets spread over the first few nights.

## What I recommend for the nightly job

**A second Vercel cron job.** Option 1 in the brief, but simpler than it sounded.

Each night it would:
1. download all 327 bulk files again (about 70 MB, under two minutes);
2. recalculate every company's figures from scratch, which takes about one second;
3. look up industry and headquarters for any company that's new to the list (a handful a night);
4. fix net income for the few dozen companies affected by the proxy-statement quirk;
5. log what it did.

The first-time load (industry and headquarters for 5,363 companies, plus the net income fix for about 1,700) takes about 20 minutes. So the job does it in slices over roughly the first five nights, remembering where it stopped. The screener page isn't live until Stage C anyway.

Why this over the alternatives:
- **It fits your free plan easily.** Your plan allows up to 100 daily cron jobs, each run up to 5 minutes. The work above needs one to three minutes a night, mostly waiting on the SEC, which uses very little of the monthly allowance (4 hours of processing time, 360 GB-hours of memory).
- **No new home for the database key.** A GitHub Action would need the master database key stored in GitHub as well.
- **More reliable scheduling.** GitHub can run scheduled jobs late or skip them when busy, and it switches them off after 60 days with no activity on a public repository.
- **No re-plumbing.** The job's code would have to be repackaged to run outside the site.

**One thing to check, which only you can see:** in the Vercel dashboard, open the project, then **Settings → Functions**, and make sure **Fluid Compute** is on. It's the default for new projects. With it on, a run can last 5 minutes; with it off, only 60 seconds, which is too tight. In that case I'd recommend the GitHub Action instead.

I wanted to prove the 5-minute limit with a real run on the preview site. The preview uses a different cron password from the one on this computer, and Claude Code's safety check, rightly, wouldn't let me put a stand-in password in the public repository. If you'd like that proof before Stage B, set the same `CRON_SECRET` for Preview in Vercel and I'll run it. Otherwise the plan rests on Vercel's published limits and the timings measured here.

Also worth knowing: if the site ever used more than the free plan's monthly allowance, Vercel pauses functions for 30 days. The screener job adds very little, but it's the reason not to make it heavier than it needs to be.

## Decisions I need from you

1. **Over-the-counter companies: in or out?** 694 companies have a ticker but trade over the counter rather than on an exchange. Most are very small, and some are shells. My suggestion: exchange-listed only, which gives 4,651 companies, and the page says "about 4,700". The brief's "listed ticker" can be read either way.
2. **"Pays a dividend: No" will catch almost nobody.** Under the rule that a missing number is never a zero, a company only counts as "no" if it files a dividend figure of zero, and only 81 do. "Yes" works fine (1,725 companies). Options: show only "Yes" and "Either", or keep "No" and explain it. I'd show only "Yes" and "Either".
3. **Fix two things on the research pages too?** Both were found while checking the screener. Both need the research file's number-cleaning step to change, which re-processes stored companies once. The screener is already protected from both.
   - **Units errors in filings.** For example, Tigo Energy's 10-K tags revenue as $103.5 billion under one tag (it's $103.5 million), so Tigo's research page shows $103.5 billion today.
   - **Debt filed under unusual tags.** Net cash is n/a for 2,214 companies because no debt figure is filed under the standard tags. Some are genuinely debt-free (Intuitive Surgical, Lululemon). Others, like Ford, GM and Deere, file debt under their finance arms' own tags. Adding tags would fill some of those gaps on both the screener and the research pages.

## What a visitor would see (when the page exists)

Coverage, per measure, across the 5,363 companies:

| Measure | Has a value | Why the rest are n/a |
|---|---|---|
| Revenue | 4,390 | 968 report no revenue line: 242 banks (they report interest income), 231 drug developers with no sales yet, 110 SPACs; 5 have units errors |
| Revenue growth, 1 year | 4,163 | mostly no revenue; 156 have only one year so far |
| Revenue growth, 3 / 5 / 10 years | 3,752 / 3,232 / 2,039 | not enough years yet |
| Gross margin | 2,721 | 1,061 banks, insurers and REITs (n/a by rule); 1,549 report no cost of sales |
| Operating margin | 3,693 | 1,553 report no operating income line (banks, oil majors, some others) |
| Net margin | 4,213 | mostly no revenue; 57 have net income that the filing itself contradicts |
| Free cash flow margin | 3,086 | banks, insurers and REITs by rule; others report no capex |
| Net cash or debt | 2,280 | 869 banks and insurers by rule; 2,214 file no debt figure (see question 3) |
| Share count change | 4,706 | 5 suspected stock splits across filings; others missing a year |
| Return on equity | 4,361 | 833 have zero or negative equity (McDonald's among them) |
| Interest coverage | 1,460 | a gap in the SEC's own bulk files (below); banks by rule |
| Years of revenue growth | 4,287 | |

- **Headquarters:** 4,508 companies are in the U.S., 851 outside, and 3 have no address on file.
- **Industry:** known for all but 54 companies, sorted into eleven sectors plus "Other" (mostly SPACs).

## What I found that the brief didn't expect

- **The bulk files keep the last thing filed, and that's sometimes the proxy statement, not the 10-K.**
  - Proxy statements restate net income in a pay table, so for about 1,700 companies the bulk file's net income comes from the proxy. Usually it's the same number.
  - Sometimes it's rounded or defined differently: Tesla $3.855B in the proxy against $3.794B in the 10-K, Verizon $17.6B against $17.2B, JPMorgan $57.000B against $57.048B.
  - Sometimes it's in the wrong units: FedEx shows $4,433 where its 10-K says $4.43 billion.
  - **The fix, tested:** when net income comes from a different filing than the rest, fetch that company's small per-figure file (about 3 KB) and take the 10-K's own number. In the 23-company check this took the mismatches to zero.
  - **Meanwhile, until Stage B wires that in:** net income is checked against the 10-K's earnings per share times its share count, so FedEx, Arista, Medtronic and 57 others get the right figure. 57 companies whose filings contradict themselves show n/a, never a wrong number.
- **Some quarterly reports include a "trailing twelve months"** that the bulk files treat as a year. Amazon briefly showed a "year" ending September 2026. It's now detected, because those figures overlap a real fiscal year. Seven companies were affected, Amazon among them.
- **The location field is missing for a third of companies,** NVIDIA included. Headquarters come from each company's SEC profile instead.
- **Interest coverage has a gap that's the SEC's, not ours.** The bulk files for the newer interest-expense tag only include filings from about mid-2026. So NVIDIA, Alphabet, Amazon and others show n/a for interest coverage until their next annual report adds them (from about February 2027).
- **ExxonMobil isn't in the list for now.** It moved into a new holding company in 2026. The old registration has the annual reports but no ticker; the new one has the ticker but no annual report yet (expected February 2027).
- **AvalonBay isn't in the list:** it's missing from the SEC's own ticker file, which the research site's search uses too.
- **The brief said the normaliser takes "the first tag in the list".** It actually ranks a company's tags by how many years each covers, so a tag the company has used for a long time wins. The screener does the same, which is what keeps REITs' total revenue from being replaced by a small slice of it.
- **The brief said the existing cron "spends its full 60 seconds".** The 60 seconds is that job's own setting, not a Vercel limit.
- **Lint's pre-existing failures are 4 errors and 1 warning,** not about eight.

## Deviations from the brief

- **The six new line items have their own list,** next to the existing ones in `concepts.ts`, not mixed into them. That's what guarantees no research page changes: the full test suite and the twenty-company check pass unchanged, and `NORMALIZER_VERSION` stays at 9.
- **Fiscal year labels:** the bulk files don't say "fiscal 2026", only dates. So the screener will say "year ended 25 January 2026".
- **Measure definitions, where the brief leaves room:**
  - Share count change uses diluted weighted-average shares, as the research file does.
  - Return on equity and on assets use year-end equity and assets.
  - SG&A adds the two halves where a company reports them separately (Microsoft, Meta, Alphabet).
- **REITs:** free cash flow margin is n/a for REITs as the brief says, though the research file shows a REIT's free cash flow row.
- **Migration 0026 has four new tables, nothing else:** the screener's rows, the industry and headquarters cache, a list of files fetched, and a run log. It's now pasted, so if Stage B needs a column changed, that becomes a new migration (0027), and I'll ask before changing these tables.
- **The brief is saved at `docs/phase-eleven/phase-eleven.md`,** in the new phase-folder layout, not `docs/phase-eleven.md`.

## Measurements

All times from this computer; Vercel's network should be similar or faster.

- **Full refresh:** 327 files requested; 292 exist (some tags weren't used in some years).
  - 69.8 MB of data, roughly a fifth of that over the wire.
  - 49 seconds with four requests at once. About 1½ minutes one at a time (estimated from the nightly run below).
  - Building and calculating all 5,363 companies: about 1 second.
- **Nightly subset alone:** 129 files, 20 MB, 28.5 seconds one at a time. It isn't enough on its own, because multi-year growth needs the older years. Re-downloading everything nightly is simpler than storing history, and still fast.
- **Company profiles (industry, headquarters):** about 100 KB each, 533 MB in total.
  - Measured at 0.16 seconds each one at a time, about 15 minutes for all.
  - Four at a time, the SEC slowed down and the full set took 55 minutes, so the job should go one at a time.
- **Net income fix files:** about 3.5 KB each over the wire, 0.2 seconds each. About 1,700 needed the first time (about 5 minutes); after that, a few dozen a night.
- **Vercel free plan (published limits, checked today):**
  - 100 cron jobs per project, each once a day, run any time within the scheduled hour.
  - 5 minutes per run with Fluid Compute, 60 seconds without.
  - Monthly allowance: 4 hours of processing, 360 GB-hours of memory.

## How it was checked

- **Unit tests** cover every measure's formula and every n/a rule:
  - built-up cases for each rule;
  - real SEC data saved for 13 companies: NVIDIA, Broadcom, Apple, JPMorgan, Realty Income, UDR, McDonald's, Rivian, Walmart, Chevron, Microsoft, Johnson & Johnson and Tigo Energy.
- **The specific cases:** a bank, two REITs, negative equity, a loss-maker, January, June, September and November year-ends, and the NVIDIA and Broadcom splits. Both splits come through on one share basis: NVIDIA's share count change is -1.2%, not +900%.
- **Gate:** type-check clean, 526 tests passing, production build clean, lint at its baseline.
- **Live checks** (opt-in, so they never slow down the normal tests): `lib/screener/measure.live.test.ts` and `lib/screener/twentyCompanies.live.test.ts`. How to run them is at the top of each file.

## Not done in this stage, by design

- No page.
- No nightly job.
- No database writes. The tables from migration 0026 exist but are empty.

Stage B starts when you say go, and builds whichever job you choose.
