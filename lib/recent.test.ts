import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRecent,
  clearRecent,
  getRecentSnapshot,
  getServerRecentSnapshot,
  parseRecent,
  readRecent,
  RECENT_KEEP,
  RECENT_KEY,
  recentHref,
  removeRecent,
  tabFromPath,
  viewedLabel,
} from "./recent";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

let store: Storage;
beforeEach(() => {
  store = memoryStorage();
  vi.stubGlobal("localStorage", store);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recently viewed", () => {
  it("starts empty and adds a company, uppercased, under its own key", () => {
    expect(readRecent()).toEqual([]);
    addRecent({ symbol: "nvda", name: "NVIDIA Corporation", tab: "overview", viewedAt: 1_000 });
    expect(readRecent()).toEqual([{ symbol: "NVDA", name: "NVIDIA Corporation", tab: "overview", viewedAt: 1_000 }]);
    expect(JSON.parse(store.getItem(RECENT_KEY)!)).toHaveLength(1);
  });

  it("moves a company already listed to the top and updates its tab", () => {
    addRecent({ symbol: "NVDA", name: "NVIDIA", tab: "overview", viewedAt: 1_000 });
    addRecent({ symbol: "COST", name: "Costco", tab: "valuation", viewedAt: 2_000 });
    addRecent({ symbol: "JPM", name: "JPMorgan Chase", tab: "insiders", viewedAt: 3_000 });
    expect(readRecent().map((e) => e.symbol)).toEqual(["JPM", "COST", "NVDA"]);
    addRecent({ symbol: "NVDA", name: "NVIDIA", tab: "financials", viewedAt: 4_000 });
    const list = readRecent();
    expect(list.map((e) => e.symbol)).toEqual(["NVDA", "JPM", "COST"]);
    expect(list[0].tab).toBe("financials");
  });

  it("keeps the newest twelve", () => {
    const symbols = "ABCDEFGHIJKLMNO".split("").map((c) => `X${c}`);
    symbols.forEach((symbol, i) => addRecent({ symbol, name: symbol, tab: "overview", viewedAt: 1_000 + i }));
    const list = readRecent();
    expect(list).toHaveLength(RECENT_KEEP);
    expect(list[0].symbol).toBe("XO");
    expect(list.at(-1)!.symbol).toBe("XD");
  });

  it("removes one company, whatever case it's given in", () => {
    addRecent({ symbol: "NVDA", name: "NVIDIA", tab: "overview", viewedAt: 1_000 });
    addRecent({ symbol: "COST", name: "Costco", tab: "valuation", viewedAt: 2_000 });
    removeRecent("cost");
    expect(readRecent().map((e) => e.symbol)).toEqual(["NVDA"]);
  });

  it("clears the list and the stored value", () => {
    addRecent({ symbol: "NVDA", name: "NVIDIA", tab: "overview", viewedAt: 1_000 });
    clearRecent();
    expect(readRecent()).toEqual([]);
    expect(store.getItem(RECENT_KEY)).toBeNull();
  });

  it("treats corrupted JSON as an empty list and recovers on the next add", () => {
    store.setItem(RECENT_KEY, "{not json");
    expect(readRecent()).toEqual([]);
    store.setItem(RECENT_KEY, JSON.stringify({ symbol: "NVDA" }));
    expect(readRecent()).toEqual([]);
    addRecent({ symbol: "KO", name: "Coca-Cola", tab: "filings", viewedAt: 5_000 });
    expect(readRecent().map((e) => e.symbol)).toEqual(["KO"]);
  });

  it("drops entries of the wrong shape and keeps one per company, the newest", () => {
    store.setItem(
      RECENT_KEY,
      JSON.stringify([
        { symbol: "NVDA", name: "NVIDIA", tab: "overview", viewedAt: 3_000 },
        null,
        42,
        "COST",
        { symbol: "COST", name: "Costco", tab: "valuation" },
        { symbol: "COST", name: "Costco", tab: "valuation", viewedAt: "yesterday" },
        { symbol: "JPM", name: "", tab: "insiders", viewedAt: 2_000 },
        { symbol: "JPM", name: "JPMorgan", tab: "discussion", viewedAt: 2_000 },
        { symbol: "../../api", name: "Sneaky", tab: "overview", viewedAt: 2_000 },
        { symbol: "<B>", name: "Markup", tab: "overview", viewedAt: 2_000 },
        { symbol: "KO", name: "x".repeat(500), tab: "overview", viewedAt: 2_000 },
        { symbol: "nvda", name: "NVIDIA, older", tab: "earnings", viewedAt: 1_000 },
        { symbol: "brk.b", name: "Berkshire Hathaway", tab: "earnings", viewedAt: 2_500 },
      ]),
    );
    expect(readRecent()).toEqual([
      { symbol: "NVDA", name: "NVIDIA", tab: "overview", viewedAt: 3_000 },
      { symbol: "BRK.B", name: "Berkshire Hathaway", tab: "earnings", viewedAt: 2_500 },
    ]);
  });

  it("refuses to add an entry of the wrong shape", () => {
    addRecent({ symbol: "not a ticker", name: "Nope", tab: "overview", viewedAt: 1_000 });
    addRecent({ symbol: "NVDA", name: "   ", tab: "overview", viewedAt: 1_000 });
    expect(readRecent()).toEqual([]);
    expect(store.getItem(RECENT_KEY)).toBeNull();
  });

  it("never throws when storage throws on every call", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    vi.stubGlobal("localStorage", broken);
    expect(readRecent()).toEqual([]);
    expect(() => addRecent({ symbol: "NVDA", name: "NVIDIA", tab: "overview" })).not.toThrow();
    expect(() => removeRecent("NVDA")).not.toThrow();
    expect(() => clearRecent()).not.toThrow();
    expect(getRecentSnapshot()).toEqual([]);
  });

  it("never throws when even reaching storage throws, or there is none", () => {
    vi.unstubAllGlobals();
    const before = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: access denied");
      },
    });
    try {
      expect(readRecent()).toEqual([]);
      expect(() => addRecent({ symbol: "NVDA", name: "NVIDIA", tab: "overview" })).not.toThrow();
      expect(() => clearRecent()).not.toThrow();
    } finally {
      if (before) Object.defineProperty(globalThis, "localStorage", before);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
    vi.stubGlobal("localStorage", undefined);
    expect(readRecent()).toEqual([]);
    expect(() => addRecent({ symbol: "NVDA", name: "NVIDIA", tab: "overview" })).not.toThrow();
  });

  it("hands React the same array until the stored value changes", () => {
    addRecent({ symbol: "NVDA", name: "NVIDIA", tab: "overview", viewedAt: 1_000 });
    const a = getRecentSnapshot();
    expect(getRecentSnapshot()).toBe(a);
    addRecent({ symbol: "COST", name: "Costco", tab: "valuation", viewedAt: 2_000 });
    const b = getRecentSnapshot();
    expect(b).not.toBe(a);
    expect(getRecentSnapshot()).toBe(b);
    expect(getServerRecentSnapshot()).toBe(getServerRecentSnapshot());
    expect(getServerRecentSnapshot()).toEqual([]);
  });

  it("parses nothing from nothing", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("")).toEqual([]);
    expect(parseRecent("[]")).toEqual([]);
  });
});

describe("tabFromPath", () => {
  it("reads the tab from a company page's address", () => {
    expect(tabFromPath("/research/nvda")).toBe("overview");
    expect(tabFromPath("/research/nvda/")).toBe("overview");
    expect(tabFromPath("/research/brk.b/financials")).toBe("financials");
    expect(tabFromPath("/research/nvda/filings")).toBe("filings");
  });

  it("returns null for anything that isn't a tab", () => {
    expect(tabFromPath("/research/nvda/overview")).toBeNull();
    expect(tabFromPath("/research/nvda/discussion")).toBeNull();
    expect(tabFromPath("/research/nvda/insiders/extra")).toBeNull();
    expect(tabFromPath("/research")).toBeNull();
    expect(tabFromPath("/about")).toBeNull();
    expect(tabFromPath(null)).toBeNull();
  });
});

describe("recentHref", () => {
  it("links to the company at the tab last open", () => {
    expect(recentHref({ symbol: "NVDA", tab: "overview" })).toBe("/research/nvda");
    expect(recentHref({ symbol: "JPM", tab: "insiders" })).toBe("/research/jpm/insiders");
    expect(recentHref({ symbol: "BRK.B", tab: "valuation" })).toBe("/research/brk.b/valuation");
  });
});

describe("viewedLabel", () => {
  // Local times, so the calendar arithmetic holds in any time zone.
  const now = new Date(2026, 10, 2, 15, 0).getTime();
  const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo, d, h, mi).getTime();

  it("says how long ago, in the words on the board", () => {
    expect(viewedLabel(now - 20_000, now)).toBe("Just now");
    expect(viewedLabel(now + 5_000, now)).toBe("Just now");
    expect(viewedLabel(now - 60_000, now)).toBe("1 minute ago");
    expect(viewedLabel(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(viewedLabel(at(2026, 10, 2, 14, 0), now)).toBe("1 hour ago");
    expect(viewedLabel(at(2026, 10, 2, 13, 0), now)).toBe("2 hours ago");
    expect(viewedLabel(at(2026, 10, 2, 0, 5), now)).toBe("14 hours ago");
    expect(viewedLabel(at(2026, 10, 1, 23, 0), now)).toBe("Yesterday");
    expect(viewedLabel(at(2026, 9, 30, 9, 0), now)).toBe("3 days ago");
    expect(viewedLabel(at(2026, 9, 27, 9, 0), now)).toBe("6 days ago");
    expect(viewedLabel(at(2026, 9, 26, 9, 0), now)).toBe("Last week");
    expect(viewedLabel(at(2026, 9, 20, 9, 0), now)).toBe("Last week");
  });

  it("gives the date after two weeks, with the year once it differs", () => {
    expect(viewedLabel(at(2026, 9, 12, 9, 0), now)).toBe("Oct 12");
    expect(viewedLabel(at(2025, 11, 20, 9, 0), now)).toBe("Dec 20, 2025");
  });
});
