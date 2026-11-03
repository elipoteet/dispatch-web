import { describe, expect, it } from "vitest";
import { isAtClose, marketsCacheBucket, stripItems } from "./markets";

// New York is UTC-5 from 2 November 2026 (standard time) and UTC-4 before.
const ny = (iso: string) => new Date(iso);

describe("marketsCacheBucket: one shared quote per five minutes of trading", () => {
  it("turns every five minutes while the market is open", () => {
    const a = marketsCacheBucket(ny("2026-11-02T15:02:00Z")); // Mon 10:02
    expect(a).toBe(marketsCacheBucket(ny("2026-11-02T15:04:00Z")));
    expect(a).not.toBe(marketsCacheBucket(ny("2026-11-02T15:06:00Z")));
  });

  it("keeps one bucket from a close to the next open, weekend included", () => {
    const friday = marketsCacheBucket(ny("2026-10-30T20:30:00Z")); // Fri 4:30 pm (EDT)
    expect(friday).toBe("closed-after-2026-10-30");
    expect(marketsCacheBucket(ny("2026-10-31T16:00:00Z"))).toBe(friday); // Sat noon
    expect(marketsCacheBucket(ny("2026-11-02T14:00:00Z"))).toBe(friday); // Mon 9:00 am (EST)
    expect(marketsCacheBucket(ny("2026-11-02T14:31:00Z"))).not.toBe(friday); // Mon 9:31
  });

  it("counts the time until 4:15 as open, for prices still settling", () => {
    expect(marketsCacheBucket(ny("2026-11-02T21:10:00Z"))).toContain("-open-"); // Mon 4:10 pm
    expect(marketsCacheBucket(ny("2026-11-02T21:20:00Z"))).toBe("closed-after-2026-11-02"); // Mon 4:20 pm
    expect(marketsCacheBucket(ny("2026-11-03T13:00:00Z"))).toBe("closed-after-2026-11-02"); // Tue 8:00 am
  });
});

describe("isAtClose", () => {
  it("is false during the session and true outside it", () => {
    expect(isAtClose(ny("2026-11-02T15:00:00Z"))).toBe(false); // Mon 10:00
    expect(isAtClose(ny("2026-11-02T21:05:00Z"))).toBe(true); // Mon 4:05 pm
    expect(isAtClose(ny("2026-11-02T14:00:00Z"))).toBe(true); // Mon 9:00 am
    expect(isAtClose(ny("2026-10-31T16:00:00Z"))).toBe(true); // Saturday
  });
});

describe("stripItems", () => {
  const spy = { symbol: "SPY", price: 712.344, changePct: 0.4213 };
  const gld = { symbol: "GLD", price: 1234.5, changePct: -1.2 };
  const treasury = { date: "2026-10-30", percent: 4.94, previous: { date: "2026-10-29", percent: 4.98 } };

  it("shows each fund's price and day's change, as the old tape did", () => {
    expect(stripItems([spy], null)).toEqual([{ symbol: "SPY", value: "$712.34", change: "+0.42%", direction: "up" }]);
    expect(stripItems([gld], null)[0]).toMatchObject({ value: "$1,234.50", change: "-1.20%", direction: "down" });
  });

  it("ends with the 10-year yield and its change", () => {
    const items = stripItems([spy], treasury);
    expect(items.at(-1)).toMatchObject({ symbol: "10Y", value: "4.94%", change: "-0.04", direction: "down" });
    expect(items.at(-1)!.title).toContain("Oct 30");
  });

  it("leaves out a fund whose quote failed", () => {
    expect(stripItems([spy, null, gld], null).map((i) => i.symbol)).toEqual(["SPY", "GLD"]);
  });

  it("is empty when every fund failed, even with the yield", () => {
    expect(stripItems([null, null, null, null, null], treasury)).toEqual([]);
  });

  it("calls an unchanged day flat", () => {
    expect(stripItems([{ symbol: "DIA", price: 400, changePct: 0.001 }], null)[0]).toMatchObject({ change: "0.00%", direction: "flat" });
  });
});
