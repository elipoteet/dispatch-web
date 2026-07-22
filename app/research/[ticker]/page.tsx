import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ResearchDesk } from "@/components/research/ResearchDesk";
import { loadReport, TICKER_PATTERN, TickerDataError } from "@/lib/analysis/loadReport";

const ASOF_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Props = {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ asOf?: string }>;
};

// Validation only — redirect()/notFound() here must always propagate as
// themselves, so this deliberately has no try/catch around it. Called
// identically by generateMetadata and the page component below, each of
// which wraps its own loadReport() call separately instead, since they need
// different behavior when *that* fails (see comments below).
async function resolveTicker(props: Props): Promise<{ ticker: string; asOf: string | null }> {
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
  return { ticker, asOf };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { ticker, asOf } = await resolveTicker(props);

  // Degrade to plain metadata on failure rather than throwing — metadata
  // resolution isn't part of the page's own render tree, so a throw here
  // can't be handled the same way the page component handles it below.
  // Thanks to loadReport's caching, this doesn't cost a second provider
  // fetch when it does succeed.
  try {
    const { report } = await loadReport(ticker, asOf);
    const description = `${report.name} (${ticker}): ${report.rating} rating, composite score ${report.composite}/10, trading at ${report.price} (${report.changeText}). Fundamentals, technicals, sentiment, risks, and catalysts — sourced and scored.`;

    return {
      title: `${ticker} Stock Analysis — ${report.rating}`,
      description,
      alternates: { canonical: `/research/${ticker.toLowerCase()}` },
      openGraph: { url: `/research/${ticker.toLowerCase()}`, description },
      twitter: { description },
    };
  } catch {
    return { title: `${ticker} Stock Analysis` };
  }
}

export default async function TickerResearchPage(props: Props) {
  const { ticker, asOf } = await resolveTicker(props);

  let report, rows;
  try {
    ({ report, rows } = await loadReport(ticker, asOf));
  } catch (err) {
    // TickerDataError means the ticker/date genuinely has no usable data —
    // that's a real 404. Anything else (a rate-limited or momentarily down
    // provider, a network blip) is transient, not "this page doesn't
    // exist". Rendered as a normal 200 page with a friendly retry message
    // rather than thrown to an error.tsx boundary — Next's error boundary
    // proved unreliable for this route in testing (a caught error would
    // sometimes still fall through to the framework's generic not-found
    // fallback on a re-render), so handling it directly here is the more
    // dependable option.
    if (err instanceof TickerDataError) notFound();
    return (
      <section className="page active" id="page-analyzer">
        <div className="analyzer-head">
          <div className="label">Research Desk</div>
          <h1>Couldn&rsquo;t reach the market data provider.</h1>
        </div>
        <div className="status error">
          This is usually temporary — a data provider hiccup or a brief rate limit, not a
          problem with {ticker} itself.{" "}
          <a href={`/research/${ticker.toLowerCase()}`}>Refresh the page</a> in a few seconds to
          try again.
        </div>
      </section>
    );
  }

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
