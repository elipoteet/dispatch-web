// Twelve Data's daily allowance, and when to stop asking it or Tiingo for
// prices (fix/price-credits, 25 November 2026). Server-only.
//
// Twelve Data's free plan gives 800 credits a day, one per price request,
// reset at midnight UTC. On 24 November the site asked for 2,141: crawlers
// opening research files, then every visit retrying once the day's credits
// were gone, with Tiingo, the fallback, refusing too. The alerts job ran at
// 21:30 UTC, long after, and got nothing. Three rules here:
//
//   1. A daily reserve. Requests made for visitors stop at 600 a day; the
//      alerts job may go on to 790, which leaves ten for the watcher and for
//      checks. Counted in one shared row per day in the database
//      (price_credit_day, migration 0032), claimed before each request, so
//      every server instance sees the same count.
//   2. Out for the day. When Twelve Data answers that the day's credits are
//      used up, nothing asks it again until midnight UTC.
//   3. Tiingo's caps. When Tiingo answers 429, nothing asks it again until its
//      allowance is back: an hour for the hourly cap, midnight New York time
//      for the daily one, the 1st of next month for the monthly symbol cap.
//
// Until migration 0032 is pasted, or whenever the database can't be asked,
// the count falls back to one per server instance. That still stops a single
// instance at 600, but several instances could together go past it, so the
// reserve is only exact once the table exists.

import { AsyncLocalStorage } from "node:async_hooks";

export type PriceCaller = "visitor" | "alerts";

export const VISITOR_DAILY_CAP = 600;
export const TOTAL_DAILY_CAP = 790;

// Who a Twelve Data request is for. Anything not run inside asPriceCaller is a
// visitor's. Carried this way, not as an argument, so the cached price
// functions keep one cache entry per company whoever asks.
const callerStore = new AsyncLocalStorage<PriceCaller>();

export function asPriceCaller<T>(caller: PriceCaller, run: () => Promise<T>): Promise<T> {
  return callerStore.run(caller, run);
}

export function currentPriceCaller(): PriceCaller {
  return callerStore.getStore() ?? "visitor";
}

// —— Clocks ——
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function nextUtcMidnight(now: Date): number {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

// Midnight in New York, to the minute (Tiingo's daily reset).
export function nextNewYorkMidnight(now: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const minutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  return now.getTime() - (now.getTime() % 60_000) + (24 * 60 - minutes) * 60_000;
}

function firstOfNextMonthUtc(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

// —— Reading the providers' refusals ——
// Twelve Data's 429 says which allowance ran out: "You have run out of API
// credits for the day. 2141 API credits were used, with the current limit
// being 800" (24 November 2026), or "...for the current minute..." with a
// limit of 8.
export function twelveDataLimitKind(message: string): "day" | "minute" {
  if (/for the day/i.test(message)) return "day";
  const limit = /current limit being (\d+)/i.exec(message);
  return limit && Number(limit[1]) >= 100 ? "day" : "minute";
}

// Tiingo's 429 names the cap: "over your hourly request allocation" (24
// November 2026); its daily and monthly-symbol caps say "daily" and "month".
export function tiingoBlockedUntil(message: string, now: Date): number {
  if (/month|unique symbol/i.test(message)) return firstOfNextMonthUtc(now);
  if (/daily|per day|for the day/i.test(message)) return nextNewYorkMidnight(now);
  return now.getTime() + 60 * 60_000;
}

// —— This instance's state ——
const state = {
  twelveDataOutUntil: 0,
  visitorsStoppedUntil: 0,
  tiingoOutUntil: 0,
  ledgerMissingUntil: 0,
  localDay: "",
  localVisitor: 0,
  localTotal: 0,
};

export function resetBudgetForTests(): void {
  Object.assign(state, {
    twelveDataOutUntil: 0,
    visitorsStoppedUntil: 0,
    tiingoOutUntil: 0,
    ledgerMissingUntil: 0,
    localDay: "",
    localVisitor: 0,
    localTotal: 0,
  });
}

// The shared count. Resolves true when the credit was claimed, false when the
// cap for this caller is reached (or Twelve Data said it's out for the day),
// null when the count can't be reached.
export type Ledger = {
  claim(caller: PriceCaller, visitorCap: number, totalCap: number): Promise<boolean | null>;
  markOut(): Promise<void>;
};

export type ClaimResult = { ok: true } | { ok: false; reason: "out for the day" | "visitor reserve reached" | "daily cap reached" };

export async function claimTwelveDataCredit(ledger: Ledger, now = new Date()): Promise<ClaimResult> {
  const t = now.getTime();
  const caller = currentPriceCaller();
  if (t < state.twelveDataOutUntil) return { ok: false, reason: "out for the day" };
  if (caller === "visitor" && t < state.visitorsStoppedUntil) return { ok: false, reason: "visitor reserve reached" };

  const shared = t < state.ledgerMissingUntil ? null : await ledger.claim(caller, VISITOR_DAILY_CAP, TOTAL_DAILY_CAP);
  if (shared === null) state.ledgerMissingUntil = Math.max(state.ledgerMissingUntil, t + 10 * 60_000);

  const day = utcDay(now);
  if (state.localDay !== day) Object.assign(state, { localDay: day, localVisitor: 0, localTotal: 0 });

  let granted: boolean;
  if (shared !== null) granted = shared;
  else granted = state.localTotal < TOTAL_DAILY_CAP && (caller !== "visitor" || state.localVisitor < VISITOR_DAILY_CAP);

  if (!granted) {
    if (caller === "visitor") {
      state.visitorsStoppedUntil = nextUtcMidnight(now);
      return { ok: false, reason: "visitor reserve reached" };
    }
    return { ok: false, reason: "daily cap reached" };
  }
  state.localTotal++;
  if (caller === "visitor") state.localVisitor++;
  return { ok: true };
}

// Twelve Data said the day's credits are gone.
export async function twelveDataOutForTheDay(ledger: Ledger, now = new Date()): Promise<void> {
  state.twelveDataOutUntil = nextUtcMidnight(now);
  await ledger.markOut().catch(() => {});
}

export function tiingoOpen(now = new Date()): boolean {
  return now.getTime() >= state.tiingoOutUntil;
}

export function tiingoRefused(message: string, now = new Date()): void {
  state.tiingoOutUntil = Math.max(state.tiingoOutUntil, tiingoBlockedUntil(message, now));
}
