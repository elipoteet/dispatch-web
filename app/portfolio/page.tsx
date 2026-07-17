import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PortfolioSignedOut } from "@/components/portfolio/PortfolioSignedOut";
import { PortfolioDesk } from "@/components/portfolio/PortfolioDesk";

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

      {user ? <PortfolioDesk /> : <PortfolioSignedOut />}
    </section>
  );
}
