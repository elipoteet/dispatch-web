// A live check across twenty large companies, run against the real SEC API.
//
// The fixture tests next door prove the rules on four saved companies. This one
// exists because the three worst bugs in stage 1 were all invisible on four
// companies and obvious on twenty: a 90-day column read as a full year, an 8-K
// overruling three annual reports, and one column mixing two different revenue
// tags. A rule that holds on NVIDIA and breaks on Walmart is not a rule yet.
//
// It needs the network and takes about twenty seconds. If the SEC is unreachable
// it SKIPS rather than fails — a flaky connection should never look like a bug in
// the normaliser, and `npm test` has to stay trustworthy. A real disagreement
// with the data still fails loudly.

import { describe, expect, it } from "vitest";
import { normalizeCompanyFacts, type CompanyFacts, type FinancialRow } from "@/lib/sec/normalize";

const CONTACT = process.env.SEC_CONTACT_EMAIL?.trim();
const UA = `The Dispatch (dispatchresearch.com) ${CONTACT ?? ""}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const COMPANIES: [string, string][] = [
  ["NVDA", "0001045810"], ["AAPL", "0000320193"], ["MSFT", "0000789019"], ["GOOGL", "0001652044"],
  ["AMZN", "0001018724"], ["META", "0001326801"], ["AVGO", "0001730168"], ["TSLA", "0001318605"],
  ["JPM", "0000019617"],  ["WMT", "0000104169"],  ["COST", "0000909832"], ["XOM", "0000034088"],
  ["CVX", "0000093410"],  ["JNJ", "0000200406"],  ["UNH", "0000731766"],  ["LLY", "0000059478"],
  ["PG", "0000080424"],   ["KO", "0000021344"],   ["CAT", "0000018230"],  ["VZ", "0000732712"],
];

type Loaded = { symbol: string; rows: FinancialRow[] };

async function get<T>(url: string): Promise<T | null> {
  await sleep(180);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const loaded: Loaded[] = [];
let reachable = Boolean(CONTACT);

async function loadAll(): Promise<void> {
  if (loaded.length || !reachable) return;
  for (const [symbol, cik] of COMPANIES) {
    const subs = await get<{ sic: string }>(`https://data.sec.gov/submissions/CIK${cik}.json`);
    const facts = await get<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
    if (!facts) continue;
    loaded.push({ symbol, rows: normalizeCompanyFacts(facts, { sic: subs?.sic }).rows });
  }
  // Nothing came back at all — treat as unreachable rather than as twenty failures.
  if (loaded.length === 0) reachable = false;
}

describe("twenty large companies, against the live SEC API", () => {
  it(
    "uses one tag per line item within a fiscal year — the year and its quarters agree",
    { timeout: 900_000 },
    async (ctx) => {
      await loadAll();
      if (!reachable) {
        ctx.skip(CONTACT ? "SEC unreachable" : "SEC_CONTACT_EMAIL not set");
        return;
      }

      // The invariant that would have caught Walmart. Its fiscal 2017 showed a
      // full year of $481.3B (net sales) against quarters summing to $485.9B
      // (total revenues) — two real figures from two tags, in one column.
      //
      // Deliberately about the TAG, not the arithmetic: quarters need not sum to
      // the year once a year has been restated, but every cell in one year's row
      // must still have come from the same place.
      const offenders: string[] = [];
      for (const { symbol, rows } of loaded) {
        const byYearItem = new Map<string, Map<string, string[]>>();
        for (const row of rows) {
          // Composites name both of their inputs, and free cash flow legitimately
          // crosses providers when capex came from the filing instead.
          if (row.lineItem === "free_cash_flow" || row.sourceTag.includes(" - ")) continue;
          const key = `${symbol} FY${row.fiscalYear} ${row.lineItem}`;
          if (!byYearItem.has(key)) byYearItem.set(key, new Map());
          const tags = byYearItem.get(key)!;
          if (!tags.has(row.sourceTag)) tags.set(row.sourceTag, []);
          tags.get(row.sourceTag)!.push(row.fiscalPeriod);
        }
        for (const [key, tags] of byYearItem) {
          if (tags.size <= 1) continue;
          const detail = [...tags].map(([tag, periods]) => `${tag}[${periods.sort().join(",")}]`).join(" vs ");
          offenders.push(`${key}: ${detail}`);
        }
      }

      expect(offenders, `mixed tags within a fiscal year:\n${offenders.join("\n")}`).toEqual([]);
    },
  );

  it("gives every operating company a decade of revenue", { timeout: 900_000 }, async (ctx) => {
    await loadAll();
    if (!reachable) {
      ctx.skip(CONTACT ? "SEC unreachable" : "SEC_CONTACT_EMAIL not set");
      return;
    }
    const thin: string[] = [];
    for (const { symbol, rows } of loaded) {
      const years = new Set(rows.filter((r) => r.lineItem === "revenue" && r.fiscalPeriod === "FY").map((r) => r.fiscalYear));
      // Broadcom is the known exception: its pre-2018 history sits under the
      // predecessor company's CIK, which this stage does not follow.
      if (years.size < 10 && symbol !== "AVGO") thin.push(`${symbol}: ${years.size} years`);
    }
    expect(thin, `fewer than ten years of revenue:\n${thin.join("\n")}`).toEqual([]);
  });

  it("keeps free cash flow exactly equal to operating cash flow minus capex", { timeout: 900_000 }, async (ctx) => {
    await loadAll();
    if (!reachable) {
      ctx.skip(CONTACT ? "SEC unreachable" : "SEC_CONTACT_EMAIL not set");
      return;
    }
    const broken: string[] = [];
    for (const { symbol, rows } of loaded) {
      for (const fcf of rows.filter((r) => r.lineItem === "free_cash_flow")) {
        const ocf = rows.find(
          (r) => r.lineItem === "operating_cash_flow" && r.fiscalYear === fcf.fiscalYear && r.fiscalPeriod === fcf.fiscalPeriod,
        );
        const capex = rows.find(
          (r) => r.lineItem === "capex" && r.fiscalYear === fcf.fiscalYear && r.fiscalPeriod === fcf.fiscalPeriod,
        );
        if (!ocf || !capex) continue;
        if (Math.abs(ocf.value - capex.value - fcf.value) > 1) {
          broken.push(`${symbol} FY${fcf.fiscalYear} ${fcf.fiscalPeriod}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
