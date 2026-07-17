"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/analysis/indicators";
import { usePortfolio } from "./PortfolioProvider";

export function TradeModal() {
  const { tradeModal, closeTrade, setTradeSide, executeTrade, account, positions } = usePortfolio();
  const [shares, setShares] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tradeModal.open) {
      setShares("");
      setError(null);
    }
  }, [tradeModal.open, tradeModal.sym]);

  if (!tradeModal.open) return null;

  const owned = positions.find((p) => p.ticker === tradeModal.sym)?.shares ?? 0;
  const sharesNum = parseInt(shares, 10) || 0;
  const value = sharesNum * tradeModal.price;

  function quickAmount(pct: number) {
    const n =
      tradeModal.side === "buy"
        ? Math.floor(((account?.cash ?? 0) * pct) / tradeModal.price)
        : Math.floor(owned * pct);
    setShares(String(Math.max(n, 0)));
  }

  async function handleConfirm() {
    if (sharesNum <= 0) {
      setError("Enter a positive number of shares.");
      return;
    }
    setSubmitting(true);
    const err = await executeTrade(sharesNum);
    setSubmitting(false);
    if (err) setError(err);
  }

  const position = positions.find((p) => p.ticker === tradeModal.sym);
  const realizedPL = position ? (tradeModal.price - position.avgCost) * sharesNum : 0;

  return (
    <div
      className="trade-backdrop open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tradeTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeTrade();
      }}
    >
      <div className="trade-modal">
        <div className="label">Place a Paper Order</div>
        <h2 id="tradeTitle">
          Trade <span>{tradeModal.sym}</span>
        </h2>
        <div className="sub">
          Live price · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
        <div className="trade-toggle" role="tablist">
          <button
            type="button"
            className={tradeModal.side === "buy" ? "active" : ""}
            role="tab"
            aria-selected={tradeModal.side === "buy"}
            onClick={() => setTradeSide("buy")}
          >
            Buy
          </button>
          <button
            type="button"
            className={tradeModal.side === "sell" ? "active sell-tab" : ""}
            role="tab"
            aria-selected={tradeModal.side === "sell"}
            onClick={() => setTradeSide("sell")}
          >
            Sell
          </button>
        </div>
        <div style={{ marginTop: 18 }}>
          <div className="row">
            <span className="lbl">Last Price</span>
            <span className="val">${fmt(tradeModal.price)}</span>
          </div>
          <div className="row">
            <span className="lbl">{tradeModal.side === "buy" ? "Cash Available" : "Shares Owned"}</span>
            <span className="val">
              {tradeModal.side === "buy" ? `$${fmt(account?.cash ?? 0)}` : owned}
            </span>
          </div>
        </div>
        <div className="shares-input">
          <label htmlFor="tradeSharesInput">Shares</label>
          <input
            id="tradeSharesInput"
            type="number"
            min={0}
            step={1}
            placeholder="0"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
          />
        </div>
        <div className="quick-amounts">
          {[0.25, 0.5, 0.75, 1.0].map((pct) => (
            <button key={pct} type="button" onClick={() => quickAmount(pct)}>
              {pct === 1 ? "Max" : `${pct * 100}%`}
            </button>
          ))}
        </div>
        <div className="summary">
          {sharesNum ? (
            tradeModal.side === "buy" ? (
              <>
                Buy <strong>{sharesNum}</strong> shares of <strong>{tradeModal.sym}</strong> at $
                {fmt(tradeModal.price)} = <strong>${fmt(value)}</strong>.
                <br />
                <span style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.05em" }}>
                  Cash after: ${fmt((account?.cash ?? 0) - value)}
                </span>
              </>
            ) : (
              <>
                Sell <strong>{sharesNum}</strong> shares of <strong>{tradeModal.sym}</strong> at $
                {fmt(tradeModal.price)} = <strong>${fmt(value)}</strong>.
                <br />
                <span style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.05em" }}>
                  Realized P&amp;L:{" "}
                  <span className={realizedPL >= 0 ? "pos" : "neg"}>
                    {realizedPL >= 0 ? "+" : "-"}${fmt(Math.abs(realizedPL))}
                  </span>
                </span>
              </>
            )
          ) : (
            "Enter a number of shares to see the order summary."
          )}
        </div>
        {error && <div className="error">{error}</div>}
        <div className="submit-row">
          <button type="button" className="cancel" onClick={closeTrade}>
            Cancel
          </button>
          <button
            type="button"
            className={tradeModal.side === "buy" ? "confirm-buy" : "confirm-sell"}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Placing…" : tradeModal.side === "buy" ? "Buy Shares" : "Sell Shares"}
          </button>
        </div>
      </div>
    </div>
  );
}
