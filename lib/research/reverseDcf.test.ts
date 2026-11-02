import { describe, expect, it } from "vitest";
import { impliedGrowth, presentValue } from "./reverseDcf";

// The hand-built case. $100 of free cash flow, 10% required return, 3%
// terminal growth, ten years. Worked with the closed-form formulas, not this
// module's loop:
//   no growth:  100 x annuity factor 6.144567 = 614.457, plus a terminal value
//               of 100 x 1.03 / 0.07 = 1,471.43 discounted by 1.1^10 = 567.30,
//               for 1,181.7561 in all.
//   5% growth:  growing annuity 100 x 1.05 / 0.05 x (1 - (1.05/1.1)^10) =
//               781.1803; year-10 cash flow 162.8895, terminal value
//               162.8895 x 1.03 / 0.07 discounted by 1.1^10 = 924.0709;
//               1,705.2512 in all.
const base = { baseFcf: 100, requiredReturn: 0.1, terminalGrowth: 0.03, years: 10 };

describe("presentValue", () => {
  it("matches the hand-built case with no growth", () => {
    expect(presentValue(base, 0)).toBeCloseTo(1181.7561, 3);
  });

  it("matches the hand-built case at 5% growth", () => {
    expect(presentValue(base, 0.05)).toBeCloseTo(1705.2512, 3);
  });
});

describe("impliedGrowth", () => {
  it("recovers no growth from the no-growth value", () => {
    const r = impliedGrowth({ ...base, marketValue: 1181.7561 });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.growth).toBeCloseTo(0, 4);
  });

  it("recovers 5% from the 5% value, with the year-10 cash flow", () => {
    const r = impliedGrowth({ ...base, marketValue: 1705.2512 });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.growth).toBeCloseTo(0.05, 4);
      expect(r.endFcf).toBeCloseTo(162.8895, 1);
    }
  });

  it("lands near 22% at NVIDIA's mockup inputs ($5.77T, $96.7B, 10%, 3%, 10 years)", () => {
    const r = impliedGrowth({ marketValue: 5.77e12, baseFcf: 96.7e9, requiredReturn: 0.1, terminalGrowth: 0.03, years: 10 });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.growth).toBeGreaterThan(0.21);
    if (r.kind === "ok") expect(r.growth).toBeLessThan(0.23);
  });

  it("implies more growth over a shorter horizon, and less at a lower required return", () => {
    const g = (over: Partial<typeof base>) => {
      const r = impliedGrowth({ ...base, ...over, marketValue: 3000 });
      return r.kind === "ok" ? r.growth : NaN;
    };
    expect(g({ years: 5 })).toBeGreaterThan(g({ years: 10 }));
    expect(g({ requiredReturn: 0.08 })).toBeLessThan(g({ requiredReturn: 0.12 }));
  });

  it("can imply a decline when the price is low against the cash flow", () => {
    const r = impliedGrowth({ ...base, marketValue: 900 });
    expect(r.kind === "ok" && r.growth < 0).toBe(true);
  });

  it("does not run without positive free cash flow", () => {
    expect(impliedGrowth({ ...base, baseFcf: -5, marketValue: 1000 })).toEqual({ kind: "not-applicable", reason: "no-fcf" });
    expect(impliedGrowth({ ...base, baseFcf: 0, marketValue: 1000 })).toEqual({ kind: "not-applicable", reason: "no-fcf" });
  });

  it("does not run when the required return isn't above terminal growth", () => {
    expect(impliedGrowth({ ...base, requiredReturn: 0.03, marketValue: 1000 })).toEqual({ kind: "not-applicable", reason: "inputs" });
  });

  it("says when the price needs more growth than the search range allows", () => {
    expect(impliedGrowth({ ...base, marketValue: 1e9 })).toEqual({ kind: "out-of-range", direction: "above" });
  });
});
