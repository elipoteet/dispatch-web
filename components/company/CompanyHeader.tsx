import { fiscalYearEndMonth, formatPct, formatPrice, formatSignedNumber, formatSignedPct } from "@/lib/research/format";
import { PaperTradeButton } from "./PaperTradeButton";

export type CompanyHeaderProps = {
  symbol: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  fiscalYearEnd: string | null;
  quote: { price: number; change: number; changePct: number; asOf: number } | null;
  range52: { low: number; high: number } | null;
};

const NEW_YORK = "America/New_York";

// "today" only when the last trade happened on today's New York date; on a
// weekend or holiday, name the session the change belongs to instead.
function sessionLabel(asOf: number): string {
  const traded = new Date(asOf * 1000);
  const sameDay =
    traded.toLocaleDateString("en-US", { timeZone: NEW_YORK }) === new Date().toLocaleDateString("en-US", { timeZone: NEW_YORK });
  return sameDay ? "today" : `on ${traded.toLocaleDateString("en-US", { timeZone: NEW_YORK, month: "short", day: "numeric" })}`;
}

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

export function CompanyHeader({ symbol, name, exchange, sector, fiscalYearEnd, quote, range52 }: CompanyHeaderProps) {
  const fyMonth = fiscalYearEndMonth(fiscalYearEnd);
  const kicker = [exchange, sector, fyMonth ? `FY ends ${fyMonth}` : null].filter(Boolean).join(" · ");
  const up = quote ? quote.change >= 0 : true;

  return (
    <header className="rf-head">
      <div className="rf-head-main">
        {kicker && <div className="rf-lbl">{kicker}</div>}
        <div className="rf-title-row">
          <h1 className="rf-title">{name}</h1>
          <span className="rf-ticker">{symbol}</span>
        </div>
        {quote ? (
          <div className="rf-price-row">
            <span className="rf-price">{formatPrice(quote.price)}</span>
            <span className={`rf-change ${up ? "pos" : "neg"}`}>
              {formatSignedNumber(quote.change)} ({formatSignedPct(quote.changePct, 2)}) {sessionLabel(quote.asOf)}
            </span>
          </div>
        ) : (
          <div className="rf-price-row rf-muted">Price unavailable right now</div>
        )}
      </div>
      <div className="rf-head-side">
        {range52 && <RangeBar low={range52.low} high={range52.high} price={quote?.price ?? null} />}
        {quote && (
          <div className="rf-actions">
            <PaperTradeButton symbol={symbol} price={quote.price} />
          </div>
        )}
      </div>
    </header>
  );
}
