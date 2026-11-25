import { describe, expect, it, vi } from "vitest";

// tickerChart.ts wraps its lookup in Next's data cache; the logic under test
// takes the lookup as an argument, so the cache itself isn't needed here.
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

const { dailyHistoryFrom } = await import("./tickerChart");

const bars = (through: string) => [
  { date: "2026-11-01", close: 1, high: 1, low: 1, volume: 1 },
  { date: through, close: 2, high: 2, low: 2, volume: 1 },
];
// Wednesday 25 November 2026, 3 pm UTC (10 am in New York): the latest
// finished session is Tuesday 24 November.
const NOW = new Date("2026-11-25T15:00:00Z");

describe("dailyHistoryFrom", () => {
  it("returns the latest session's prices when they can be had", async () => {
    const lookup = vi.fn(async (session: string) => bars(session));
    const h = await dailyHistoryFrom(lookup, "AAPL", NOW);
    expect(h).toEqual({ bars: bars("2026-11-24"), through: "2026-11-24", current: true });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("falls back to the newest stored copy, marked as not current", async () => {
    // Only Friday's copy is stored; the latest can't be fetched.
    const lookup = vi.fn(async (session: string) => {
      if (session === "2026-11-20") return bars("2026-11-20");
      throw new Error(session === "2026-11-24" ? "Twelve Data not asked: out for the day" : "not stored");
    });
    const h = await dailyHistoryFrom(lookup, "AAPL", NOW);
    expect(h).toEqual({ bars: bars("2026-11-20"), through: "2026-11-20", current: false });
  });

  it("looks back ten sessions and no further", async () => {
    const asked: string[] = [];
    const lookup = async (session: string) => {
      asked.push(session);
      throw new Error("nothing");
    };
    expect(await dailyHistoryFrom(lookup, "AAPL", NOW)).toBeNull();
    expect(asked[0]).toBe("2026-11-24");
    expect(asked.length).toBe(11);
    expect(asked.at(-1)).toBe("2026-11-10");
  });
});
