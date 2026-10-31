"use client";

import { usePortfolio } from "@/components/portfolio/PortfolioProvider";

// The way into the portfolio simulator from a company page. It used to be the
// memo's Trade button; the simulator stays (Eli, 30 October 2026), so the new
// page needs its own door. Opens the same trade window, which handles
// signed-out visitors itself.
export function PaperTradeButton({ symbol, price }: { symbol: string; price: number }) {
  const { openTrade } = usePortfolio();
  return (
    <button type="button" className="rf-btn rf-btn-solid" onClick={() => openTrade(symbol, price)}>
      Paper trade
    </button>
  );
}
