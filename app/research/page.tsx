import type { Metadata } from "next";
import { TickerSearchRow } from "@/components/research/TickerSearchRow";

export const metadata: Metadata = {
  title: "Research — The Dispatch",
};

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const { ticker } = await searchParams;

  return (
    <section className="page active" id="page-analyzer">
      <div className="analyzer-head">
        <div className="label">Research Desk</div>
        <h1>Brief me on any ticker.</h1>
        <p>
          Enter a U.S.-listed symbol. The Dispatch pulls real-time price, fundamentals, analyst
          consensus, and news, and composes a structured research memo. Indicators are calculated
          live; the verdict is rule-based and shown alongside every underlying data point.
        </p>
      </div>

      <TickerSearchRow defaultTicker={ticker?.toUpperCase() ?? ""} />

      <div className="phase-stub">
        <div className="label">Phase 2</div>
        <h2>The analyzer isn&rsquo;t wired up yet.</h2>
        <p>
          This is the visual shell only — Phase 1 is scoped to authentication. The live price
          proxy, fundamentals, technicals, and sentiment memo land in Phase 2, per the backend
          architecture doc&rsquo;s build order.
        </p>
      </div>
    </section>
  );
}
