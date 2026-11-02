import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parseForm4, tradesFromFiling, type InsiderTrade } from "@/lib/sec/form4";
import { codeLabel, isMarketTrade, summarize, summarySentences, tradeLabel, tradeValue, withoutRepeats } from "./insiders";

const fromFixture = (name: string, filed: string, accession = name): InsiderTrade[] => {
  const xml = fs.readFileSync(path.join(__dirname, "..", "sec", "__fixtures__", "form4", `${name}.xml`), "utf8");
  return tradesFromFiling(parseForm4(xml)!, { accession, filed, form: "4" });
};

const nvdaSale = fromFixture("nvda-2026-sale-on-plan", "2026-09-23");
const culpBuy = fromFixture("culp-2026-purchase", "2026-09-30");
const culpPay = fromFixture("culp-2026-exercise-and-tax", "2026-07-20");
const aapl = fromFixture("aapl-2026-vest-tax-sales", "2026-10-19");

describe("labels", () => {
  it("names each code plainly, with no verdict in it", () => {
    expect(["P", "S", "A", "M", "F", "G"].map(codeLabel)).toEqual([
      "Bought",
      "Sold",
      "Grant or award",
      "Exercise or vesting",
      "Withheld for tax",
      "Gift",
    ]);
    expect(codeLabel("Q")).toBe("Other (code Q)");
  });

  it("tells the two sides of an exercise apart", () => {
    // Culp's filing: shares received, tax withheld, then the units used up.
    expect(culpPay.map(tradeLabel)).toEqual([
      "Exercise or vesting",
      "Exercise or vesting",
      "Withheld for tax",
      "Options or units exercised",
      "Options or units exercised",
    ]);
  });

  it("counts only purchases and sales of the shares themselves as market trades", () => {
    expect(culpBuy.filter(isMarketTrade).map((t) => t.code)).toEqual(["P"]);
    expect(culpPay.filter(isMarketTrade)).toEqual([]);
  });

  it("values a trade at shares times price, and a vesting at nothing", () => {
    expect(tradeValue(culpBuy[0])).toBeCloseTo(2960 * 3.89, 6);
    expect(tradeValue(aapl[0])).toBeNull();
  });
});

describe("summarize", () => {
  const all = [...nvdaSale, ...culpBuy, ...culpPay, ...aapl];
  const s = summarize(all, "2026-11-01");

  it("adds up the year's purchases and sales by value, trades and people", () => {
    expect(s.bought).toEqual({ value: 2960 * 3.89, shares: 2960, trades: 1, insiders: 1 });
    const nvdaValue = nvdaSale.reduce((v, t) => v + t.shares! * t.price!, 0);
    const aaplSales = aapl.filter((t) => t.code === "S");
    const aaplValue = aaplSales.reduce((v, t) => v + t.shares! * t.price!, 0);
    expect(s.sold.trades).toBe(3 + aaplSales.length);
    expect(s.sold.insiders).toBe(2);
    expect(s.sold.value).toBeCloseTo(nvdaValue + aaplValue, 4);
  });

  it("gives the share of sales made on preset plans: all of them, here", () => {
    expect(s.onPlanShare).toBeCloseTo(1, 10);
  });

  it("leaves out trades older than a year", () => {
    expect(summarize(all, "2027-10-20").sold.trades).toBe(0);
  });

  it("says it in plain sentences", () => {
    const words = summarySentences(s);
    expect(words[0]).toMatch(/^Over the past 12 months, insiders bought \$12 thousand of shares in 1 purchase by 1 person, and sold \$[\d.]+ million of shares in \d+ sales by 2 people\.$/);
    expect(words[1]).toBe("All of the sales by value were made under preset trading plans (Rule 10b5-1), set up in advance.");
  });

  it("says plainly when there were none", () => {
    expect(summarySentences(summarize(culpPay, "2026-11-01"))).toEqual([
      "No insider bought or sold the company's shares on the open market in the past 12 months, according to their Form 4 filings.",
    ]);
  });
});

describe("withoutRepeats", () => {
  it("drops an amendment's repeat of another filing's line, keeping the later filing", () => {
    const amended = fromFixture("culp-2026-purchase", "2026-10-05", "amendment");
    const kept = withoutRepeats([...culpBuy, ...amended]);
    expect(kept.filter((t) => t.code === "P")).toHaveLength(1);
    expect(kept.find((t) => t.code === "P")!.accession).toBe("amendment");
  });

  it("keeps identical lines within one filing: they are separate lots", () => {
    const lots = [culpBuy[0], { ...culpBuy[0], line: 7 }];
    expect(withoutRepeats(lots)).toHaveLength(2);
  });
});
