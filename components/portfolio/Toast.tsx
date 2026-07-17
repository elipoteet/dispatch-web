"use client";

import { usePortfolio } from "./PortfolioProvider";

export function Toast() {
  const { toast } = usePortfolio();
  return (
    <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
      {toast && <span dangerouslySetInnerHTML={{ __html: toast }} />}
    </div>
  );
}
