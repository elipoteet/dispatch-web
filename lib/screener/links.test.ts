import { describe, expect, it } from "vitest";
import { needsFullLoad } from "@/lib/screener/links";

describe("which screener links are full page loads", () => {
  it("loads /screener with a query string in full, and moves client-side everywhere else", () => {
    expect(needsFullLoad("/screener?revenue=100m..&edit=1")).toBe(true);
    expect(needsFullLoad("/screener?edit=1")).toBe(true);
    expect(needsFullLoad("/screener")).toBe(false);
    expect(needsFullLoad("/screener/the-compounder")).toBe(false);
    expect(needsFullLoad("/screener/the-compounder?sort=revenue")).toBe(false);
    expect(needsFullLoad("/research/nvda")).toBe(false);
  });
});
