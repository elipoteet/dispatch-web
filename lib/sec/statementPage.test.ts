// The balance sheet read off a filing's statement page, on saved real pages
// (lib/sec/__fixtures__/statements, trimmed to the statement table).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { balanceSheetFile, parseStatementPage, securitiesOnBalanceSheet, shortTermDebtOnBalanceSheet, type StatementPage } from "@/lib/sec/statementPage";

const dir = join(__dirname, "__fixtures__", "statements");
const read = (name: string) => readFileSync(join(dir, name), "utf8");
const COUNTED = new Set(["CashAndCashEquivalentsAtCarryingValue", "ShortTermInvestments", "MarketableSecuritiesCurrent"]);

describe("finding the balance sheet page", () => {
  it("takes the balance sheet from the filing's list of pages, not its parenthetical", () => {
    expect(balanceSheetFile(read("nvda-2026-FilingSummary.xml"))).toBe("R5.htm");
  });

  it("knows an investment company's statement of assets and liabilities, and returns null for none", () => {
    const xml = (short: string) =>
      `<FilingSummary><MyReports><Report><ShortName>${short}</ShortName><HtmlFileName>R2.htm</HtmlFileName><MenuCategory>Statements</MenuCategory></Report></MyReports></FilingSummary>`;
    expect(balanceSheetFile(xml("Consolidated Statements of Assets and Liabilities"))).toBe("R2.htm");
    expect(balanceSheetFile(xml("Consolidated Statements of Operations"))).toBeNull();
  });
});

describe("reading the page", () => {
  const page = parseStatementPage(read("nvda-2026-balance-sheet.htm"));

  it("reads the scale, every line's element and both columns", () => {
    expect(page.scale).toBe(1e6);
    const cash = page.rows.find((r) => r.element === "CashAndCashEquivalentsAtCarryingValue");
    expect(cash?.values).toEqual([10_605e6, 8_589e6]);
    const securities = page.rows.find((r) => r.label === "Marketable securities");
    expect(securities).toMatchObject({ prefix: "nvda", element: "MarketableSecuritiesAndEquitySecuritiesFVNI", values: [51_951e6, 34_621e6] });
  });

  it("finds NVIDIA's $52.0B of marketable securities, which the frames can't see", () => {
    const r = securitiesOnBalanceSheet(page, { value: 10_605e6, tag: "CashAndCashEquivalentsAtCarryingValue" }, COUNTED);
    expect(r).toEqual({
      ok: true,
      added: [{ element: "nvda:MarketableSecuritiesAndEquitySecuritiesFVNI", label: "Marketable securities", value: 51_951e6 }],
    });
  });

  it("reads the column whose cash matches, so a 10-Q's year-end column works too (Fulcrum)", () => {
    const fulc = parseStatementPage(read("fulc-2026-q3-balance-sheet.htm"));
    const yearEnd = securitiesOnBalanceSheet(fulc, { value: 197_533e3, tag: "CashAndCashEquivalentsAtCarryingValue" }, COUNTED);
    expect(yearEnd.ok).toBe(true);
    if (yearEnd.ok) expect(yearEnd.added.map((a) => a.element)).toEqual(["us-gaap:MarketableSecurities"]);
  });

  it("accepts a cash line labelled plain Cash, and adds nothing when there's nothing to add (Eversource)", () => {
    const es = parseStatementPage(read("es-2025-balance-sheet.htm"));
    expect(securitiesOnBalanceSheet(es, { value: 135_351e3, tag: "CashAndCashEquivalentsAtCarryingValue" }, COUNTED)).toEqual({ ok: true, added: [] });
  });

  it("trusts nothing when the cash doesn't match any column", () => {
    const r = securitiesOnBalanceSheet(page, { value: 12_000e6, tag: "CashAndCashEquivalentsAtCarryingValue" }, COUNTED);
    expect(r.ok).toBe(false);
  });

  it("never adds a line the cash figure already counted", () => {
    const counted = new Set([...COUNTED, "MarketableSecuritiesAndEquitySecuritiesFVNI"]);
    expect(securitiesOnBalanceSheet(page, { value: 10_605e6, tag: "CashAndCashEquivalentsAtCarryingValue" }, counted)).toEqual({ ok: true, added: [] });
  });
});

describe("debt due within a year on the page", () => {
  it("fills a heading with no figure from the businesses' blocks, once they add up (Caterpillar)", () => {
    const cat = parseStatementPage(read("cat-2025-balance-sheet.htm"));
    const r = shortTermDebtOnBalanceSheet(cat, { value: 9_980e6, tag: "CashAndCashEquivalentsAtCarryingValue" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines.map((l) => [l.label, l.value])).toEqual([
      ["Short-term borrowings", 5_514e6],
      ["Long-term debt due within one year", 35e6],
      ["Long-term debt due within one year", 7_085e6],
    ]);
  });

  it("refuses the blocks when they don't add up to the consolidated line", () => {
    const cat = parseStatementPage(read("cat-2025-balance-sheet.htm"));
    // Change one block's short-term borrowings: the check against the
    // consolidated $5.51B now fails.
    let seen = 0;
    const altered: StatementPage = {
      ...cat,
      rows: cat.rows.map((row) => (row.label === "Short-term borrowings" && ++seen === 3 ? { ...row, values: row.values.map((v) => (v == null ? v : v + 1e9)) } : row)),
    };
    expect(shortTermDebtOnBalanceSheet(altered, { value: 9_980e6, tag: "CashAndCashEquivalentsAtCarryingValue" }).ok).toBe(false);
  });

  it("reads plain debt lines and leaves trade payables and leases alone (NVIDIA)", () => {
    const r = shortTermDebtOnBalanceSheet(parseStatementPage(read("nvda-2026-balance-sheet.htm")), { value: 10_605e6, tag: "CashAndCashEquivalentsAtCarryingValue" });
    expect(r).toEqual({ ok: true, lines: [{ element: "us-gaap:DebtCurrent", label: "Short-term debt", value: 999e6 }] });
  });
});
