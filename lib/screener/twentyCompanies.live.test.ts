// Phase eleven, Stage A: the screener's numbers for twenty large companies,
// checked against the research file's own path. Opt-in (network):
//
//   PowerShell:
//   $env:SCREENER_LIVE=1; $env:SCREENER_FROM_DIR="<folder from measure.live.test.ts>"; npx vitest run lib/screener/twentyCompanies.live.test.ts
//
// For each company it prints every main-ten measure, then compares each input
// of the latest year (from the frames) with what normalizeCompanyFacts makes
// of the company's companyfacts: the separate path the research file uses.
// It also flags any frames value whose filing isn't a 10-K or 10-Q.
//
// Frames come from SCREENER_FROM_DIR when set (saved by measure.live.test.ts),
// otherwise from the network. The report goes to SCREENER_SAVE_DIR (or the
// FROM folder) as twenty.md, because a passing test's console is hidden.

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fetchCompanyConcept, fetchCompanyFacts, fetchFilerProfile, fetchFrame, padCik } from "@/lib/sec/client";
import { framePlan, type FrameResponse } from "@/lib/sec/frames";
import { normalizeCompanyFacts, type FinancialRow } from "@/lib/sec/normalize";
import { filerKindFromSic, suppressedItems } from "@/lib/sec/concepts";
import { annualReportValue, assembleCompany, collectFrame, type Assembled, type FrameCollection, type Picked } from "@/lib/screener/assemble";
import { computeMetrics } from "@/lib/screener/metrics";
import { sectorFromSic } from "@/lib/screener/sectors";

const env = (k: string) => process.env[k]?.trim() || null;
const FROM = env("SCREENER_FROM_DIR");
const OUT = env("SCREENER_SAVE_DIR") ?? FROM;
const LIVE = process.env.SCREENER_LIVE === "1" && Boolean(env("SEC_CONTACT_EMAIL"));
const today = env("SCREENER_TODAY") ?? new Date().toISOString().slice(0, 10);

// The twenty in lib/sec/twentyCompanies.test.ts, plus the brief's test cases:
// negative equity (MCD), a REIT (O) and a loss-maker (RIVN).
const COMPANIES: [string, number][] = [
  ["NVDA", 1045810], ["AAPL", 320193], ["MSFT", 789019], ["GOOGL", 1652044],
  ["AMZN", 1018724], ["META", 1326801], ["AVGO", 1730168], ["TSLA", 1318605],
  ["JPM", 19617], ["WMT", 104169], ["COST", 909832], ["XOM", 34088],
  ["CVX", 93410], ["JNJ", 200406], ["UNH", 731766], ["LLY", 59478],
  ["PG", 80424], ["KO", 21344], ["CAT", 18230], ["VZ", 732712],
  ["MCD", 63908], ["O", 726728], ["RIVN", 1874178],
];

const DURATIONS = [
  "revenue", "cost_of_revenue", "gross_profit", "operating_income", "net_income",
  "operating_cash_flow", "capex", "buybacks", "shares_diluted", "eps_diluted",
] as const;
const BALANCES = ["cash_and_equivalents", "total_assets", "total_equity", "total_debt"] as const;

const pct = (x: number | null) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const bn = (x: number | null) => (x == null ? "n/a" : `$${(x / 1e9).toFixed(2)}B`);

describe.skipIf(!LIVE)("screener numbers for twenty large companies", () => {
  it("match the research file's normaliser", { timeout: 1_800_000 }, async () => {
    const wanted = new Set(COMPANIES.map(([, cik]) => cik));
    const collection: FrameCollection = new Map();
    for (const req of framePlan(today, "full")) {
      let frame: FrameResponse | null = null;
      const file = FROM ? path.join(FROM, "frames", `${req.tag}__${req.unit}__${req.period}.json.gz`) : null;
      if (file && fs.existsSync(file)) frame = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
      else if (!FROM) frame = (await fetchFrame(req.tag, req.unit, req.period))?.frame ?? null;
      if (!frame) continue;
      collectFrame(collection, req.tag, { ...frame, data: frame.data.filter((d) => wanted.has(d.cik)) });
    }

    const lines: string[] = [
      `# Screener check, twenty-three companies (${today})`,
      "",
      "| Ticker | Year ended | Sector | Revenue | Growth 1y | Growth 3y | Gross | Operating | Net | FCF margin | Net cash | Shares 1y |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ];
    const mismatches: string[] = [];
    const nonPeriodic: string[] = [];
    let compared = 0;
    let conceptFetches = 0;
    const afterFix: string[] = [];

    for (const [symbol, cik] of COMPANIES) {
      const frames = collection.get(cik);
      const assembled = frames ? assembleCompany(frames, today) : null;
      if (!assembled?.ok) {
        lines.push(`| ${symbol} | (not in screener: ${assembled ? assembled.reason : "no frames"}) | | | | | | | | | | |`);
        continue;
      }
      const a: Assembled = assembled.company;
      const { profile } = await fetchFilerProfile(String(cik));
      const kind = filerKindFromSic(profile.sic);
      const m = computeMetrics(a, kind).values;
      lines.push(
        `| ${symbol} | ${a.latest.periodEnd} | ${sectorFromSic(profile.sic)} | ${bn(m.revenue)} | ${pct(m.revenue_growth_1y)} | ${pct(m.revenue_growth_3y)} | ${pct(m.gross_margin)} | ${pct(m.operating_margin)} | ${pct(m.net_margin)} | ${pct(m.fcf_margin)} | ${bn(m.net_cash)} | ${pct(m.share_change_1y)} |`,
      );

      // —— The research file's path ——
      const facts = await fetchCompanyFacts(padCik(cik));
      const { rows } = normalizeCompanyFacts(facts, { sic: profile.sic });
      const formOf = new Map<string, string>();
      for (const units of Object.values(facts.facts["us-gaap"] ?? {})) {
        for (const list of Object.values(units.units)) for (const f of list) if (!formOf.has(f.accn)) formOf.set(f.accn, f.form);
      }
      const end = a.latest.periodEnd;
      const row = (item: string, period: "FY" | "Q4"): FinancialRow | undefined =>
        rows.find((r) => r.lineItem === item && r.fiscalPeriod === period && r.periodEnd === end);
      const check = (item: string, mine: Picked | undefined, theirs: FinancialRow | undefined) => {
        if (mine) {
          const form = formOf.get(mine.accn);
          if (form && !/^10-[KQ]/.test(form)) nonPeriodic.push(`${symbol} ${item}: ${mine.val} from ${form} ${mine.accn} (${mine.tag})`);
        }
        if (!mine && !theirs) return;
        compared++;
        if (!mine || !theirs) {
          mismatches.push(`${symbol} ${item}: screener ${mine ? `${mine.val} (${mine.tag})` : "none"}, research file ${theirs ? `${theirs.value} (${theirs.sourceTag})` : "none"}`);
          return;
        }
        if (Math.abs(mine.val - theirs.value) > Math.abs(theirs.value) * 0.0005) {
          mismatches.push(`${symbol} ${item}: screener ${mine.val} (${mine.tag}), research file ${theirs.value} (${theirs.sourceTag})`);
        }
      };
      // Line items the research file suppresses for this kind of company are
      // n/a in the screener's measures too, one step later; nothing to compare.
      const suppressed = new Set<string>(suppressedItems(kind)?.items ?? []);
      for (const item of DURATIONS) {
        if (suppressed.has(item)) continue;
        let mine = a.latest.values[item];
        // The research file stores gross profit worked out as revenue less
        // cost of revenue where none is filed; the screener does the same sum
        // inside the gross margin. Compare like with like.
        if (item === "gross_profit" && !mine && a.latest.values.revenue && a.latest.values.cost_of_revenue) {
          mine = { ...a.latest.values.revenue, val: a.latest.values.revenue.val - a.latest.values.cost_of_revenue.val, tag: "revenue - cost_of_revenue" };
        }
        check(item, mine, row(item, "FY"));
      }
      for (const item of BALANCES) check(item, a.balance[item], row(item, "Q4"));

      // —— The fix proposed for Stage B ——
      // Where net income came from a different filing than operating cash
      // flow (in practice, the proxy statement), take the annual report's own
      // figure from the company's concept file, and compare again.
      const income = a.latest.values.net_income;
      const home = a.latest.values.operating_cash_flow?.accn ?? a.latest.values.revenue?.accn;
      if (income && home && income.accn !== home && a.latest.periodStart) {
        conceptFetches++;
        const concept = await fetchCompanyConcept(cik, income.tag);
        // No 10-K figure under that tag (Caterpillar's 10-K files net income
        // under another one): keep the frames value.
        const fixed = (concept ? annualReportValue(Object.values(concept.units).flat(), a.latest.periodStart, end) : null) ?? income.val;
        const theirs = row("net_income", "FY");
        if (theirs && Math.abs(fixed - theirs.value) > Math.abs(theirs.value) * 0.0005) {
          afterFix.push(`${symbol} net_income: annual report ${fixed}, research file ${theirs.value}`);
        }
      }
    }

    lines.push("", `## Inputs compared with the research file: ${compared}, mismatches: ${mismatches.length}`, "");
    for (const m of mismatches) lines.push(`- ${m}`);
    lines.push(
      "",
      `## Net income from the annual report itself (concept file fetched for ${conceptFetches} companies): remaining mismatches ${afterFix.length}`,
      "",
    );
    for (const m of afterFix) lines.push(`- ${m}`);
    lines.push("", `## Values from filings other than a 10-K or 10-Q: ${nonPeriodic.length}`, "");
    for (const m of nonPeriodic) lines.push(`- ${m}`);
    const report = lines.join("\n");
    if (OUT) fs.writeFileSync(path.join(OUT, "twenty.md"), report);
    process.stdout.write(report + "\n");
    expect(compared).toBeGreaterThan(0);
  });
});
