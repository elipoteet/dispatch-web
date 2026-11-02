import { describe, expect, it } from "vitest";
import { factorAt, needsSplitCheck, splitSteps, type DatedClose } from "./splits";

// A price series shaped like NVIDIA's: a 4-for-1 split on 20 July 2021 and a
// 10-for-1 on 10 June 2024, so a share before July 2021 is 40 shares today.
// The adjusted prices wander; the unadjusted ones are the adjusted times the
// splits still to come, which is the relationship the module relies on.
function sessions(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(from); d <= new Date(to); d = new Date(d.getTime() + 86_400_000)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const dates = sessions("2021-06-01", "2024-07-31");
const adjusted: DatedClose[] = dates.map((date, i) => ({ date, close: 15 + i * 0.13 + Math.sin(i / 7) * 2 }));
const truth = (date: string) => (date < "2021-07-20" ? 40 : date < "2024-06-10" ? 10 : 1);
const unadjusted: DatedClose[] = adjusted.map((b) => ({ date: b.date, close: Math.round(b.close * truth(b.date) * 100) / 100 }));

describe("splitSteps", () => {
  it("finds both splits, on the right days, with the right factors", () => {
    const steps = splitSteps(unadjusted, adjusted);
    expect(steps.map((s) => s.from)).toEqual(["2021-06-01", "2021-07-20", "2024-06-10"]);
    expect(steps[0].factor).toBeCloseTo(40, 2);
    expect(steps[1].factor).toBeCloseTo(10, 2);
    expect(steps[2].factor).toBeCloseTo(1, 2);
  });

  it("ignores a single bad print in either series", () => {
    const glitched = unadjusted.map((b) => (b.date === "2023-03-15" ? { ...b, close: b.close * 3 } : b));
    expect(splitSteps(glitched, adjusted)).toHaveLength(3);
  });

  it("matches only the dates both series have", () => {
    const sparse = adjusted.filter((_, i) => i % 3 !== 0);
    expect(splitSteps(unadjusted, sparse)).toHaveLength(3);
  });

  it("finds nothing to step when there was no split", () => {
    const flat = splitSteps(adjusted, adjusted);
    expect(flat).toHaveLength(1);
    expect(flat[0].factor).toBe(1);
  });

  it("handles a reverse split, where old shares become fewer", () => {
    // 1-for-8 on 1 March 2023: before it, one share counted is an eighth today.
    const t = (date: string) => (date < "2023-03-01" ? 1 / 8 : 1);
    const raw = adjusted.map((b) => ({ date: b.date, close: b.close * t(b.date) }));
    const steps = splitSteps(raw, adjusted);
    expect(steps).toHaveLength(2);
    expect(steps[0].factor).toBeCloseTo(0.125, 4);
    expect(steps[1].from).toBe("2023-03-01");
  });
});

describe("factorAt", () => {
  const steps = splitSteps(unadjusted, adjusted);

  it("gives the factor in force on a date", () => {
    // NVIDIA's cover page of 24 May 2024: 2,460M shares, so 24,600M today.
    expect(factorAt(steps, "2024-05-24")).toBeCloseTo(10, 2);
    expect(factorAt(steps, "2021-05-21")).toBeCloseTo(40, 2);
    expect(factorAt(steps, "2024-08-23")).toBeCloseTo(1, 2);
  });

  it("counts a split's own day as after it", () => {
    expect(factorAt(steps, "2024-06-10")).toBeCloseTo(1, 2);
    expect(factorAt(steps, "2024-06-07")).toBeCloseTo(10, 2);
  });

  it("is 1 when there are no steps", () => {
    expect(factorAt([], "2020-01-01")).toBe(1);
  });
});

describe("needsSplitCheck", () => {
  const steady = [
    { date: "2025-01-31", value: 15.0e9 },
    { date: "2025-04-30", value: 14.9e9 },
    { date: "2025-07-31", value: 14.8e9 },
  ];

  it("skips the extra request when counts only drift", () => {
    expect(needsSplitCheck(steady, 14.7e9)).toBe(false);
  });

  it("asks when a count jumps, as at a split", () => {
    expect(needsSplitCheck([{ date: "2024-05-24", value: 2.46e9 }, { date: "2024-08-23", value: 24.53e9 }], null)).toBe(true);
  });

  it("asks when today's count is far from the last filed one", () => {
    // A split since the last filing shows up only against the current count.
    expect(needsSplitCheck(steady, 14.8e9 * 3)).toBe(true);
  });

  it("orders by date before comparing", () => {
    expect(needsSplitCheck(steady.slice().reverse(), null)).toBe(false);
  });
});
