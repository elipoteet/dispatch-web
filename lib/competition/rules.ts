// Monthly Leaderboard — competition rules, all in one place. Every
// threshold that decides who's ranked lives here, so tightening or
// loosening a rule later is a one-line change instead of a hunt through
// the codebase (see dispatchleaderboardprompt.md).

export const STARTING_BALANCE = 10000;

// Eligibility guardrail #1: an entrant must place at least this many
// trades across at least this many distinct tickers, so repeatedly
// trading one position doesn't trivially satisfy the rule.
export const MIN_TRADE_COUNT = 3;
export const MIN_DISTINCT_TICKERS = 2;

// Eligibility guardrail #2: an entrant must have been "mostly invested" —
// at least MIN_INVESTED_RATIO of equity in positions (not cash) on at
// least MIN_INVESTED_DAY_FRACTION of the days they participated. Measured
// from the stored daily standings, not a single month-end check, so
// parking in cash all month and buying in on the last day doesn't qualify.
export const MIN_INVESTED_RATIO = 0.5;
export const MIN_INVESTED_DAY_FRACTION = 0.5;

// Not enabled yet — null means "no cap." Set to a fraction (e.g. 0.5 for
// "no more than 50% of equity in one ticker") once the first month shows
// whether a position-size cap is actually needed; every eligibility check
// below already reads this constant, so turning it on is changing this
// one line, not a refactor.
export const MAX_POSITION_PCT: number | null = null;

export type DailyParticipation = {
  /** Fraction of that day's equity held in positions rather than cash. */
  investedRatio: number;
};

export type EligibilityInput = {
  tradeCount: number;
  distinctTickerCount: number;
  /** One entry per day this entrant has a standing row for, this month. */
  dailyParticipation: DailyParticipation[];
  positions?: { marketValue: number }[];
  equity?: number;
};

export type EligibilityResult = {
  eligible: boolean;
  /** Plain-language reasons, populated only when NOT eligible. */
  reasons: string[];
};

export function computeLargestPositionPct(positions: { marketValue: number }[], equity: number): number {
  if (equity <= 0) return 0;
  const largest = positions.reduce((max, p) => Math.max(max, p.marketValue), 0);
  return largest / equity;
}

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const reasons: string[] = [];

  if (input.tradeCount < MIN_TRADE_COUNT) {
    reasons.push(
      `Place at least ${MIN_TRADE_COUNT} trades this month (you've placed ${input.tradeCount}).`,
    );
  }
  if (input.distinctTickerCount < MIN_DISTINCT_TICKERS) {
    reasons.push(
      `Trade at least ${MIN_DISTINCT_TICKERS} different tickers (you've traded ${input.distinctTickerCount}).`,
    );
  }

  const daysParticipated = input.dailyParticipation.length;
  if (daysParticipated > 0) {
    const investedDays = input.dailyParticipation.filter((d) => d.investedRatio >= MIN_INVESTED_RATIO).length;
    const investedFraction = investedDays / daysParticipated;
    if (investedFraction < MIN_INVESTED_DAY_FRACTION) {
      reasons.push(
        `Stay at least ${Math.round(MIN_INVESTED_RATIO * 100)}% invested on at least ` +
          `${Math.round(MIN_INVESTED_DAY_FRACTION * 100)}% of the days you participate ` +
          `(currently ${Math.round(investedFraction * 100)}%).`,
      );
    }
  }

  if (MAX_POSITION_PCT != null) {
    const pct = computeLargestPositionPct(input.positions ?? [], input.equity ?? 0);
    if (pct > MAX_POSITION_PCT) {
      reasons.push(
        `Keep any single position under ${Math.round(MAX_POSITION_PCT * 100)}% of your account ` +
          `(largest is currently ${Math.round(pct * 100)}%).`,
      );
    }
  }

  return { eligible: reasons.length === 0, reasons };
}
