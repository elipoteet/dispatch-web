// The screener's nightly job: SEC frames in, screener_metrics out. Server
// only. Called by app/api/cron/screener/route.ts.
//
// Each run, within one Vercel function's five minutes:
//   1. downloads every frames file (lib/sec/frames.ts, framePlan "full":
//      about 330 files, 70 MB, a minute or two) and the SEC's ticker file;
//   2. builds each exchange-listed company's years (assemble.ts);
//   3. looks up industry and headquarters for companies it hasn't seen
//      (screener_filers), one at a time, until its time for that runs out;
//   4. takes net income from the 10-K where the frames hold a proxy
//      statement's figure (rows.ts, needsAnnualReportFix), reusing last
//      night's answer while the frames still hold the same filing;
//   5. writes a row per company it has a profile for, and removes rows for
//      companies that have left the list (rows.ts, shouldRemoveMissing);
//   6. logs what it did in screener_runs.
// Steps 3 and 4 carry over: the first nights fill in the backlog, after
// which each night has only a handful of new companies and new filings.
//
// Re-downloading everything nightly costs about a minute and means no
// history has to be stored: the frames are the history.

import { createServiceRoleClient } from "@/lib/supabase/service";
import { fetchCompanyConcept, fetchFilerProfile, fetchFrame, fetchTickerExchangeFile, padCik } from "@/lib/sec/client";
import { framePlan, type FrameRequest } from "@/lib/sec/frames";
import { filerKindFromSic } from "@/lib/sec/concepts";
import { annualReportFact, assembleCompany, collectFrame, type Assembled, type FrameCollection } from "@/lib/screener/assemble";
import { computeMetrics } from "@/lib/screener/metrics";
import { EXCHANGES, tickerByCik } from "@/lib/screener/tickers";
import {
  applyNetIncomeFix,
  needsAnnualReportFix,
  profileRow,
  reusableFix,
  screenerRow,
  shouldRemoveMissing,
  type NetIncomeFix,
  type ProfileRow,
} from "@/lib/screener/rows";

type Db = ReturnType<typeof createServiceRoleClient>;

export type JobOptions = {
  // When the request started; every deadline is measured from here.
  startedAt: number;
  // The function's whole allowance, less a margin.
  budgetMs: number;
  today: string;
};

export type JobSummary = {
  runId: number | null;
  frames: { requested: number; fetched: number; notFiled: number; failed: number; mb: number; seconds: number };
  companies: { listed: number; written: number; removed: number | null };
  skipped: Record<string, number>;
  profiles: { fetched: number; failed: number; missingAfter: number };
  netIncome: { needed: number; reused: number; fetched: number; pending: number };
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

export async function runScreenerJob(options: JobOptions): Promise<JobSummary> {
  const { startedAt, budgetMs, today } = options;
  const elapsed = () => Date.now() - startedAt;
  const runAt = new Date(startedAt).toISOString();
  const db = createServiceRoleClient();
  const summary: JobSummary = {
    runId: null,
    frames: { requested: 0, fetched: 0, notFiled: 0, failed: 0, mb: 0, seconds: 0 },
    companies: { listed: 0, written: 0, removed: null },
    skipped: {},
    profiles: { fetched: 0, failed: 0, missingAfter: 0 },
    netIncome: { needed: 0, reused: 0, fetched: 0, pending: 0 },
    seconds: 0,
    error: null,
  };
  const skip = (reason: string) => (summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1);

  const { data: run } = await db.from("screener_runs").insert({ mode: "nightly", started_at: runAt }).select("id").single();
  summary.runId = (run as { id: number } | null)?.id ?? null;

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
          const key = `${req.tag}/${req.unit}/${req.period}`;
          try {
            const got = await fetchFrame(req.tag, req.unit, req.period);
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
    await writeAll(db, "screener_frames", frameRows, "frame");

    const listed = tickerByCik(await fetchTickerExchangeFile());

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
    const profileDeadline = budgetMs - 75_000;
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
      if (fresh.length >= 100) await writeAll(db, "screener_filers", fresh.splice(0), "cik");
    }
    await writeAll(db, "screener_filers", fresh, "cik");

    // —— 4. Net income from the 10-K ——
    const previous = new Map<string, { latest?: NetIncomeFix; prior?: NetIncomeFix }>();
    for (const r of await readAll<{ cik: string; sources: { net_income_10k?: { latest: NetIncomeFix | null; prior: NetIncomeFix | null } } }>(
      db,
      "screener_metrics",
      "cik,sources",
    )) {
      const f = r.sources?.net_income_10k;
      if (f) previous.set(r.cik, { latest: f.latest ?? undefined, prior: f.prior ?? undefined });
    }
    const fixes = new Map<string, { latest?: NetIncomeFix; prior?: NetIncomeFix }>();
    const fixDeadline = budgetMs - 35_000;
    for (const u of universe) {
      const cik = padCik(u.company.cik);
      if (!profiles.has(cik)) continue;
      const a = u.company;
      const wantLatest = needsAnnualReportFix(a.latest);
      const wantPrior = needsAnnualReportFix(a.prior);
      if (!wantLatest && !wantPrior) continue;
      summary.netIncome.needed++;
      const before = previous.get(cik);
      const reused = { latest: wantLatest ? reusableFix(before?.latest, a.latest) : undefined, prior: wantPrior ? reusableFix(before?.prior, a.prior) : undefined };
      if ((!wantLatest || reused.latest) && (!wantPrior || reused.prior)) {
        fixes.set(cik, reused);
        summary.netIncome.reused++;
        continue;
      }
      if (elapsed() > fixDeadline) {
        summary.netIncome.pending++;
        continue;
      }
      const tag = a.latest.values.net_income?.tag ?? "NetIncomeLoss";
      try {
        const concept = await fetchCompanyConcept(cik, tag);
        const facts = concept ? Object.values(concept.units).flat() : [];
        const one = (want: boolean, year: Assembled["latest"] | null): NetIncomeFix | undefined => {
          if (!want || !year?.periodStart) return undefined;
          const f = annualReportFact(facts, year.periodStart, year.periodEnd);
          return f ? { frames: year.values.net_income?.accn ?? null, end: year.periodEnd, val: f.val, accn: f.accn } : undefined;
        };
        fixes.set(cik, { latest: one(wantLatest, a.latest), prior: one(wantPrior, a.prior) });
        summary.netIncome.fetched++;
      } catch {
        summary.netIncome.pending++;
      }
    }

    // —— 5. Rows ——
    const rows: Record<string, unknown>[] = [];
    for (const u of universe) {
      const cik = padCik(u.company.cik);
      const profile = profiles.get(cik);
      if (!profile) {
        skip("awaiting industry and headquarters");
        continue;
      }
      const fix = fixes.get(cik) ?? {};
      const tag = u.company.latest.values.net_income?.tag ?? "NetIncomeLoss";
      const company = applyNetIncomeFix(u.company, tag, fix.latest, fix.prior);
      const kind = filerKindFromSic(profile.sic);
      rows.push(screenerRow({ company, ticker: u.ticker, exchange: u.exchange, profile, kind, metrics: computeMetrics(company, kind), fixes: fix, updatedAt: runAt }));
    }
    summary.profiles.missingAfter = summary.skipped["awaiting industry and headquarters"] ?? 0;

    const { count: before } = await db.from("screener_metrics").select("cik", { count: "exact", head: true });
    await writeAll(db, "screener_metrics", rows, "cik");
    summary.companies.written = rows.length;

    if (shouldRemoveMissing({ framesComplete: summary.frames.failed === 0, written: rows.length, previous: before ?? 0 })) {
      const { count, error } = await db.from("screener_metrics").delete({ count: "exact" }).lt("updated_at", runAt);
      if (error) throw new Error(`removing departed companies: ${error.message}`);
      summary.companies.removed = count ?? 0;
    }
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
  }

  summary.seconds = elapsed() / 1000;
  if (summary.runId != null) {
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
          "companies removed": summary.companies.removed,
        },
        seconds: summary.seconds,
        error: summary.error,
      })
      .eq("id", summary.runId);
  }
  return summary;
}
