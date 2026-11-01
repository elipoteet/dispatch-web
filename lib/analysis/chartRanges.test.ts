import { describe, expect, it } from "vitest";
import { earningsMarkers, intradayCacheBucket, RANGES, takeRecentSessions, thinIntraday, toWeekly, type ChartPoint } from "./chartRanges";

const p = (date: string, close = 1): ChartPoint => ({ date, close });

describe("RANGES", () => {
  it("offers the brief's eight ranges in order", () => {
    expect(RANGES.map((r) => r.id)).toEqual(["1D", "1W", "1M", "3M", "1Y", "5Y", "10Y", "MAX"]);
  });

  it("asks the server only for 1D, 1W and MAX", () => {
    expect(RANGES.filter((r) => r.source === "intraday" || r.source === "monthly").map((r) => r.id)).toEqual(["1D", "1W", "MAX"]);
  });
});

describe("toWeekly", () => {
  it("keeps the last session of each week", () => {
    const daily = [p("2026-10-19", 1), p("2026-10-20", 2), p("2026-10-23", 3), p("2026-10-26", 4), p("2026-10-30", 5)];
    expect(toWeekly(daily)).toEqual([p("2026-10-23", 3), p("2026-10-30", 5)]);
  });

  it("treats a week split by a year end as one week", () => {
    expect(toWeekly([p("2025-12-31", 1), p("2026-01-02", 2), p("2026-01-05", 3)])).toEqual([p("2026-01-02", 2), p("2026-01-05", 3)]);
  });
});

describe("thinIntraday", () => {
  it("keeps the last 5-minute bar of each 30-minute block, per session", () => {
    const bars = ["09:30", "09:35", "09:55", "10:00", "10:05"].map((t, i) => p(`2026-10-30 ${t}:00`, i));
    expect(thinIntraday(bars, 30).map((b) => b.date)).toEqual(["2026-10-30 09:55:00", "2026-10-30 10:05:00"]);
  });
});

describe("takeRecentSessions", () => {
  it("means the latest session, so a weekend still shows Friday", () => {
    const bars = [p("2026-10-29 15:55:00"), p("2026-10-30 09:30:00"), p("2026-10-30 15:55:00")];
    expect(takeRecentSessions(bars, 1).map((b) => b.date)).toEqual(["2026-10-30 09:30:00", "2026-10-30 15:55:00"]);
  });
});

describe("intradayCacheBucket", () => {
  it("turns every five minutes while the market is open", () => {
    // 10:02 and 10:04 New York time (EDT) share a window; 10:06 starts the next.
    const a = intradayCacheBucket(new Date("2026-10-30T14:02:00Z"));
    expect(a).toBe(intradayCacheBucket(new Date("2026-10-30T14:04:00Z")));
    expect(a).not.toBe(intradayCacheBucket(new Date("2026-10-30T14:06:00Z")));
    expect(a.startsWith("2026-10-30-open-")).toBe(true);
  });

  it("holds one window all evening after the close", () => {
    expect(intradayCacheBucket(new Date("2026-10-30T21:00:00Z"))).toBe("2026-10-30-post");
    expect(intradayCacheBucket(new Date("2026-10-31T02:00:00Z"))).toBe("2026-10-30-post");
  });

  it("knows a weekend is closed all day", () => {
    expect(intradayCacheBucket(new Date("2026-10-31T15:00:00Z"))).toBe("2026-10-31-post");
  });

  it("follows New York's clock across the end of daylight saving (1 November 2026)", () => {
    // 14:00 UTC is 10:00 EDT on Friday 30 October, but 9:00 EST on Monday
    // 2 November: open on the first, still before the open on the second.
    expect(intradayCacheBucket(new Date("2026-10-30T14:00:00Z")).includes("-open-")).toBe(true);
    expect(intradayCacheBucket(new Date("2026-11-02T14:00:00Z"))).toBe("2026-11-02-pre");
    expect(intradayCacheBucket(new Date("2026-11-02T15:00:00Z")).includes("-open-")).toBe(true);
  });
});

describe("earningsMarkers", () => {
  const daily = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-31"].map((d, i) => p(d, i));

  it("marks the session each release fell on", () => {
    expect(earningsMarkers(daily, { dates: ["2026-08-26"], completeFrom: "2020-09-17" })).toEqual([p("2026-08-26", 2)]);
  });

  it("marks the next session when a release fell on a closed day", () => {
    expect(earningsMarkers(daily, { dates: ["2026-08-29"], completeFrom: "2020-09-17" })).toEqual([p("2026-08-31", 5)]);
  });

  it("marks nothing when the known dates don't reach back to the range's start", () => {
    // JPMorgan's recent filings only reach back to late 2025: a five-year line
    // with markers on its last year alone would read as "no earnings before".
    expect(earningsMarkers(daily, { dates: ["2026-08-26"], completeFrom: "2026-08-25" })).toEqual([]);
  });

  it("ignores releases outside the range", () => {
    expect(earningsMarkers(daily, { dates: ["2026-05-20", "2026-11-17"], completeFrom: "2020-01-01" })).toEqual([]);
  });
});
