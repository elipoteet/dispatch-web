import { describe, expect, it } from "vitest";
import {
  BASELINES,
  actionIssue,
  activeCpuHours,
  classifySite,
  isCached,
  isWeeklyDay,
  judgeAlertsJob,
  judgeCounts,
  judgeCpu,
  judgeScreenerJob,
  judgeTwelveData,
  parseScreener,
  readOnlyFetch,
  scrub,
  weeklySummary,
} from "./watch.mjs";

const NOW = new Date("2026-11-21T12:17:00Z");

describe("the live site", () => {
  it("knows Vercel's paused answer, by header or page", () => {
    expect(classifySite({ status: 503, vercelError: "DEPLOYMENT_PAUSED" })).toBe("paused");
    expect(classifySite({ status: 503, body: "<p>Code: DEPLOYMENT_PAUSED</p>" })).toBe("paused");
    // How the pause looked on 25 November 2026.
    expect(classifySite({ status: 402, vercelError: "DEPLOYMENT_DISABLED" })).toBe("paused");
    expect(classifySite({ status: 402, body: "<p>Code: DEPLOYMENT_DISABLED</p>" })).toBe("paused");
    expect(classifySite({ status: 200, body: "<html>" })).toBe("ok");
    expect(classifySite({ status: 500 })).toBe("down");
    expect(classifySite({ status: 0 })).toBe("down");
  });

  it("counts a page as cached only when Vercel served it from its cache", () => {
    for (const h of ["HIT", "PRERENDER", "STALE", "REVALIDATED", "hit"]) expect(isCached(h)).toBe(true);
    for (const h of ["MISS", "BYPASS", "", null]) expect(isCached(h)).toBe(false);
  });
});

describe("the screener job", () => {
  // The shape watcher_status() returns (migration 0031).
  const run = (over = {}) => ({
    started_at: "2026-11-21T09:47:00Z",
    finished_at: "2026-11-21T09:49:00Z",
    mode: "nightly",
    failed: false,
    published: 4575,
    ...over,
  });

  it("is fine when it ran this morning and published", () => {
    const r = judgeScreenerJob(run(), "2026-11-21T09:48:30Z", NOW);
    expect(r.state).toBe("ok");
    expect(r.detail).toContain("4,575");
  });

  it("needs action when it is old, failed, unfinished or didn't publish", () => {
    expect(judgeScreenerJob(null, null, NOW).state).toBe("action");
    expect(judgeScreenerJob(run({ started_at: "2026-11-20T08:00:00Z" }), "2026-11-20T08:02:00Z", NOW).detail).toMatch(/over 26 hours/);
    const failed = judgeScreenerJob(run({ failed: true }), null, NOW);
    expect(failed.detail).toMatch(/failed/);
    expect(failed.todo).toContain("screener_runs");
    expect(judgeScreenerJob(run({ finished_at: null, started_at: "2026-11-21T09:00:00Z" }), null, NOW).detail).toMatch(/never finished/);
    const kept = judgeScreenerJob(run({ published: null }), null, NOW);
    expect(kept.state).toBe("action");
    expect(kept.detail).toMatch(/didn't publish/);
    expect(judgeScreenerJob(run(), "2026-11-19T09:48:00Z", NOW).detail).toMatch(/last updated/);
  });

  it("lets a run in progress be", () => {
    expect(judgeScreenerJob(run({ started_at: "2026-11-21T11:50:00Z", finished_at: null }), null, NOW).state).toBe("ok");
  });
});

describe("the alerts job", () => {
  it("checks the newest watched-ticker stamp, and skips when nothing is watched", () => {
    expect(judgeAlertsJob("2026-11-20T21:58:00Z", 3, NOW).state).toBe("ok");
    expect(judgeAlertsJob("2026-11-19T21:58:00Z", 3, NOW).state).toBe("action");
    expect(judgeAlertsJob(null, 3, NOW).state).toBe("action");
    expect(judgeAlertsJob(null, 0, NOW).state).toBe("skipped");
  });
});

describe("the screens' counts", () => {
  const html = (counts, about = "4,600") =>
    `<p>Filter about ${about} U.S.-listed companies</p>` +
    Object.entries(counts)
      .map(([slug, n]) => `<a href="/screener/${slug}" class="rf-scr-row-link"><span>Title</span><span class="rf-scr-row-count">${n} companies</span></a>`)
      .join("");

  it("reads every screen's count and the universe from the page", () => {
    const parsed = parseScreener(html(BASELINES));
    expect(parsed.counts).toEqual(BASELINES);
    expect(parsed.universe).toBe(4600);
    expect(judgeCounts(parsed).state).toBe("ok");
  });

  it("flags a count that halves or doubles, a missing screen, or an odd universe", () => {
    const halved = judgeCounts(parseScreener(html({ ...BASELINES, "the-compounder": 12 })));
    expect(halved.state).toBe("action");
    expect(halved.detail).toContain("the-compounder shows 12");
    expect(judgeCounts(parseScreener(html({ ...BASELINES, "rule-of-40": 300 }))).detail).toContain("rule-of-40");
    const rest = Object.fromEntries(Object.entries(BASELINES).filter(([slug]) => slug !== "based-in-new-england"));
    expect(judgeCounts(parseScreener(html(rest))).detail).toContain("based-in-new-england is missing");
    expect(judgeCounts(parseScreener(html(BASELINES, "900"))).detail).toContain("about 900");
  });

  it("allows ordinary nightly movement", () => {
    expect(judgeCounts(parseScreener(html({ ...BASELINES, "the-compounder": 33, "more-cash-than-debt": 120 }))).state).toBe("ok");
  });
});

describe("Twelve Data", () => {
  it("warns at 70% of the daily credits, or when the key is refused or the credits are gone", () => {
    expect(judgeTwelveData({ status: 200, body: { daily_usage: 120, plan_daily_limit: 800, plan_category: "basic" } }).state).toBe("ok");
    expect(judgeTwelveData({ status: 200, body: { daily_usage: 600, plan_daily_limit: 800 } }).state).toBe("action");
    expect(judgeTwelveData({ status: 401, body: { status: "error" } }).state).toBe("action");
    expect(judgeTwelveData({ status: 429, body: null }).detail).toMatch(/used up/);
    const daily = judgeTwelveData({
      status: 429,
      body: { code: 429, status: "error", message: "You have run out of API credits for the day. 1628 API credits were used, with the current limit being 800. Wait for the next day or consider switching to a paid plan" },
    });
    expect(daily.detail).toContain("The day's credits are used up");
    expect(daily.detail).toContain("1628 API credits were used");
    expect(daily.detail).not.toContain("Wait for");
    expect(daily.todo).toMatch(/alerts job/);
    expect(judgeTwelveData({ status: 200, body: { current_usage: 1, plan_limit: 55, plan_category: "grow" } }).state).toBe("ok");
  });
});

describe("Vercel usage", () => {
  it("reads Active CPU in hours where Vercel gives it, and warns at 70% of 4 hours", () => {
    const costs = {
      metrics: [{ slug: "gross_cost", unit: { kind: "currency", name: "USD" } }, { slug: "quantity", unit: { kind: "custom", plural: "hours" } }],
      results: {
        dimensionsMeta: { product: { values: { fluid_active_cpu: { title: "Fluid Active CPU" } } } },
        views: { byProduct: { results: [{ dimensionValues: { product: "fluid_active_cpu" }, metrics: ["gross_cost", "quantity"], totalValue: [0, 3.1] }] } },
      },
    };
    expect(activeCpuHours(costs)).toBeCloseTo(3.1);
    expect(activeCpuHours({})).toBeNull();
    expect(judgeCpu(3.1).state).toBe("action");
    expect(judgeCpu(1).state).toBe("ok");
  });
});

describe("safety", () => {
  it("refuses anything but a read to the database's host", async () => {
    const calls = [];
    const f = readOnlyFetch(async (url, init) => (calls.push([url, init?.method ?? "GET"]), new Response("[]")), "https://abc.supabase.co");
    await f("https://abc.supabase.co/rest/v1/screener_runs?select=id");
    await expect(f("https://abc.supabase.co/rest/v1/screener_runs", { method: "POST", body: "{}" })).rejects.toThrow(/only reads/);
    await expect(f("https://abc.supabase.co/rest/v1/x", { method: "PATCH" })).rejects.toThrow(/only reads/);
    await f("https://api.twelvedata.com/api_usage", { method: "GET" });
    expect(calls.map((c) => c[1])).toEqual(["GET", "GET"]);
  });

  it("keeps every secret's value out of what it prints", () => {
    const env = { SUPABASE_SERVICE_ROLE_KEY: "service-abcdef", TWELVE_DATA_API_KEY: "td-123456", GITHUB_TOKEN: "ghs_zzzzzz", VERCEL_TOKEN: "" };
    expect(scrub("keys service-abcdef td-123456 ghs_zzzzzz", env)).toBe("keys *** *** ***");
  });
});

describe("issues", () => {
  const results = [
    { key: "site", name: "Live site", state: "ok", detail: "answers" },
    { key: "counts", name: "Screen counts", state: "action", detail: "the-compounder shows 29 companies (normal: about 300).", todo: "Open the screen." },
    { key: "vercel-cpu", name: "Vercel Active CPU", state: "skipped", detail: "Not readable on Hobby." },
  ];

  it("names what needs action and what to do, and remembers which checks failed", () => {
    const issue = actionIssue(results, NOW);
    expect(issue.title).toBe("Watcher: 1 thing needs attention");
    expect(issue.body).toContain("found one thing that needs action");
    expect(issue.body).toContain("**Screen counts.** the-compounder shows 29");
    expect(issue.body).toContain("What to do: Open the screen.");
    expect(issue.body).toContain("<!-- watcher:action counts -->");
    expect(issue.body).not.toContain("Vercel Active CPU");
  });

  it("writes a short weekly summary with the free-plan limits, on Mondays", () => {
    const s = weeklySummary(results, NOW);
    expect(s.title).toBe("Watcher: week of 2026-11-21");
    expect(s.body).toContain("Screen counts: NEEDS ACTION");
    expect(s.body).toContain("Supabase Free: 500 MB database");
    expect(isWeeklyDay(new Date("2026-11-23T12:17:00Z"), false)).toBe(true);
    expect(isWeeklyDay(NOW, false)).toBe(false);
  });
});
