import { beforeEach, describe, expect, it } from "vitest";
import {
  asPriceCaller,
  claimTwelveDataCredit,
  nextNewYorkMidnight,
  resetBudgetForTests,
  tiingoBlockedUntil,
  tiingoOpen,
  tiingoRefused,
  TOTAL_DAILY_CAP,
  twelveDataLimitKind,
  twelveDataOutForTheDay,
  VISITOR_DAILY_CAP,
  type Ledger,
  type PriceCaller,
} from "./budget";

// The shared count as the migration's function keeps it, in memory.
function memoryLedger(): Ledger & { visitor: number; alerts: number; out: boolean; calls: number } {
  const l = {
    visitor: 0,
    alerts: 0,
    out: false,
    calls: 0,
    async claim(caller: PriceCaller, visitorCap: number, totalCap: number) {
      l.calls++;
      if (l.out || l.visitor + l.alerts >= totalCap || (caller === "visitor" && l.visitor >= visitorCap)) return false;
      if (caller === "visitor") l.visitor++;
      else l.alerts++;
      return true;
    },
    async markOut() {
      l.out = true;
    },
  };
  return l;
}

const unreachable: Ledger = { claim: async () => null, markOut: async () => {} };
const NOW = new Date("2026-11-25T14:00:00Z");

beforeEach(() => resetBudgetForTests());

describe("the daily reserve", () => {
  it("stops visitors at 600 and keeps the rest for the alerts job", async () => {
    const ledger = memoryLedger();
    for (let i = 0; i < VISITOR_DAILY_CAP; i++) expect((await claimTwelveDataCredit(ledger, NOW)).ok).toBe(true);
    expect(await claimTwelveDataCredit(ledger, NOW)).toEqual({ ok: false, reason: "visitor reserve reached" });
    // The alerts job still gets its share.
    const alerts = await asPriceCaller("alerts", () => claimTwelveDataCredit(ledger, NOW));
    expect(alerts.ok).toBe(true);
    expect(ledger.visitor).toBe(600);
    expect(ledger.alerts).toBe(1);
  });

  it("stops even the alerts job at 790, leaving ten for checks", async () => {
    const ledger = memoryLedger();
    ledger.visitor = 600;
    ledger.alerts = TOTAL_DAILY_CAP - 600;
    expect(await asPriceCaller("alerts", () => claimTwelveDataCredit(ledger, NOW))).toEqual({ ok: false, reason: "daily cap reached" });
  });

  it("stops asking the shared count for visitors once the reserve is reached, until midnight UTC", async () => {
    const ledger = memoryLedger();
    ledger.visitor = 600;
    await claimTwelveDataCredit(ledger, NOW);
    const before = ledger.calls;
    await claimTwelveDataCredit(ledger, new Date("2026-11-25T23:59:00Z"));
    expect(ledger.calls).toBe(before);
    // A new day asks again.
    ledger.visitor = 0;
    expect((await claimTwelveDataCredit(ledger, new Date("2026-11-26T00:00:01Z"))).ok).toBe(true);
  });

  it("counts per instance when the shared count can't be reached", async () => {
    for (let i = 0; i < VISITOR_DAILY_CAP; i++) expect((await claimTwelveDataCredit(unreachable, NOW)).ok).toBe(true);
    expect((await claimTwelveDataCredit(unreachable, NOW)).ok).toBe(false);
  });
});

describe("out for the day", () => {
  it("asks nothing more of Twelve Data until midnight UTC, for anyone", async () => {
    const ledger = memoryLedger();
    await twelveDataOutForTheDay(ledger, NOW);
    expect(ledger.out).toBe(true);
    expect(await claimTwelveDataCredit(ledger, NOW)).toEqual({ ok: false, reason: "out for the day" });
    expect((await asPriceCaller("alerts", () => claimTwelveDataCredit(ledger, NOW))).ok).toBe(false);
    ledger.out = false; // the new day's row
    expect((await claimTwelveDataCredit(ledger, new Date("2026-11-26T00:00:00Z"))).ok).toBe(true);
  });

  it("tells the day's limit from the minute's in Twelve Data's message", () => {
    expect(
      twelveDataLimitKind(
        "You have run out of API credits for the day. 2141 API credits were used, with the current limit being 800. Wait for the next day or consider switching to a higher tier plan",
      ),
    ).toBe("day");
    expect(twelveDataLimitKind("2141 API credits were used, with the current limit being 800")).toBe("day");
    expect(
      twelveDataLimitKind("You have run out of API credits for the current minute. 9 API credits were used, with the current limit being 8."),
    ).toBe("minute");
    expect(twelveDataLimitKind("")).toBe("minute");
  });
});

describe("Tiingo's caps", () => {
  it("waits an hour for the hourly cap, midnight New York for the daily, the 1st for the monthly", () => {
    expect(tiingoBlockedUntil("You have run over your hourly request allocation.", NOW)).toBe(NOW.getTime() + 3_600_000);
    expect(tiingoBlockedUntil("over your daily request allocation", NOW)).toBe(nextNewYorkMidnight(NOW));
    expect(tiingoBlockedUntil("over your monthly unique symbol allocation", NOW)).toBe(Date.UTC(2026, 11, 1));
    // 14:00 UTC is 9 am in New York: midnight is fifteen hours away.
    expect(nextNewYorkMidnight(NOW)).toBe(NOW.getTime() + 15 * 3_600_000);
  });

  it("isn't asked again while over a cap", () => {
    expect(tiingoOpen(NOW)).toBe(true);
    tiingoRefused("over your hourly request allocation", NOW);
    expect(tiingoOpen(new Date(NOW.getTime() + 59 * 60_000))).toBe(false);
    expect(tiingoOpen(new Date(NOW.getTime() + 60 * 60_000))).toBe(true);
  });
});
