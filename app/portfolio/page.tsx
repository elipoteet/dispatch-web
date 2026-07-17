import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PortfolioSignedOut } from "@/components/portfolio/PortfolioSignedOut";

export const metadata: Metadata = {
  title: "Portfolio — The Dispatch",
};

export default async function PortfolioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <section className="page active" id="page-portfolio">
      <div className="portfolio-head">
        <div className="label">Paper Trading</div>
        <h1>Your Portfolio</h1>
        <p>
          A simulated portfolio for testing your research without risking real money. No
          commissions, no dividends, no shorting — keep it simple.
        </p>
      </div>

      <div className="portfolio-tabs" role="tablist">
        <button className="portfolio-tab active" type="button" role="tab" aria-selected="true">
          Holdings
        </button>
        <button className="portfolio-tab" type="button" role="tab" aria-selected="false">
          Activity
        </button>
        <button className="portfolio-tab" type="button" role="tab" aria-selected="false">
          Settings
        </button>
      </div>

      {user ? (
        <div className="phase-stub">
          <div className="label">Phase 4</div>
          <h2>Signed in as {user.email}.</h2>
          <p>
            Auth is working end to end — this is proof. The paper-trading account, positions, and
            transaction history move server-side in Phase 4, once the price proxy (Phase 2) and
            watchlist (Phase 3) are in place.
          </p>
        </div>
      ) : (
        <PortfolioSignedOut />
      )}
    </section>
  );
}
