import type { MarketItem, MarketsStrip } from "@/lib/research/markets";

// The old site's ticker tape, back on the home page below the hero: a navy
// band scrolling the funds and the 10-year yield, symbols in gold. Rendered on
// the server with the page (data from lib/research/markets.ts), so it's there
// from the first paint and the browser fetches nothing. Not links.
//
// The items repeat four times and the band moves one set's width a minute
// (app/globals.css), so the loop is seamless and a wide screen never shows an
// empty stretch. Screen readers get the first set only.
const SETS = 4;

function Item({ item }: { item: MarketItem }) {
  const tone = item.direction === "up" ? "tt-pos" : item.direction === "down" ? "tt-neg" : undefined;
  return (
    <span className="tt-item" title={item.title}>
      <span className="tt-sym">{item.symbol}</span>
      <span>{item.value}</span>
      {item.change && <span className={tone}>{item.change}</span>}
    </span>
  );
}

export function MarketsTape({ tape }: { tape: MarketsStrip }) {
  return (
    <div className="ticker-tape" role="marquee" aria-label="Markets">
      <div className="ticker-tape-inner">
        {Array.from({ length: SETS }, (_, set) => (
          <div className="tt-set" key={set} aria-hidden={set > 0 ? true : undefined}>
            {tape.items.map((item) => (
              <Item key={item.symbol} item={item} />
            ))}
            {tape.atClose && <span className="tt-item tt-note">At close</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
