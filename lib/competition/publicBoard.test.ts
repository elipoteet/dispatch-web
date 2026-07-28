import { describe, expect, it } from "vitest";
import { pickLatestSnapshot } from "./publicBoard";

describe("pickLatestSnapshot", () => {
  it("returns an empty array for no rows", () => {
    expect(pickLatestSnapshot([])).toEqual([]);
  });

  it("keeps only the rows from the most recent snapshot date", () => {
    const rows = [
      { snapshotDate: "2026-07-01", rank: 1, handle: "early", returnPct: 5 },
      { snapshotDate: "2026-07-15", rank: 2, handle: "mid", returnPct: 8 },
      { snapshotDate: "2026-07-15", rank: 1, handle: "leader", returnPct: 12 },
    ];
    const result = pickLatestSnapshot(rows);
    expect(result.every((r) => r.snapshotDate === "2026-07-15")).toBe(true);
    expect(result.map((r) => r.handle)).toEqual(["leader", "mid"]);
  });

  it("sorts the result by rank ascending regardless of input order", () => {
    const rows = [
      { snapshotDate: "2026-07-15", rank: 3, handle: "third", returnPct: 1 },
      { snapshotDate: "2026-07-15", rank: 1, handle: "first", returnPct: 9 },
      { snapshotDate: "2026-07-15", rank: 2, handle: "second", returnPct: 5 },
    ];
    expect(pickLatestSnapshot(rows).map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});
