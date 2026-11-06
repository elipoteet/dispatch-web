// Phase eleven, Stage A: what a screener refresh costs and what it produces,
// measured end to end with real requests through lib/sec/client.ts. Writes
// nothing to the database. Opt-in, because it downloads a few hundred frames
// and, with SCREENER_PROFILES=all, every company's submissions file:
//
//   PowerShell:
//   $env:SCREENER_LIVE=1; npx vitest run lib/screener/measure.live.test.ts
//
// Options (environment variables):
//   SCREENER_MODE=full|nightly   which frames to fetch (default full)
//   SCREENER_PROFILES=sample|all|dir|none
//                                company profiles (SIC, state): a random 150,
//                                all of them, the copy saved in SCREENER_SAVE_DIR,
//                                or none (default sample)
//   SCREENER_SAVE_DIR=<folder>   keep frames (gzipped), profiles and the summary
//   SCREENER_FROM_DIR=<folder>   read frames and the ticker file from an earlier
//                                SCREENER_SAVE_DIR instead of the network
//   SCREENER_CONCURRENCY=4       requests in flight at once; the client's gate
//                                still spaces their starts 150 ms apart
//   SCREENER_TODAY=YYYY-MM-DD    pin "today" for a repeatable run

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import {
  fetchFilerProfile,
  fetchFrame,
  fetchTickerExchangeFile,
  padCik,
  type FilerProfile,
  type TickerExchangeFile,
} from "@/lib/sec/client";
import { framePlan, type FrameRequest, type FrameResponse, type RefreshMode } from "@/lib/sec/frames";
import { filerKindFromSic } from "@/lib/sec/concepts";
import { assembleCompany, collectFrame, type Assembled, type FrameCollection } from "@/lib/screener/assemble";
import { computeMetrics, METRICS } from "@/lib/screener/metrics";
import { EXCHANGES, tickerByCik } from "@/lib/screener/tickers";
import { sectorFromSic } from "@/lib/screener/sectors";

const env = (k: string) => process.env[k]?.trim() || null;
const FROM = env("SCREENER_FROM_DIR");
const LIVE = process.env.SCREENER_LIVE === "1" && (Boolean(FROM) || Boolean(env("SEC_CONTACT_EMAIL")));
const SAVE = env("SCREENER_SAVE_DIR");
const MODE: RefreshMode = env("SCREENER_MODE") === "nightly" ? "nightly" : "full";
const PROFILES = (env("SCREENER_PROFILES") ?? "sample") as "sample" | "all" | "dir" | "none";
const CONCURRENCY = Math.max(1, Number(env("SCREENER_CONCURRENCY") ?? 4));
const today = env("SCREENER_TODAY") ?? new Date().toISOString().slice(0, 10);

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await work(items[i]);
      }
    }),
  );
  return out;
}

const frameFile = (r: FrameRequest) => `${r.tag}__${r.unit}__${r.period}.json.gz`;

type FileStat = { tag: string; period: string; bytes: number; entries: number; ms: number; found: boolean };

describe.skipIf(!LIVE)(`screener refresh, measured end to end (${MODE})`, () => {
  it("fetches, assembles and computes every company", { timeout: 3_600_000 }, async () => {
    if (SAVE) fs.mkdirSync(path.join(SAVE, "frames"), { recursive: true });
    const plan = framePlan(today, MODE);
    const collection: FrameCollection = new Map();
    let peakRss = process.memoryUsage().rss;

    // —— 1. Frames ——
    const t0 = Date.now();
    const stats = await pool<FrameRequest, FileStat>(plan, CONCURRENCY, async (req) => {
      const started = Date.now();
      let frame: FrameResponse | null = null;
      let bytes = 0;
      if (FROM) {
        const file = path.join(FROM, "frames", frameFile(req));
        if (fs.existsSync(file)) {
          const text = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
          frame = JSON.parse(text) as FrameResponse;
          bytes = text.length;
        }
      } else {
        const got = await fetchFrame(req.tag, req.unit, req.period);
        if (got) ({ frame, bytes } = got);
      }
      const ms = Date.now() - started;
      if (!frame) return { tag: req.tag, period: req.period, bytes: 0, entries: 0, ms, found: false };
      collectFrame(collection, req.tag, frame);
      if (SAVE && !FROM) fs.writeFileSync(path.join(SAVE, "frames", frameFile(req)), zlib.gzipSync(JSON.stringify(frame)));
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      return { tag: req.tag, period: req.period, bytes, entries: frame.data.length, ms, found: true };
    });
    const framesSeconds = (Date.now() - t0) / 1000;

    // —— 2. Tickers ——
    let tickers: TickerExchangeFile;
    const fromTickers = FROM ? path.join(FROM, "tickers-exchange.json") : null;
    if (fromTickers && fs.existsSync(fromTickers)) tickers = JSON.parse(fs.readFileSync(fromTickers, "utf8"));
    else tickers = await fetchTickerExchangeFile();
    if (SAVE) fs.writeFileSync(path.join(SAVE, "tickers-exchange.json"), JSON.stringify(tickers));
    const listed = tickerByCik(tickers);

    // —— 3. Assemble ——
    const t3 = Date.now();
    const universe: { company: Assembled; ticker: string; exchange: string | null }[] = [];
    const excluded = { noTicker: 0, stale: 0, noAnnual: 0, staleWithTicker: 0 };
    for (const company of collection.values()) {
      const result = assembleCompany(company, today);
      const t = listed.get(company.cik);
      if (!result.ok) {
        if (result.reason === "stale") {
          excluded.stale++;
          if (t) excluded.staleWithTicker++;
        } else excluded.noAnnual++;
        continue;
      }
      if (!t) {
        excluded.noTicker++;
        continue;
      }
      universe.push({ company: result.company, ticker: t.ticker, exchange: t.exchange });
    }
    const assembleSeconds = (Date.now() - t3) / 1000;
    peakRss = Math.max(peakRss, process.memoryUsage().rss);

    // —— 4. Profiles ——
    const profiles = new Map<number, FilerProfile>();
    const profileStats = { requested: 0, fetched: 0, failed: 0, bytes: [] as number[], seconds: 0 };
    if (PROFILES === "dir") {
      const file = path.join(FROM ?? SAVE ?? "", "profiles.json");
      for (const p of JSON.parse(fs.readFileSync(file, "utf8")) as FilerProfile[]) profiles.set(Number(p.cik), p);
    } else if (PROFILES !== "none") {
      const ciks = universe.map((u) => u.company.cik);
      const wanted = PROFILES === "all" ? ciks : ciks.map((c) => ({ c, k: Math.random() })).sort((a, b) => a.k - b.k).slice(0, 150).map((x) => x.c);
      profileStats.requested = wanted.length;
      const t4 = Date.now();
      await pool(wanted, CONCURRENCY, async (cik) => {
        try {
          const { profile, bytes } = await fetchFilerProfile(String(cik));
          profiles.set(cik, profile);
          profileStats.fetched++;
          profileStats.bytes.push(bytes);
        } catch {
          profileStats.failed++;
        }
      });
      profileStats.seconds = (Date.now() - t4) / 1000;
      if (SAVE) fs.writeFileSync(path.join(SAVE, PROFILES === "all" ? "profiles.json" : "profiles-sample.json"), JSON.stringify([...profiles.values()]));
    }

    // —— 5. Metrics, and how many are n/a ——
    const t5 = Date.now();
    const naCounts: Record<string, Record<string, number>> = {};
    const valueCounts: Record<string, number> = {};
    const sectors: Record<string, number> = {};
    const states = { us: 0, outside: 0, blank: 0, noProfile: 0 };
    const kinds: Record<string, number> = {};
    const dividend = { yes: 0, no: 0, unknown: 0 };
    const rows: unknown[] = [];
    for (const u of universe) {
      const profile = profiles.get(u.company.cik);
      const kind = profile ? filerKindFromSic(profile.sic) : "operating";
      kinds[profile ? kind : "unknown"] = (kinds[profile ? kind : "unknown"] ?? 0) + 1;
      const m = computeMetrics(u.company, kind);
      for (const key of METRICS) {
        if (m.values[key] == null) {
          const reason = m.na[key] ?? "?";
          (naCounts[key] ??= {})[reason] = (naCounts[key][reason] ?? 0) + 1;
        } else valueCounts[key] = (valueCounts[key] ?? 0) + 1;
      }
      if (m.paysDividend === true) dividend.yes++;
      else if (m.paysDividend === false) dividend.no++;
      else dividend.unknown++;
      if (!profile) states.noProfile++;
      else {
        const sector = sectorFromSic(profile.sic) ?? "(no SIC)";
        sectors[sector] = (sectors[sector] ?? 0) + 1;
        if (profile.state == null) states.blank++;
        else if (profile.state.length === 2) states.us++;
        else states.outside++;
      }
      if (SAVE) rows.push({ cik: padCik(u.company.cik), ticker: u.ticker, exchange: u.exchange, name: u.company.name, periodEnd: u.company.latest.periodEnd, kind, values: m.values, paysDividend: m.paysDividend, na: m.na });
    }
    const metricsSeconds = (Date.now() - t5) / 1000;

    const found = stats.filter((s) => s.found);
    const sorted = (xs: number[]) => xs.slice().sort((a, b) => a - b);
    const pb = sorted(profileStats.bytes);
    const summary = {
      today,
      mode: MODE,
      source: FROM ? "saved files" : "network",
      concurrency: CONCURRENCY,
      frames: {
        requested: plan.length,
        found: found.length,
        notFiled: plan.length - found.length,
        rawMB: +(found.reduce((a, s) => a + s.bytes, 0) / 1_048_576).toFixed(1),
        seconds: framesSeconds,
        medianMs: sorted(found.map((s) => s.ms))[Math.floor(found.length / 2)] ?? null,
      },
      peakRssMB: Math.round(peakRss / 1_048_576),
      companies: {
        inFrames: collection.size,
        universe: universe.length,
        onExchange: universe.filter((u) => u.exchange && EXCHANGES.has(u.exchange)).length,
        otc: universe.filter((u) => u.exchange === "OTC").length,
        noExchange: universe.filter((u) => !u.exchange).length,
        excluded,
      },
      assembleSeconds,
      metricsSeconds,
      profiles: {
        mode: PROFILES,
        requested: profileStats.requested,
        fetched: profileStats.fetched,
        failed: profileStats.failed,
        seconds: profileStats.seconds,
        meanKB: pb.length ? Math.round(pb.reduce((a, b) => a + b, 0) / pb.length / 1024) : null,
        medianKB: pb.length ? Math.round(pb[Math.floor(pb.length / 2)] / 1024) : null,
        maxKB: pb.length ? Math.round(pb[pb.length - 1] / 1024) : null,
        totalMB: +(pb.reduce((a, b) => a + b, 0) / 1_048_576).toFixed(1),
      },
      filerKinds: kinds,
      sectors,
      states,
      dividend,
      valueCounts,
      naCounts,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (SAVE) {
      fs.writeFileSync(path.join(SAVE, `summary-${MODE}.json`), JSON.stringify({ summary, stats }, null, 2));
      fs.writeFileSync(path.join(SAVE, "metrics.json"), JSON.stringify(rows));
    }
    expect(universe.length).toBeGreaterThan(0);
  });
});
