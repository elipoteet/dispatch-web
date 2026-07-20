import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ResearchDesk } from "@/components/research/ResearchDesk";
import { loadReport, TICKER_PATTERN, TickerDataError } from "@/lib/analysis/loadReport";

const ASOF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Props = {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ asOf?: string }>;
};

async function resolve(props: Props) {
  const { ticker: raw } = await props.params;
  const { asOf: asOfParam } = await props.searchParams;

  // Canonical URLs are lowercase — redirect case variants rather than
  // serving the same memo at two addresses.
  if (raw !== raw.toLowerCase()) {
    redirect(`/research/${raw.toLowerCase()}`);
  }

  const ticker = raw.toUpperCase();
  if (!TICKER_PATTERN.test(ticker)) notFound();

  const asOf = asOfParam && ASOF_PATTERN.test(asOfParam) ? asOfParam : null;

  try {
    const { report, rows } = await loadReport(ticker, asOf);
    return { ticker, asOf, report, rows };
  } catch (err) {
    if (err instanceof TickerDataError) notFound();
    // Missing API key etc. — a real 500 is more honest than a 404 here,
    // but notFound() is the only signal available without a custom error
    // boundary; config errors should be caught in dev long before this ships.
    notFound();
  }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { ticker, report } = await resolve(props);
  const description = `${report.name} (${ticker}): ${report.rating} rating, composite score ${report.composite}/10, trading at ${report.price} (${report.changeText}). Fundamentals, technicals, sentiment, risks, and catalysts — sourced and scored.`;

  return {
    title: `${ticker} Stock Analysis — ${report.rating}`,
    description,
    alternates: { canonical: `/research/${ticker.toLowerCase()}` },
    openGraph: { url: `/research/${ticker.toLowerCase()}`, description },
    twitter: { description },
  };
}

export default async function TickerResearchPage(props: Props) {
  const { ticker, asOf, report, rows } = await resolve(props);

  return (
    <section className="page active" id="page-analyzer">
      <div className="analyzer-head">
        <div className="label">Research Desk</div>
        <h1>
          {ticker} <span style={{ color: "var(--muted)", fontWeight: 400 }}>— {report.name}</span>
        </h1>
        <p>
          {report.rating} rating, composite score {report.composite}/10 at {report.price} (
          {report.changeText}). Full scorecard, fundamentals, technicals, sentiment, risks, and
          catalysts below — or look up a different ticker.
        </p>
      </div>

      <ResearchDesk
        initialTicker={ticker}
        initialReport={report}
        initialRows={rows}
        initialAsOf={asOf ?? ""}
      />
    </section>
  );
}
