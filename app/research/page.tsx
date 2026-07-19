import type { Metadata } from "next";
import { ResearchDesk } from "@/components/research/ResearchDesk";

export const metadata: Metadata = {
  title: "Research",
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
          live; the verdict is rule-based and shown alongside every underlying data point. Use the
          Time Machine below to see the memo as it would have read on any past date, then compare
          it straight to today.
        </p>
      </div>

      <ResearchDesk initialTicker={ticker?.toUpperCase() ?? ""} />
    </section>
  );
}
