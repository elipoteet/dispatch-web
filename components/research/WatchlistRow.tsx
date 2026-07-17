export function WatchlistRow({
  tickers,
  onSelect,
  onRemove,
}: {
  tickers: string[];
  onSelect: (sym: string) => void;
  onRemove: (sym: string) => void;
}) {
  if (!tickers.length) return null;

  return (
    <div className="watchlist-row" aria-label="Recently viewed tickers">
      <span className="label">Watchlist</span>
      {tickers.map((sym) => (
        <button
          key={sym}
          className="watchlist-chip"
          type="button"
          aria-label={`Analyze ${sym}`}
          onClick={() => onSelect(sym)}
        >
          <span>{sym}</span>
          <span
            className="remove"
            role="button"
            aria-label={`Remove ${sym} from watchlist`}
            title="Remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(sym);
            }}
          >
            ×
          </span>
        </button>
      ))}
    </div>
  );
}
