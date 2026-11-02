import { describe, expect, it } from "vitest";
import { parseTenYear } from "./treasury";

// The first lines of the real file, 1 November 2026.
const CSV = `Date,"1 Mo","1.5 Month","2 Mo","3 Mo","4 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"
10/30/2026,4.06,4.09,4.16,4.16,4.18,4.25,4.36,4.56,4.65,4.71,4.80,4.94,5.34,5.31
10/29/2026,4.06,4.08,4.17,4.18,4.21,4.28,4.42,4.61,4.73,4.78,4.87,4.98,5.35,5.32
`;

describe("parseTenYear", () => {
  it("reads the newest day's 10-year yield", () => {
    expect(parseTenYear(CSV)).toEqual({ date: "2026-10-30", percent: 4.94 });
  });

  it("finds the column by name, wherever it sits", () => {
    const moved = `Date,"10 Yr","1 Mo"\n10/30/2026,4.94,4.06\n`;
    expect(parseTenYear(moved)).toEqual({ date: "2026-10-30", percent: 4.94 });
  });

  it("skips a day with the 10-year blank", () => {
    const gap = `Date,"10 Yr"\n10/31/2026,\n10/30/2026,4.94\n`;
    expect(parseTenYear(gap)).toEqual({ date: "2026-10-30", percent: 4.94 });
  });

  it("returns nothing for an empty year or a changed format", () => {
    expect(parseTenYear(`Date,"10 Yr"\n`)).toBeNull();
    expect(parseTenYear(`Date,"Ten Year"\n10/30/2026,4.94\n`)).toBeNull();
  });
});
