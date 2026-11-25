import { describe, expect, it } from "vitest";
import { isTradingDay, latestSession, previousSession, sessionsBetween } from "./sessions";

// Times are given in UTC. New York is UTC-5 in November and UTC-4 in summer.
const at = (iso: string) => new Date(iso);

describe("latestSession", () => {
  it("is the day before until 5 pm New York time, then the day itself", () => {
    // Tuesday 24 November 2026.
    expect(latestSession(at("2026-11-24T15:00:00Z"))).toBe("2026-11-23"); // 10 am
    expect(latestSession(at("2026-11-24T21:30:00Z"))).toBe("2026-11-23"); // 4:30 pm
    expect(latestSession(at("2026-11-24T22:00:00Z"))).toBe("2026-11-24"); // 5 pm
    expect(latestSession(at("2026-11-25T00:23:00Z"))).toBe("2026-11-24"); // 7:23 pm
  });

  it("uses summer time when New York does", () => {
    // Wednesday 15 July 2026: 5 pm in New York is 21:00 UTC.
    expect(latestSession(at("2026-07-15T20:59:00Z"))).toBe("2026-07-14");
    expect(latestSession(at("2026-07-15T21:00:00Z"))).toBe("2026-07-15");
  });

  it("stays on Friday over the weekend and Monday morning", () => {
    expect(latestSession(at("2026-11-28T18:00:00Z"))).toBe("2026-11-27"); // Saturday
    expect(latestSession(at("2026-11-29T18:00:00Z"))).toBe("2026-11-27"); // Sunday
    expect(latestSession(at("2026-11-30T15:00:00Z"))).toBe("2026-11-27"); // Monday 10 am
  });

  it("skips market holidays", () => {
    // Thanksgiving, Thursday 26 November 2026: Wednesday stays the latest.
    expect(latestSession(at("2026-11-26T23:00:00Z"))).toBe("2026-11-25");
    expect(latestSession(at("2026-11-27T23:00:00Z"))).toBe("2026-11-27");
  });
});

describe("previousSession and sessionsBetween", () => {
  it("steps over weekends and holidays", () => {
    expect(previousSession("2026-11-30")).toBe("2026-11-27");
    expect(previousSession("2026-11-27")).toBe("2026-11-25");
    expect(isTradingDay("2026-11-26")).toBe(false);
    expect(isTradingDay("2026-11-28")).toBe(false);
  });

  it("counts the sessions finished after one date up to another", () => {
    expect(sessionsBetween("2026-11-24", "2026-11-24")).toBe(0);
    expect(sessionsBetween("2026-11-23", "2026-11-24")).toBe(1);
    expect(sessionsBetween("2026-11-20", "2026-11-23")).toBe(1); // Friday to Monday
    expect(sessionsBetween("2026-11-18", "2026-11-24")).toBe(4);
    expect(sessionsBetween("2026-11-25", "2026-11-27")).toBe(1); // over Thanksgiving
    expect(sessionsBetween("2026-11-24", "2026-11-20")).toBe(0);
  });
});
