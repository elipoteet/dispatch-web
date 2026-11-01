// The Twelve Data gate in lib/providers.ts, against a pretend Twelve Data: no
// real request is made, so no allowance is spent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMonthlyPrices, NoTickerDataError, splitAdjust, TwelveDataBusyError } from "@/lib/providers";

// NVIDIA's 10-for-1 split, as Tiingo reports it (raw closes, splitFactor 10
// on the first day after the split). Twelve Data gives 122.44, 121.00 and
// 120.89 for the three days before; the fallback must agree with it.
describe("splitAdjust (the Tiingo fallback)", () => {
  const row = (date: string, close: number, splitFactor = 1) => ({ date, open: close, high: close, low: close, close, volume: 100, splitFactor });
  const adjusted = splitAdjust([
    row("2024-06-05", 1224.4),
    row("2024-06-06", 1209.98),
    row("2024-06-07", 1208.88),
    row("2024-06-10", 121.79, 10),
    row("2024-06-11", 120.91),
  ]);

  it("divides every price before a split by its factor, matching Twelve Data", () => {
    expect(adjusted.map((r) => Number(r.close.toFixed(2)))).toEqual([122.44, 121.0, 120.89, 121.79, 120.91]);
  });

  it("multiplies the volume before a split by the same factor", () => {
    expect(adjusted.map((r) => r.volume)).toEqual([1000, 1000, 1000, 100, 100]);
  });

  it("compounds successive splits", () => {
    const twice = splitAdjust([row("2021-07-19", 800), row("2021-07-20", 200, 4), row("2024-06-10", 120, 10)]);
    expect(twice.map((r) => r.close)).toEqual([20, 20, 120]);
  });
});

const ok = () =>
  new Response(
    JSON.stringify({
      status: "ok",
      values: [
        { datetime: "2026-10-01", open: "1", high: "1", low: "1", close: "2", volume: "1" },
        { datetime: "2026-09-01", open: "1", high: "1", low: "1", close: "1", volume: "1" },
      ],
    }),
    { status: 200 },
  );

let minute = 0;
// Each test starts in a fresh calendar minute, since the gate counts per minute.
function nextMinute() {
  minute += 2;
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 2, 15, minute, 1)));
}

beforeEach(() => {
  vi.useFakeTimers();
  nextMinute();
  vi.stubEnv("TWELVE_DATA_API_KEY", "test");
  vi.stubEnv("TWELVE_DATA_FORCE_BUSY", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("the Twelve Data gate", () => {
  it("lets seven requests through in a minute and stops the eighth without calling", async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 7; i++) await fetchMonthlyPrices("NVDA");
    await expect(fetchMonthlyPrices("NVDA")).rejects.toBeInstanceOf(TwelveDataBusyError);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("opens again when the minute turns", async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 7; i++) await fetchMonthlyPrices("NVDA");
    nextMinute();
    await expect(fetchMonthlyPrices("NVDA")).resolves.toHaveLength(2);
  });

  it("treats Twelve Data's own 429 as busy, and stops asking for the rest of the minute", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 429, status: "error" }), { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchMonthlyPrices("NVDA")).rejects.toBeInstanceOf(TwelveDataBusyError);
    await expect(fetchMonthlyPrices("NVDA")).rejects.toBeInstanceOf(TwelveDataBusyError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads a rate-limit message in a 200 body as busy, not as an unknown ticker", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: 429, status: "error", message: "run out of API credits" }), { status: 200 })));
    await expect(fetchMonthlyPrices("NVDA")).rejects.toBeInstanceOf(TwelveDataBusyError);
  });

  it("still reports an unknown ticker as one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await expect(fetchMonthlyPrices("ZZZZZZ")).rejects.toBeInstanceOf(NoTickerDataError);
  });

  it("can be forced to busy for testing the fallbacks, without calling Twelve Data", async () => {
    vi.stubEnv("TWELVE_DATA_FORCE_BUSY", "1");
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchMonthlyPrices("NVDA")).rejects.toBeInstanceOf(TwelveDataBusyError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
