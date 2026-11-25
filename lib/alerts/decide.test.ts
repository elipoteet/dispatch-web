import { describe, expect, it } from "vitest";
import { rsi, sma } from "@/lib/analysis/indicators";
import { decide, stateFromCloses, type Previous } from "./decide";
import type { TickerState } from "@/lib/analysis/alertState";

// Wednesday 25 November 2026, 00:23 UTC: 7:23 pm on Tuesday in New York, so
// the latest finished session is Tuesday 24 November.
const NOW = new Date("2026-11-25T00:23:00Z");
const NEUTRAL_GOLDEN: TickerState = { rsiState: "neutral", maState: "golden" };
const OVERBOUGHT_GOLDEN: TickerState = { rsiState: "overbought", maState: "golden" };

const checked = (iso: string, state: TickerState = NEUTRAL_GOLDEN): Previous => ({ state, checkedAt: iso });

describe("decide", () => {
  it("skips prices that don't reach the latest session", () => {
    expect(decide({ through: "2026-11-23", now: NOW, previous: checked("2026-11-24T00:23:00Z"), current: OVERBOUGHT_GOLDEN })).toEqual({
      outcome: "stale",
      through: "2026-11-23",
      latest: "2026-11-24",
    });
  });

  it("records a first check without alerting", () => {
    expect(decide({ through: "2026-11-24", now: NOW, previous: null, current: OVERBOUGHT_GOLDEN }).outcome).toBe("baseline");
  });

  it("alerts on a change since the session before", () => {
    // Last checked Tuesday 00:23 UTC, which saw Monday's session.
    const d = decide({ through: "2026-11-24", now: NOW, previous: checked("2026-11-24T00:23:00Z"), current: OVERBOUGHT_GOLDEN });
    expect(d).toEqual({ outcome: "compared", lastSession: "2026-11-23", alerts: [{ type: "rsi", oldValue: "neutral", newValue: "overbought" }] });
  });

  it("still alerts after one missed night", () => {
    const d = decide({ through: "2026-11-24", now: NOW, previous: checked("2026-11-21T00:23:00Z"), current: OVERBOUGHT_GOLDEN });
    // Checked Friday evening (Friday's session), then Monday night's run
    // missed: Monday and Tuesday since, two sessions.
    expect(d.outcome).toBe("compared");
  });

  it("re-baselines quietly after an outage instead of sending old changes", () => {
    // The live table on 25 November 2026: six tickers last checked on 19
    // November, others in August.
    for (const iso of ["2026-11-19T21:47:00Z", "2026-11-14T21:47:00Z", "2026-08-29T21:30:00Z"]) {
      const d = decide({ through: "2026-11-24", now: NOW, previous: checked(iso), current: OVERBOUGHT_GOLDEN });
      expect(d.outcome).toBe("re-baselined");
    }
  });

  it("does nothing new on a night with no new session", () => {
    // Sunday night: Friday's session, already checked on Saturday morning UTC.
    const d = decide({ through: "2026-11-27", now: new Date("2026-11-30T00:23:00Z"), previous: checked("2026-11-28T00:23:00Z"), current: OVERBOUGHT_GOLDEN });
    expect(d).toEqual({ outcome: "already checked", lastSession: "2026-11-27" });
  });

  it("treats Thanksgiving as no session", () => {
    // Friday 00:23 UTC is Thursday evening in New York: still Wednesday's session.
    const d = decide({ through: "2026-11-25", now: new Date("2026-11-27T00:23:00Z"), previous: checked("2026-11-26T00:23:00Z"), current: OVERBOUGHT_GOLDEN });
    expect(d.outcome).toBe("already checked");
  });
});

describe("stateFromCloses", () => {
  it("uses the last five years, as the research report did", () => {
    const closes = Array.from({ length: 5000 }, (_, i) => 100 + Math.sin(i / 9) * 10 + i / 100);
    const recent = closes.slice(-1300);
    const ma50 = sma(recent, 50).at(-1)!;
    const ma200 = sma(recent, 200).at(-1)!;
    const r = rsi(recent, 14)!;
    const s = stateFromCloses(closes);
    expect(s.maState).toBe(ma50 > ma200 ? "golden" : "death");
    expect(s.rsiState).toBe(r > 70 ? "overbought" : r < 30 ? "oversold" : "neutral");
  });
});
