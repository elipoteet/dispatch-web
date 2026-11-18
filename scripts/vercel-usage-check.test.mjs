import { describe, expect, it } from "vitest";
import { activeCpu, bandFor, formatHours, issueText, toHours } from "./vercel-usage-check.mjs";

// The service rows `vercel billing usage --json` prints (vercel@65.11.0,
// serializeService): name and unit come from Vercel's API.
const row = (over) => ({ name: "Fluid Active CPU", product: "fluid_active_cpu", quantity: 2.9, unit: "hours", cost: 0, included: false, category: "usage", ...over });

describe("reading Vercel's usage report", () => {
  it("finds the Active CPU line and reads it in hours", () => {
    const usage = { period: { from: "2026-11-01", to: "2026-11-18" }, services: [row({ name: "Function Invocations", product: "function_invocations", quantity: 12000, unit: "invocations" }), row()] };
    expect(activeCpu(usage).hours).toBeCloseTo(2.9);
  });

  it("converts the units the API might use", () => {
    expect(toHours(3, "hours")).toBe(3);
    expect(toHours(1, "hour")).toBe(1);
    expect(toHours(2, "CPU Hours")).toBe(2);
    expect(toHours(90, "minutes")).toBe(1.5);
    expect(toHours(7200, "seconds")).toBe(2);
    expect(toHours(3_600_000, "ms")).toBe(1);
    expect(toHours(3_600_000, "milliseconds")).toBe(1);
    expect(toHours(5, "invocations")).toBeNull();
  });

  it("matches the line by product when the name differs", () => {
    expect(activeCpu({ services: [row({ name: "Compute", product: "active-cpu" })] }).hours).toBeCloseTo(2.9);
  });

  it("fails loudly rather than reporting zero", () => {
    expect(() => activeCpu({ services: [row({ name: "Edge Requests", product: "edge_requests" })] })).toThrow(/No Active CPU line/);
    expect(() => activeCpu({ services: [row({ unit: "widgets" })] })).toThrow(/unit/);
    expect(() => activeCpu({})).toThrow(/No Active CPU line/);
  });
});

describe("when to warn", () => {
  it("warns at 70%, again at 85% and at the limit", () => {
    expect(bandFor(0.69)).toBeNull();
    expect(bandFor(0.7)).toBe(0.7);
    expect(bandFor(0.9)).toBe(0.85);
    expect(bandFor(3.47)).toBe(1);
  });

  it("says it in plain words, with the figure and what to look at", () => {
    expect(formatHours(13 + 53 / 60)).toBe("13 h 53 min");
    expect(formatHours(2.8)).toBe("2 h 48 min");
    const { title, body } = issueText({ hours: 2.8, share: 0.7, band: 0.7, period: { from: "2026-12-17", to: "2027-01-05" } });
    expect(title).toBe("Vercel Active CPU at 70% of the Hobby limit");
    expect(body).toContain("2 h 48 min");
    expect(body).toContain("Firewall");
    expect(body).toContain("<!-- band:0.7 -->");
  });
});
