"use client";

// A quick "which account is this trade for" step — only ever shown to a
// user who's opted into the Monthly Leaderboard, since the Trade button on
// a research memo is the one universal "buy a new ticker" entry point in
// the app and it has to serve both the regular paper-trading account and
// the separate competition account. Picking either option opens that
// account's own existing, unmodified trade modal — this component never
// touches trade state itself, it only decides which provider's
// openTrade() to call. Reuses the onboarding modal's shell/grid classes
// (app/globals.css) rather than inventing new CSS for a two-button dialog.
export function TradeAccountChooser({
  ticker,
  onChoosePortfolio,
  onChooseCompetition,
  onClose,
}: {
  ticker: string;
  onChoosePortfolio: () => void;
  onChooseCompetition: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="onboard-backdrop open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tradeChooserTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="onboard-modal">
        <div className="label">Place a Trade</div>
        <h2 id="tradeChooserTitle">
          Trade {ticker} for which account?
        </h2>
        <p>You&rsquo;re opted into the Monthly Leaderboard — pick which account this order applies to.</p>
        <div className="onboard-options">
          <button className="onboard-option" type="button" onClick={onChoosePortfolio}>
            <span className="amt">Portfolio</span>
            <span className="desc">Your Regular Account</span>
          </button>
          <button className="onboard-option" type="button" onClick={onChooseCompetition}>
            <span className="amt">Competition</span>
            <span className="desc">Monthly Leaderboard</span>
          </button>
        </div>
      </div>
    </div>
  );
}
