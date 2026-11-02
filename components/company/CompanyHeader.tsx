import { fiscalYearEndMonth, formatPct, formatPrice, formatSignedNumber, formatSignedPct } from "@/lib/research/format";

export type CompanyHeaderProps = {
  symbol: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  fiscalYearEnd: string | null;
  quote: { price: number; change: number; changePct: number; asOf: number } | null;
  range52: { low: number; high: number } | null;
  nextEarnings: { date: string; hour: "bmo" | "amc" | "dmh" | null } | null;
};

const NEW_YORK = "America/New_York";
const HOUR_WORDS = { bmo: "before the open", amc: "after the close", dmh: "during market hours" } as const;
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// "Today" only when the last trade happened on today's New York date; on a
// weekend or holiday, name the session the price belongs to instead.
function sessionLabel(asOf: number): string {
  const traded = new Date(asOf * 1000);
  const sameDay =
    traded.toLocaleDateString("en-US", { timeZone: NEW_YORK }) === new Date().toLocaleDateString("en-US", { timeZone: NEW_YORK });
  return sameDay ? "Today" : `At close, ${traded.toLocaleDateString("en-US", { timeZone: NEW_YORK, month: "short", day: "numeric" })}`;
}

// The 52-week range: a slim track, filled to today's price, with today as a
// gold dot (gold marks the current figure, phase ten).
function RangeBar({ low, high, price }: { low: number; high: number; price: number | null }) {
  const span = high - low;
  const position = price != null && span > 0 ? Math.min(100, Math.max(0, ((price - low) / span) * 100)) : null;
  const belowHigh = price != null && high > 0 ? ((high - price) / high) * 100 : null;
  return (
    <div className="rf-range">
      <div className="rf-range-ends">
        <span className="rf-lbl">52-week low {formatPrice(low)}</span>
        <span className="rf-lbl">high {formatPrice(high)}</span>
      </div>
      <div className="rf-range-track" aria-hidden="true">
        {position != null && (
          <>
            <div className="rf-range-fill" style={{ width: `${position}%` }} />
            <div className="rf-range-marker" style={{ left: `${position}%` }} />
          </>
        )}
      </div>
      {belowHigh != null && (
        <div className="rf-lbl rf-range-note">
          {belowHigh < 0.05 ? "At its 52-week high" : `${formatPct(belowHigh)} below its 52-week high`}
        </div>
      )}
    </div>
  );
}

export function CompanyHeader({ symbol, name, exchange, sector, fiscalYearEnd, quote, range52, nextEarnings }: CompanyHeaderProps) {
  const fyMonth = fiscalYearEndMonth(fiscalYearEnd);
  const kicker = [exchange, sector].filter(Boolean).join(" · ");
  // A rise or fall is marked by an arrow as well as its colour.
  const direction = quote ? (quote.change > 0 ? "pos" : quote.change < 0 ? "neg" : "flat") : "flat";

  return (
    <header className="rf-head">
      <div className="rf-head-main">
        {(kicker || fyMonth) && (
          <div className="rf-lbl">
            {kicker}
            {kicker && fyMonth ? " · " : ""}
            {fyMonth && (
              <>
                <span className="rf-long">Fiscal year ends</span>
                <span className="rf-short">FY ends</span> {fyMonth}
              </>
            )}
          </div>
        )}
        <div className="rf-title-row">
          <h1 className="rf-title">{name}</h1>
          <span className="rf-ticker">{symbol}</span>
        </div>
        {quote ? (
          <div className="rf-price-row">
            <span className="rf-price">{formatPrice(quote.price)}</span>
            <span className={`rf-change ${direction}`}>
              {direction !== "flat" && <span aria-hidden="true">{direction === "pos" ? "▲" : "▼"} </span>}
              {formatSignedNumber(quote.change)} ({formatSignedPct(quote.changePct, 2)})
            </span>
            <span className="rf-lbl">{sessionLabel(quote.asOf)}</span>
          </div>
        ) : (
          <div className="rf-price-row rf-muted">Price unavailable right now</div>
        )}
      </div>
      {(range52 || nextEarnings) && (
        <div className="rf-head-side">
          {range52 && <RangeBar low={range52.low} high={range52.high} price={quote?.price ?? null} />}
          {nextEarnings && (
            <div className="rf-head-next">
              <span className="rf-lbl">Next earnings</span>
              <span className="rf-head-next-date">
                {DAY.format(new Date(nextEarnings.date))}
                {nextEarnings.hour ? ` · ${HOUR_WORDS[nextEarnings.hour]}` : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
