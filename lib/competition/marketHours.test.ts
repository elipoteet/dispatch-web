import { describe, expect, it } from "vitest";
import {
  easterSunday,
  isMarketOpen,
  isTradingDay,
  lastWeekdayOfMonth,
  nthWeekdayOfMonth,
  nyDateKey,
  nyMonthKey,
  nyseHolidays,
} from "./marketHours";

// Finds a day-of-month in a given year/month that falls on a target UTC
// weekday, using plain Date arithmetic (not the module under test) — this
// lets tests avoid depending on memorized real-world calendar trivia
// ("July 28 2026 is a Tuesday") entirely.
function findWeekdayInMonth(year: number, month: number, targetWeekday: number): number {
  for (let day = 1; day <= 28; day++) {
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === targetWeekday) return day;
  }
  throw new Error("not found");
}

describe("nthWeekdayOfMonth", () => {
  it("returns a date that actually falls on the requested weekday", () => {
    for (let month = 1; month <= 12; month++) {
      const day = nthWeekdayOfMonth(2026, month, 1, 3); // 3rd Monday
      expect(new Date(Date.UTC(2026, month - 1, day)).getUTCDay()).toBe(1);
    }
  });

  it("is actually the nth occurrence, not just any matching weekday", () => {
    const day = nthWeekdayOfMonth(2026, 1, 4, 4); // 4th Thursday
    // Exactly 3 earlier occurrences of that weekday must fall before it.
    expect((day - 1) % 7).toBe(0);
    expect(Math.floor((day - 1) / 7)).toBe(3);
  });
});

describe("lastWeekdayOfMonth", () => {
  it("returns the requested weekday, and no later occurrence exists in the month", () => {
    for (let month = 1; month <= 12; month++) {
      const day = lastWeekdayOfMonth(2026, month, 1); // last Monday
      expect(new Date(Date.UTC(2026, month - 1, day)).getUTCDay()).toBe(1);
      const daysInMonth = new Date(Date.UTC(2026, month, 0)).getUTCDate();
      expect(day + 7).toBeGreaterThan(daysInMonth);
    }
  });
});

describe("easterSunday", () => {
  it("always falls on a Sunday, within the canonical March 22 - April 25 window", () => {
    for (const year of [2024, 2025, 2026, 2027, 2028, 2030]) {
      const { month, day } = easterSunday(year);
      expect(new Date(Date.UTC(year, month - 1, day)).getUTCDay()).toBe(0);
      expect(month === 3 || month === 4).toBe(true);
      if (month === 3) expect(day).toBeGreaterThanOrEqual(22);
      if (month === 4) expect(day).toBeLessThanOrEqual(25);
    }
  });
});

describe("nyseHolidays", () => {
  it("never lands a holiday on a weekend (fixed-date holidays are shifted, others are inherently weekdays)", () => {
    for (const year of [2024, 2025, 2026, 2027]) {
      for (const dateStr of nyseHolidays(year)) {
        const [y, m, d] = dateStr.split("-").map(Number);
        const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        expect(weekday).not.toBe(0);
        expect(weekday).not.toBe(6);
      }
    }
  });

  it("includes Juneteenth from 2022 onward but not before", () => {
    const hasJuneteenth = (year: number) => [...nyseHolidays(year)].some((d) => d.startsWith(`${year}-06-`));
    expect(hasJuneteenth(2022)).toBe(true);
    expect(hasJuneteenth(2026)).toBe(true);
    expect(hasJuneteenth(2020)).toBe(false);
  });

  it("has a stable count of holidays per year (10, or 9 before Juneteenth was added)", () => {
    expect(nyseHolidays(2026).size).toBe(10);
    expect(nyseHolidays(2020).size).toBe(9);
  });
});

describe("isMarketOpen", () => {
  it("is closed on a Saturday regardless of time of day", () => {
    const satDay = findWeekdayInMonth(2026, 8, 6); // Saturday
    const instant = new Date(Date.UTC(2026, 7, satDay, 15, 0, 0));
    expect(isMarketOpen(instant)).toBe(false);
  });

  it("is open on a weekday midday during EDT (UTC-4, so 15:00 UTC = 11:00am ET)", () => {
    const tueDay = findWeekdayInMonth(2026, 7, 2); // Tuesday, safely mid-week to avoid month-boundary edge cases
    const instant = new Date(Date.UTC(2026, 6, tueDay, 15, 0, 0));
    expect(isMarketOpen(instant)).toBe(true);
  });

  it("is closed before 9:30am ET on an otherwise-open weekday", () => {
    const tueDay = findWeekdayInMonth(2026, 7, 2);
    const instant = new Date(Date.UTC(2026, 6, tueDay, 13, 0, 0)); // 9:00am EDT
    expect(isMarketOpen(instant)).toBe(false);
  });

  it("is closed at/after 4:00pm ET on an otherwise-open weekday", () => {
    const tueDay = findWeekdayInMonth(2026, 7, 2);
    const instant = new Date(Date.UTC(2026, 6, tueDay, 20, 0, 0)); // 4:00pm EDT exactly
    expect(isMarketOpen(instant)).toBe(false);
  });

  it("is closed on Christmas Day even if it falls on a weekday", () => {
    const christmas = [...nyseHolidays(2026)].find((d) => d.startsWith("2026-12-"))!;
    const [y, m, d] = christmas.split("-").map(Number);
    // Midday UTC comfortably inside the same NY calendar day regardless of DST.
    const instant = new Date(Date.UTC(y, m - 1, d, 16, 0, 0));
    expect(isMarketOpen(instant)).toBe(false);
  });
});

describe("isTradingDay", () => {
  it("is false on a weekend regardless of time of day", () => {
    const satDay = findWeekdayInMonth(2026, 8, 6); // Saturday
    expect(isTradingDay(new Date(Date.UTC(2026, 7, satDay, 23, 0, 0)))).toBe(false);
  });

  it("is true on an otherwise-ordinary weekday, even outside trading hours", () => {
    const tueDay = findWeekdayInMonth(2026, 7, 2);
    // 3am ET — well before the open, but still a trading day.
    expect(isTradingDay(new Date(Date.UTC(2026, 6, tueDay, 7, 0, 0)))).toBe(true);
  });

  it("is false on a holiday even at an hour isMarketOpen would otherwise accept", () => {
    const christmas = [...nyseHolidays(2026)].find((d) => d.startsWith("2026-12-"))!;
    const [y, m, d] = christmas.split("-").map(Number);
    expect(isTradingDay(new Date(Date.UTC(y, m - 1, d, 16, 0, 0)))).toBe(false);
  });
});

describe("nyMonthKey / nyDateKey", () => {
  it("format as YYYY-MM and YYYY-MM-DD", () => {
    const instant = new Date(Date.UTC(2026, 6, 15, 15, 0, 0));
    expect(nyMonthKey(instant)).toBe("2026-07");
    expect(nyDateKey(instant)).toBe("2026-07-15");
  });
});
