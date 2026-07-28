// Monthly Leaderboard — US market-hours gate. Competition trades may only
// be placed while the market is actually open: weekdays, 9:30am-4:00pm
// America/New_York, excluding NYSE holidays. This is a genuinely new
// concept for this codebase — nothing in lib/portfolio.ts's existing
// paper-trading path checks market hours, and that stays unchanged; this
// module is only ever consulted on the competition trade path.
//
// Every date boundary in this feature is America/New_York, not UTC —
// including what counts as "today" and "this month" — so the month-key
// helper lives here too rather than being computed ad hoc per caller.

const MARKET_OPEN_MINUTES = 9 * 60 + 30; // 9:30am
const MARKET_CLOSE_MINUTES = 16 * 60; // 4:00pm

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type NyParts = { year: number; month: number; day: number; weekday: number; minutesSinceMidnight: number };

// Uses Intl's IANA tzdata (which already knows America/New_York's DST
// rules) rather than a hand-rolled UTC offset — the whole reason to reach
// for Intl here instead of fixed-offset arithmetic.
function newYorkParts(date: Date): NyParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // some ICU builds render midnight as "24" under hour12:false
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? -1,
    minutesSinceMidnight: hour * 60 + Number(get("minute")),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function nyMonthKey(date: Date = new Date()): string {
  const { year, month } = newYorkParts(date);
  return `${year}-${pad2(month)}`;
}

export function nyDateKey(date: Date = new Date()): string {
  const { year, month, day } = newYorkParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// —— NYSE holiday calendar ——
// Built from rules (nth weekday, Easter-relative, fixed-date-with-weekend-
// observance) rather than a hardcoded per-year date list, so it doesn't
// need yearly maintenance.

export function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return 1 + offset + (n - 1) * 7;
}

export function lastWeekdayOfMonth(year: number, month: number, weekday: number): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastWeekday = new Date(Date.UTC(year, month - 1, daysInMonth)).getUTCDay();
  const diff = (lastWeekday - weekday + 7) % 7;
  return daysInMonth - diff;
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher) for the date of
// Easter Sunday — Good Friday is exactly two days before it.
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

// A holiday that falls on a Saturday is observed the preceding Friday; one
// that falls on a Sunday is observed the following Monday. Weekday holidays
// pass through unchanged.
function observedDate(year: number, month: number, day: number): { month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day));
  const weekday = d.getUTCDay();
  if (weekday === 6) {
    const shifted = new Date(Date.UTC(year, month - 1, day - 1));
    return { month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
  }
  if (weekday === 0) {
    const shifted = new Date(Date.UTC(year, month - 1, day + 1));
    return { month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
  }
  return { month, day };
}

export function nyseHolidays(year: number): Set<string> {
  const dates: { month: number; day: number }[] = [];

  dates.push(observedDate(year, 1, 1)); // New Year's Day
  dates.push({ month: 1, day: nthWeekdayOfMonth(year, 1, 1, 3) }); // MLK Day — 3rd Mon of Jan
  dates.push({ month: 2, day: nthWeekdayOfMonth(year, 2, 1, 3) }); // Presidents Day — 3rd Mon of Feb

  const easter = easterSunday(year);
  const goodFriday = new Date(Date.UTC(year, easter.month - 1, easter.day - 2));
  dates.push({ month: goodFriday.getUTCMonth() + 1, day: goodFriday.getUTCDate() });

  dates.push({ month: 5, day: lastWeekdayOfMonth(year, 5, 1) }); // Memorial Day — last Mon of May
  if (year >= 2022) dates.push(observedDate(year, 6, 19)); // Juneteenth — NYSE holiday since 2022
  dates.push(observedDate(year, 7, 4)); // Independence Day
  dates.push({ month: 9, day: nthWeekdayOfMonth(year, 9, 1, 1) }); // Labor Day — 1st Mon of Sep
  dates.push({ month: 11, day: nthWeekdayOfMonth(year, 11, 4, 4) }); // Thanksgiving — 4th Thu of Nov
  dates.push(observedDate(year, 12, 25)); // Christmas

  return new Set(dates.map((d) => `${year}-${pad2(d.month)}-${pad2(d.day)}`));
}

export function isMarketOpen(date: Date = new Date()): boolean {
  const parts = newYorkParts(date);
  if (parts.weekday === 0 || parts.weekday === 6) return false;
  const dateKey = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  if (nyseHolidays(parts.year).has(dateKey)) return false;
  return parts.minutesSinceMidnight >= MARKET_OPEN_MINUTES && parts.minutesSinceMidnight < MARKET_CLOSE_MINUTES;
}
