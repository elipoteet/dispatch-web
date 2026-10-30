import { describe, expect, it } from "vitest";
import { detectAlerts, maState, rsiState, type TickerState } from "./alertState";

describe("rsiState", () => {
  it("classifies overbought above 70", () => {
    expect(rsiState(71)).toBe("overbought");
  });
  it("classifies oversold below 30", () => {
    expect(rsiState(29)).toBe("oversold");
  });
  it("classifies the boundary values and the middle as neutral", () => {
    expect(rsiState(70)).toBe("neutral");
    expect(rsiState(30)).toBe("neutral");
    expect(rsiState(50)).toBe("neutral");
  });
  it("returns null when RSI is unavailable", () => {
    expect(rsiState(null)).toBeNull();
  });
});

describe("maState", () => {
  it("is golden when the 50-day is above the 200-day", () => {
    expect(maState(110, 100)).toBe("golden");
  });
  it("is death when the 50-day is below the 200-day", () => {
    expect(maState(90, 100)).toBe("death");
  });
  it("is none when they're equal", () => {
    expect(maState(100, 100)).toBe("none");
  });
  it("returns null when either average is unavailable", () => {
    expect(maState(null, 100)).toBeNull();
    expect(maState(100, null)).toBeNull();
  });
});

function state(overrides: Partial<TickerState>): TickerState {
  return { rsiState: "neutral", maState: "none", ...overrides };
}

describe("detectAlerts", () => {
  it("never alerts when establishing a baseline (previous === null)", () => {
    const current = state({ rsiState: "overbought", maState: "golden" });
    expect(detectAlerts(null, current)).toEqual([]);
  });

  it("does not fire when nothing changed", () => {
    expect(detectAlerts(state({}), state({}))).toEqual([]);
  });

  it("fires an rsi alert when entering overbought", () => {
    const previous = state({ rsiState: "neutral" });
    const current = state({ rsiState: "overbought" });
    expect(detectAlerts(previous, current)).toContainEqual({ type: "rsi", oldValue: "neutral", newValue: "overbought" });
  });

  it("fires an rsi alert when entering oversold", () => {
    const previous = state({ rsiState: "neutral" });
    const current = state({ rsiState: "oversold" });
    expect(detectAlerts(previous, current)).toContainEqual({ type: "rsi", oldValue: "neutral", newValue: "oversold" });
  });

  it("does not fire when leaving overbought back to neutral", () => {
    const previous = state({ rsiState: "overbought" });
    const current = state({ rsiState: "neutral" });
    expect(detectAlerts(previous, current)).toEqual([]);
  });

  it("fires when swinging directly from overbought to oversold (still entering a new non-neutral state)", () => {
    const previous = state({ rsiState: "overbought" });
    const current = state({ rsiState: "oversold" });
    expect(detectAlerts(previous, current)).toContainEqual({ type: "rsi", oldValue: "overbought", newValue: "oversold" });
  });

  it("fires an ma_cross alert on a golden cross", () => {
    const previous = state({ maState: "death" });
    const current = state({ maState: "golden" });
    expect(detectAlerts(previous, current)).toContainEqual({ type: "ma_cross", oldValue: "death", newValue: "golden" });
  });

  it("fires an ma_cross alert on a death cross", () => {
    const previous = state({ maState: "golden" });
    const current = state({ maState: "death" });
    expect(detectAlerts(previous, current)).toContainEqual({ type: "ma_cross", oldValue: "golden", newValue: "death" });
  });

  it("does not fire when the MA relationship becomes 'none'", () => {
    const previous = state({ maState: "golden" });
    const current = state({ maState: "none" });
    expect(detectAlerts(previous, current)).toEqual([]);
  });

  it("does not fire when the MA relationship is unchanged", () => {
    const previous = state({ maState: "golden" });
    const current = state({ maState: "golden" });
    expect(detectAlerts(previous, current)).toEqual([]);
  });

  it("fires both alert types together when both change the same day", () => {
    const previous: TickerState = { rsiState: "neutral", maState: "death" };
    const current: TickerState = { rsiState: "overbought", maState: "golden" };
    const alerts = detectAlerts(previous, current);
    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.type).sort()).toEqual(["ma_cross", "rsi"]);
  });
});
