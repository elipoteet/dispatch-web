// Form 4 reading, on seven real filings saved from EDGAR (November 2026). The
// expected values were read off each filing by hand.

import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { form4XmlName, parseForm4 } from "./form4";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "__fixtures__", "form4", `${name}.xml`), "utf8");
const parse = (name: string) => parseForm4(fixture(name))!;

describe("parseForm4", () => {
  it("reads a sale made under a 10b5-1 plan (NVIDIA, 2026)", () => {
    const f = parse("nvda-2026-sale-on-plan");
    expect(f.documentType).toBe("4");
    expect(f.owners).toEqual([{ name: "Teter Timothy S.", cik: "0001696841", role: "EVP, General Counsel and Sec" }]);
    expect(f.trades).toHaveLength(3);
    expect(f.trades[0]).toEqual({
      line: 0,
      isDerivative: false,
      security: "Common Stock",
      date: "2026-09-21",
      code: "S",
      acquiredDisposed: "D",
      shares: 12483,
      price: 222.1932,
      sharesAfter: 2705637,
      ownership: "I",
      onPlan: true,
    });
  });

  it("reads an open-market purchase by a director who is also an officer (Culp)", () => {
    const f = parse("culp-2026-purchase");
    expect(f.owners[0].role).toBe("Director, President & CEO");
    const t = f.trades[0];
    expect([t.code, t.date, t.shares, t.price, t.sharesAfter, t.onPlan]).toEqual(["P", "2026-09-28", 2960, 3.89, 136919, false]);
  });

  it("reads option exercises and tax withholding, derivative lines after the rest (Culp)", () => {
    const f = parse("culp-2026-exercise-and-tax");
    expect(f.trades.map((t) => t.code).join("")).toBe("MMFMM");
    expect(f.trades.map((t) => t.isDerivative)).toEqual([false, false, false, true, true]);
    const tax = f.trades[2];
    expect([tax.shares, tax.price, tax.acquiredDisposed]).toEqual([5205, 3.7, "D"]);
    expect(f.trades.every((t) => !t.onPlan)).toBe(true);
  });

  it("flags only the footnoted sales as on a plan, not the vesting beside them (Apple)", () => {
    // The 10b5-1 box is ticked for the whole filing; the footnote is on the
    // sales alone.
    const f = parse("aapl-2026-vest-tax-sales");
    const sales = f.trades.filter((t) => t.code === "S");
    expect(sales.length).toBeGreaterThan(0);
    expect(sales.every((t) => t.onPlan)).toBe(true);
    expect(f.trades.filter((t) => t.code !== "S").every((t) => !t.onPlan)).toBe(true);
    // A vesting with no price filed reads as no price, not zero.
    expect(f.trades[0]).toMatchObject({ code: "M", price: null, shares: 1714 });
  });

  it("finds a plan from the footnote alone, in a filing from before the checkbox (NVIDIA, 2021)", () => {
    const f = parse("nvda-2021-sales-footnoted-plan");
    expect(f.trades.length).toBe(16);
    expect(f.trades.every((t) => t.code === "S" && t.onPlan)).toBe(true);
  });

  it("reads a gift, with no price, and a filing with no trades at all (JPMorgan)", () => {
    const gift = parse("jpm-2026-gift").trades[0];
    expect([gift.code, gift.shares, gift.price, gift.onPlan]).toEqual(["G", 30000, 0, false]);
    const empty = parse("jpm-2026-no-transactions");
    expect(empty.trades).toEqual([]);
    expect(empty.owners[0]).toEqual({ name: "Lake Marianne", cik: "0001566079", role: "CEO CCB" });
  });

  it("refuses anything that isn't a Form 4", () => {
    expect(parseForm4("<html>not a filing</html>")).toBeNull();
    expect(parseForm4("<ownershipDocument><documentType>3</documentType></ownershipDocument>")).toBeNull();
  });

  it("doesn't take a footnote saying the trade was not under a plan as a plan", () => {
    const xml = fixture("culp-2026-purchase").replace(
      "</footnotes>",
      '<footnote id="F99">This purchase was not made pursuant to a Rule 10b5-1 trading plan.</footnote></footnotes>',
    ).replace("<transactionCode>P</transactionCode>", '<transactionCode>P</transactionCode><footnoteId id="F99"/>');
    expect(parseForm4(xml)!.trades[0].onPlan).toBe(false);
  });
});

describe("form4XmlName", () => {
  it("drops the rendering folder from the submissions file's document name", () => {
    expect(form4XmlName("xslF345X06/wk-form4_1791579847.xml")).toBe("wk-form4_1791579847.xml");
    expect(form4XmlName("form4.xml")).toBe("form4.xml");
  });
});
