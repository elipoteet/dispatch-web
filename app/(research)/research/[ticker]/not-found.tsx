import type { Metadata } from "next";

// Rendered when loadReport() throws TickerDataError — Twelve Data confirmed
// there's no usable data for this symbol, as opposed to a transient
// provider failure (handled inline in page.tsx instead, since it isn't a
// 404 case). not-found.tsx doesn't receive route params, so this stays
// generic rather than naming the specific ticker.
//
// Set noindex explicitly rather than relying on Next's automatic injection
// for notFound() — verified empirically that it doesn't reliably apply once
// a custom not-found.tsx is in the segment.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TickerNotFound() {
  return (
    <section className="page active" id="page-analyzer">
      <div className="analyzer-head">
        <div className="label">Research Desk</div>
        <h1>We couldn&rsquo;t find that ticker.</h1>
        <p>
          Double-check that it&rsquo;s a valid, U.S.-listed symbol — try the exact exchange
          ticker (e.g. <strong>AAPL</strong>, <strong>MSFT</strong>, <strong>NVDA</strong>)
          rather than a company name. Very recently listed or thinly traded tickers may also
          not have enough price history yet.
        </p>
      </div>
    </section>
  );
}
