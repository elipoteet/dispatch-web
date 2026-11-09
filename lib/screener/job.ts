// The screener's nightly job: SEC frames in, screener_metrics out. Server
// only. Called by app/api/cron/screener/route.ts.
//
// Each run, within one Vercel function's five minutes:
//   1. downloads every frames file (lib/sec/frames.ts, framePlan "full":
//      about 460 files, 80 MB, a minute or two) and the SEC's ticker file;
//   2. builds each exchange-listed company's years (assemble.ts);
//   3. looks up industry and headquarters for companies it hasn't seen
//      (screener_filers), one at a time, until its time for that runs out;
//   4. takes revenue and net income from the 10-K where the frames hold
//      another filing's figure (rows.ts, needsAnnualReportFix), reusing last
//      night's answer while the frames still hold the same filing, and reads
//      the balance sheet page of the few annual reports whose securities sit
//      under the company's own label (rows.ts, needsStatementRead);
//   5. builds a row per company it has a profile for, leaving out commodity
//      and crypto funds, and works out each measure's median;
//   6. writes the rows into screener_metrics_next and the medians into
//      screener_medians_next, and swaps both into place in one transaction
//      (migrations 0027 and 0029), so the screener never shows a
//      half-updated table, and only after a complete run (rows.ts,
//      publishDecision);
//   7. logs what it did in screener_runs, medians included.
// Steps 3 and 4 carry over: the first nights fill in the backlog, after
// which each night has only a handful of new companies and new filings.
//
// Re-downloading everything nightly costs about a minute and means no
// history has to be stored: the frames are the history.

import { createServiceRoleClient } from "@/lib/supabase/service";
import { fetchCompanyConcept, fetchFilerProfile, fetchFilingFile, fetchFrame, fetchTickerExchangeFile, padCik } from "@/lib/sec/client";
import { framePlan, type FrameRequest } from "@/lib/sec/frames";
import { CONCEPT_TAGS, SCREENER_CONCEPT_TAGS, filerKindFromSic } from "@/lib/sec/concepts";
import { balanceSheetFile, parseStatementPage, securitiesOnBalanceSheet, shortTermDebtOnBalanceSheet } from "@/lib/sec/statementPage";
import { annualReportFact, assembleCompany, collectFrame, type Assembled, type CompanyYear, type FrameCollection } from "@/lib/screener/assemble";
import { customerMoney } from "@/lib/screener/customerMoney";
import { cashAndInvestments, computeMetrics, METRICS } from "@/lib/screener/metrics";
import { sectorFor } from "@/lib/screener/sectorCorrections";
import { EXCHANGES, tickerByCik, withPredecessors } from "@/lib/screener/tickers";
import {
  FIX_RULE,
  applyAnnualReportFix,
  isCommodityOrCryptoFund,
  medians,
  needsAnnualReportFix,
  profileRow,
  reusableFix,
  screenerRow,
  minPublishRows,
  publishDecision,
  STATEMENT_RULE,
  INTEREST_TAG,
  applyInterestFix,
  needsInterestFix,
  reusableInterestFix,
  type InterestFix,
  needsDebtRead,
  needsSecuritiesRead,
  needsStatementRead,
  reusableStatementRead,
  statementContext,
  statementFiling,
  type StatementRead,
  type AnnualFix,
  type FixedItem,
  type Median,
  type ProfileRow,
} from "@/lib/screener/rows";

type Db = ReturnType<typeof createServiceRoleClient>;

export type JobOptions = {
  // When the request started; every deadline is measured from here.
  startedAt: number;
  // The function's whole allowance, less a margin.
  budgetMs: number;
  today: string;
  // Builds every row and hands them to onRows without writing anything:
  // no run log, no frames log, no profiles, nothing staged or published.
  // For checking a change on the whole universe before it goes live.
  dryRun?: boolean;
  onRows?: (rows: Record<string, unknown>[], medians: Median[]) => void;
  // Where frames files come from; the SEC unless a check supplies saved
  // copies, so a dry run can be repeated without downloading 80 MB again.
  fetchFrame?: typeof fetchFrame;
};

type FixCounts = { needed: number; reused: number; fetched: number; pending: number };

export type JobSummary = {
  runId: number | null;
  frames: { requested: number; fetched: number; notFiled: number; failed: number; mb: number; seconds: number };
  // written: rows staged tonight; published: rows now showing, or null with
  // notPublished saying why the last complete set was kept.
  companies: { listed: number; written: number; published: number | null; removed: number | null; notPublished: string | null };
  skipped: Record<string, number>;
  profiles: { fetched: number; failed: number; missingAfter: number };
  netIncome: FixCounts;
  revenue: FixCounts;
  statements: FixCounts;
  interest: FixCounts;
  seconds: number;
  error: string | null;
};

const PAGE = 1000;

async function readAll<T>(db: Db, table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`reading ${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

async function writeAll(db: Db, table: string, rows: object[], onConflict: string): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`writing ${table}: ${error.message}`);
  }
}

type Fixes = { latest?: AnnualFix; prior?: AnnualFix };
type StoredFix = { latest: AnnualFix | null; prior: AnnualFix | null } | undefined;

// Elements a cash figure may already include, so a balance sheet line under
// one of them is never added twice.
const COUNTED_CASH_ELEMENTS: ReadonlySet<string> = new Set([
  ...CONCEPT_TAGS.cash_and_equivalents,
  ...SCREENER_CONCEPT_TAGS.cash_and_short_term_investments,
  ...SCREENER_CONCEPT_TAGS.short_term_investments,
]);

// The balance sheet page of one annual report: the securities on it that the
// cash figure hasn't counted, and, where asked, its debt due within a year
// (rows.ts, needsStatementRead). Two requests: the filing's list of pages,
// then the page.
async function readStatement(cik: string, accn: string, a: Assembled, checks: { securities: boolean; debt: boolean }): Promise<StatementRead> {
  const base = { accn, rule: STATEMENT_RULE };
  // The page is checked against the cash line alone, not cash plus
  // short-term investments.
  const own = a.balance.cash_and_equivalents;
  const counted = cashAndInvestments(a.balance);
  const cash = own ? { value: own.val, how: own.tag } : counted;
  if (!cash) return { ...base, file: null, added: [], failed: "no cash figure" };
  const list = await fetchFilingFile(cik, accn, "FilingSummary.xml");
  const file = list ? balanceSheetFile(list) : null;
  if (!file) return { ...base, file: null, added: [], failed: list ? "no balance sheet page in the filing" : "the filing has no FilingSummary.xml" };
  const html = await fetchFilingFile(cik, accn, file);
  if (!html) return { ...base, file, added: [], failed: "the balance sheet page is missing" };
  const page = parseStatementPage(html);
  const read = securitiesOnBalanceSheet(page, { value: cash.value, tag: cash.how }, COUNTED_CASH_ELEMENTS);
  if (!read.ok) return { ...base, file, added: [], failed: read.reason };
  const added = checks.securities ? read.added : [];
  if (!checks.debt) return { ...base, file, added, shortTermDebt: null, failed: null };
  const lines = shortTermDebtOnBalanceSheet(page, { value: cash.value, tag: cash.how });
  if (!lines.ok) return { ...base, file, added: [], failed: lines.reason };
  return { ...base, file, added, shortTermDebt: lines.lines, failed: null };
}

export async function runScreenerJob(options: JobOptions): Promise<JobSummary> {
  const { startedAt, budgetMs, today, dryRun = false } = options;
  const getFrame = options.fetchFrame ?? fetchFrame;
  const elapsed = () => Date.now() - startedAt;
  const runAt = new Date(startedAt).toISOString();
  const db = createServiceRoleClient();
  const summary: JobSummary = {
    runId: null,
    frames: { requested: 0, fetched: 0, notFiled: 0, failed: 0, mb: 0, seconds: 0 },
    companies: { listed: 0, written: 0, published: null, removed: null, notPublished: null },
    skipped: {},
    profiles: { fetched: 0, failed: 0, missingAfter: 0 },
    netIncome: { needed: 0, reused: 0, fetched: 0, pending: 0 },
    revenue: { needed: 0, reused: 0, fetched: 0, pending: 0 },
    statements: { needed: 0, reused: 0, fetched: 0, pending: 0 },
    interest: { needed: 0, reused: 0, fetched: 0, pending: 0 },
    seconds: 0,
    error: null,
  };
  const skip = (reason: string) => (summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1);
  let runMedians: Median[] = [];

  if (!dryRun) {
    const { data: run } = await db.from("screener_runs").insert({ mode: "nightly", started_at: runAt }).select("id").single();
    summary.runId = (run as { id: number } | null)?.id ?? null;
  }

  try {
    // —— 1. Frames and tickers ——
    const plan = framePlan(today, "full");
    summary.frames.requested = plan.length;
    const collection: FrameCollection = new Map();
    const frameRows: object[] = [];
    let bytes = 0;
    let next = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < plan.length) {
          const req: FrameRequest = plan[next++];
          const key = `${req.taxonomy === "us-gaap" ? "" : `${req.taxonomy}/`}${req.tag}/${req.unit}/${req.period}`;
          try {
            const got = await getFrame(req.tag, req.unit, req.period, req.taxonomy);
            if (!got) {
              summary.frames.notFiled++;
              frameRows.push({ frame: key, fetched_at: new Date().toISOString(), status: "not-filed", companies: 0, bytes: 0, error: null });
              continue;
            }
            summary.frames.fetched++;
            bytes += got.bytes;
            collectFrame(collection, req.tag, got.frame);
            frameRows.push({ frame: key, fetched_at: new Date().toISOString(), status: "ok", companies: got.frame.data.length, bytes: got.bytes, error: null });
          } catch (err) {
            summary.frames.failed++;
            frameRows.push({ frame: key, fetched_at: new Date().toISOString(), status: "error", companies: null, bytes: null, error: String(err).slice(0, 300) });
          }
        }
      }),
    );
    summary.frames.mb = +(bytes / 1_048_576).toFixed(1);
    summary.frames.seconds = elapsed() / 1000;
    if (!dryRun) await writeAll(db, "screener_frames", frameRows, "frame");

    const listed = withPredecessors(tickerByCik(await fetchTickerExchangeFile()), (cik) => {
      const c = collection.get(cik);
      return c != null && assembleCompany(c, today).ok;
    });

    // —— 2. Each exchange-listed company's years ——
    const universe: { company: Assembled; ticker: string; exchange: string | null }[] = [];
    for (const company of collection.values()) {
      const t = listed.get(company.cik);
      if (!t) {
        skip("no ticker");
        continue;
      }
      if (!t.exchange || !EXCHANGES.has(t.exchange)) {
        skip("not exchange-listed");
        continue;
      }
      const result = assembleCompany(company, today);
      if (!result.ok) {
        skip(result.reason === "stale" ? "no annual report in 18 months" : "no annual figures");
        continue;
      }
      universe.push({ company: result.company, ticker: t.ticker, exchange: t.exchange });
    }
    summary.companies.listed = universe.length;

    // —— 3. Industry and headquarters ——
    const profiles = new Map<string, ProfileRow>();
    for (const p of await readAll<ProfileRow>(db, "screener_filers", "*")) profiles.set(p.cik, p);
    const profileDeadline = budgetMs - 90_000;
    const fresh: ProfileRow[] = [];
    for (const u of universe) {
      const cik = padCik(u.company.cik);
      if (profiles.has(cik)) continue;
      if (elapsed() > profileDeadline) break;
      try {
        const { profile } = await fetchFilerProfile(cik);
        const row = profileRow(profile, new Date().toISOString());
        profiles.set(cik, row);
        fresh.push(row);
        summary.profiles.fetched++;
      } catch {
        summary.profiles.failed++;
      }
      if (!dryRun && fresh.length >= 100) await writeAll(db, "screener_filers", fresh.splice(0), "cik");
    }
    if (!dryRun) await writeAll(db, "screener_filers", fresh, "cik");

    // —— 4. Revenue and net income from the 10-K ——
    const previous = new Map<string, Partial<Record<FixedItem, StoredFix>>>();
    const previousReads = new Map<string, StatementRead>();
    const previousInterest = new Map<string, InterestFix>();
    type StoredSources = { net_income_10k?: StoredFix; revenue_10k?: StoredFix; cash_from_statement?: StatementRead; interest_10k?: InterestFix };
    for (const r of await readAll<{ cik: string; sources: StoredSources }>(db, "screener_metrics", "cik,sources")) {
      previous.set(r.cik, { net_income: r.sources?.net_income_10k, revenue: r.sources?.revenue_10k });
      if (r.sources?.cash_from_statement) previousReads.set(r.cik, r.sources.cash_from_statement);
      if (r.sources?.interest_10k) previousInterest.set(r.cik, r.sources.interest_10k);
    }
    const fixes: Record<FixedItem, Map<string, Fixes>> = { net_income: new Map(), revenue: new Map() };
    const fixDeadline = budgetMs - 35_000;
    for (const item of ["revenue", "net_income"] as const) {
      const counts = item === "revenue" ? summary.revenue : summary.netIncome;
      for (const u of universe) {
        const cik = padCik(u.company.cik);
        if (!profiles.has(cik)) continue;
        const a = u.company;
        const wantLatest = needsAnnualReportFix(a.latest, item);
        const wantPrior = needsAnnualReportFix(a.prior, item);
        if (!wantLatest && !wantPrior) continue;
        counts.needed++;
        const before = previous.get(cik)?.[item];
        const reused: Fixes = {
          latest: wantLatest ? reusableFix(before?.latest ?? undefined, a.latest, item) : undefined,
          prior: wantPrior ? reusableFix(before?.prior ?? undefined, a.prior, item) : undefined,
        };
        if ((!wantLatest || reused.latest) && (!wantPrior || reused.prior)) {
          fixes[item].set(cik, reused);
          counts.reused++;
          continue;
        }
        if (elapsed() > fixDeadline) {
          counts.pending++;
          continue;
        }
        const tag = a.latest.values[item]?.tag ?? (item === "revenue" ? "Revenues" : "NetIncomeLoss");
        try {
          const concept = await fetchCompanyConcept(cik, tag);
          const facts = concept ? Object.values(concept.units).flat() : [];
          const one = (want: boolean, year: CompanyYear | null): AnnualFix | undefined => {
            if (!want || !year?.periodStart) return undefined;
            const f = annualReportFact(facts, year.periodStart, year.periodEnd);
            return { frames: year.values[item]?.accn ?? null, end: year.periodEnd, val: f?.val ?? null, accn: f?.accn ?? null, rule: FIX_RULE };
          };
          fixes[item].set(cik, { latest: one(wantLatest, a.latest), prior: one(wantPrior, a.prior) });
          counts.fetched++;
        } catch {
          counts.pending++;
        }
      }
    }

    // —— 4b. Securities under the company's own label ——
    const reads = new Map<string, StatementRead>();
    const readDeadline = budgetMs - 30_000;
    for (const u of universe) {
      const cik = padCik(u.company.cik);
      const profile = profiles.get(cik);
      if (!profile || !needsStatementRead(u.company, filerKindFromSic(profile.sic))) continue;
      summary.statements.needed++;
      const accn = statementFiling(u.company);
      const reused = reusableStatementRead(previousReads.get(cik), accn);
      if (reused) {
        reads.set(cik, reused);
        summary.statements.reused++;
        continue;
      }
      if (!accn || elapsed() > readDeadline) {
        summary.statements.pending++;
        continue;
      }
      try {
        const kind = filerKindFromSic(profile.sic);
        reads.set(cik, await readStatement(cik, accn, u.company, { securities: needsSecuritiesRead(u.company, kind), debt: needsDebtRead(u.company, kind) }));
        summary.statements.fetched++;
      } catch {
        summary.statements.pending++;
      }
    }

    // —— 4c. Interest expense for ROIC's pretax fallback ——
    const interestFixes = new Map<string, InterestFix>();
    for (const u of universe) {
      const cik = padCik(u.company.cik);
      const profile = profiles.get(cik);
      if (!profile || !needsInterestFix(u.company, filerKindFromSic(profile.sic))) continue;
      summary.interest.needed++;
      const reused = reusableInterestFix(previousInterest.get(cik), u.company);
      if (reused) {
        interestFixes.set(cik, reused);
        summary.interest.reused++;
        continue;
      }
      if (elapsed() > readDeadline) {
        summary.interest.pending++;
        continue;
      }
      try {
        const concept = await fetchCompanyConcept(cik, INTEREST_TAG);
        const facts = concept ? Object.values(concept.units).flat() : [];
        const f = annualReportFact(facts, u.company.latest.periodStart!, u.company.latest.periodEnd);
        interestFixes.set(cik, { end: u.company.latest.periodEnd, home: statementFiling(u.company), val: f?.val ?? null, accn: f?.accn ?? null });
        summary.interest.fetched++;
      } catch {
        summary.interest.pending++;
      }
    }

    // —— 5. Rows, and where the middle company sits ——
    const rows: Record<string, unknown>[] = [];
    for (const u of universe) {
      const cik = padCik(u.company.cik);
      const profile = profiles.get(cik);
      if (!profile) {
        skip("awaiting industry and headquarters");
        continue;
      }
      if (isCommodityOrCryptoFund(profile.sic, profile.name ?? u.company.name)) {
        skip("commodity or crypto fund");
        continue;
      }
      const revenueFix = fixes.revenue.get(cik) ?? {};
      const incomeFix = fixes.net_income.get(cik) ?? {};
      let company = applyAnnualReportFix(u.company, "revenue", u.company.latest.values.revenue?.tag ?? "Revenues", revenueFix.latest, revenueFix.prior);
      company = applyAnnualReportFix(company, "net_income", u.company.latest.values.net_income?.tag ?? "NetIncomeLoss", incomeFix.latest, incomeFix.prior);
      const interestFix = interestFixes.get(cik);
      company = applyInterestFix(company, interestFix);
      const kind = filerKindFromSic(profile.sic);
      const money = customerMoney(cik, company, profile.sic);
      const read = reads.get(cik);
      const context = {
        sector: sectorFor(cik, profile.sic),
        holdsCustomerMoney: money.holds,
        statement: statementContext(read, needsStatementRead(company, kind)),
      };
      rows.push(
        screenerRow({
          company,
          ticker: u.ticker,
          exchange: u.exchange,
          profile,
          kind,
          metrics: computeMetrics(company, kind, context),
          fixes: incomeFix,
          revenueFixes: revenueFix,
          customerMoney: money,
          statement: read,
          interestFix,
          updatedAt: runAt,
        }),
      );
    }
    summary.profiles.missingAfter = summary.skipped["awaiting industry and headquarters"] ?? 0;
    runMedians = medians(rows, METRICS);
    summary.companies.written = rows.length;

    if (dryRun) {
      options.onRows?.(rows, runMedians);
    } else {
      // —— 6. Stage, then publish all at once (migrations 0027 and 0029) ——
      // Nothing the site reads changes until screener_publish commits; a run
      // cut off before then leaves last night's complete set showing.
      for (const table of ["screener_metrics_next", "screener_medians_next"]) {
        const cleared = await db.from(table).delete().neq(table === "screener_metrics_next" ? "cik" : "metric", "");
        if (cleared.error) throw new Error(`clearing ${table}: ${cleared.error.message}`);
      }
      await writeAll(db, "screener_metrics_next", rows, "cik");
      await writeAll(
        db,
        "screener_medians_next",
        runMedians.map((m) => ({ metric: m.metric, median: m.median, companies: m.companies, run_id: summary.runId, computed_at: runAt })),
        "metric",
      );

      const { count: showingNow } = await db.from("screener_metrics").select("cik", { count: "exact", head: true });
      const decision = publishDecision({ framesComplete: summary.frames.failed === 0, staged: rows.length, showingNow: showingNow ?? 0 });
      if (decision.publish) {
        const { data, error } = await db.rpc("screener_publish", { min_rows: minPublishRows(showingNow ?? 0) });
        if (error) throw new Error(`publishing: ${error.message}`);
        summary.companies.published = Number(data);
        summary.companies.removed = Math.max(0, (showingNow ?? 0) - summary.companies.published);
      } else {
        summary.companies.notPublished = decision.reason;
      }
    }
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
  }

  summary.seconds = elapsed() / 1000;
  if (!dryRun && summary.runId != null) {
    await db
      .from("screener_runs")
      .update({
        finished_at: new Date().toISOString(),
        files_fetched: summary.frames.fetched,
        files_not_filed: summary.frames.notFiled,
        bytes: Math.round(summary.frames.mb * 1_048_576),
        profiles_fetched: summary.profiles.fetched,
        companies_written: summary.companies.written,
        companies_skipped: {
          ...summary.skipped,
          "frames files that failed": summary.frames.failed,
          "net income from the 10-K still to fetch": summary.netIncome.pending,
          "revenue from the 10-K still to fetch": summary.revenue.pending,
          "balance sheet pages still to read": summary.statements.pending,
          "interest expense from the 10-K still to fetch": summary.interest.pending,
          published: summary.companies.published,
          "not published because": summary.companies.notPublished,
          "companies removed": summary.companies.removed,
        },
        medians: Object.fromEntries(runMedians.map((m) => [m.metric, { median: m.median, companies: m.companies }])),
        seconds: summary.seconds,
        error: summary.error,
      })
      .eq("id", summary.runId);
  }
  return summary;
}
