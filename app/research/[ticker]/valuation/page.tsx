import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loadCompanyPage } from "@/lib/research/company";
import { isCrawler } from "@/lib/research/crawler";
import { loadValuation, metricsFor, type MetricKey, type ValuationData } from "@/lib/research/valuationPage";
import { historyWindowStart } from "@/lib/research/valuation";
import { formatMoney, formatPct } from "@/lib/research/format";
import { PricedIn } from "@/components/company/PricedIn";
import { METRIC_LABELS, ValuationHistory, formatMetric } from "@/components/company/ValuationHistory";

type Props = { params: Promise<{ ticker: string }> };

// Room for peers nobody has opened yet to be read from the SEC after the
// response has gone, one at a time. The page itself never waits on them.
export const maxDuration = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const company = await loadCompanyPage(decodeURIComponent(ticker).toUpperCase());
  if (!company || !company.filesReports) return { title: "Not found", robots: { index: false, follow: false } };
  const path = `/research/${company.slug}/valuation`;
  // A bank's tab has no calculator and shows price to book in place of EV/sales.
  const description =
    company.financials?.filerKind === "financial"
      ? `${company.name} (${company.symbol}) valuation: its yields, P/E and price to book against ten years of its own history, and its peers. From its SEC filings.`
      : `${company.name} (${company.symbol}) valuation: the growth today's price implies, its yields, P/E and EV/sales against ten years of its own history, and its peers. From its SEC filings.`;
  return {
    title: `${company.name} (${company.symbol}) valuation`,
    description,
    alternates: { canonical: path },
    openGraph: { url: path, description },
    twitter: { description },
  };
}

const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function pctOrDash(v: number | null): string {
  return v == null ? "—" : formatPct(v * 100);
}

function Yields({ data, name }: { data: ValuationData; name: string }) {
  const t = data.today;
  const cells: { id: string; label: string; value: string; note: string }[] = [];
  if (data.filerKind !== "financial") {
    cells.push({
      id: "fcf",
      label: "Free cash flow yield",
      value: pctOrDash(t?.fcfYield ?? null),
      note: "Free cash flow over the trailing four quarters ÷ market value",
    });
  }
  cells.push({
    id: "earnings",
    label: "Earnings yield",
    value: pctOrDash(t?.earningsYield ?? null),
    note: "Net income over the trailing four quarters ÷ market value",
  });
  cells.push({
    id: "buyback",
    label: "Buyback yield",
    value: t?.buybacks == null ? "—" : pctOrDash(t.buybackYield),
    note: t?.buybacks == null ? `${name} reported no share repurchases over the trailing four quarters` : "Shares repurchased over the trailing four quarters ÷ market value",
  });
  cells.push({
    id: "treasury",
    label: "10-year Treasury",
    value: data.treasury ? formatPct(data.treasury.percent, 2) : "—",
    note: data.treasury ? `For scale. U.S. Treasury yield curve, ${DAY.format(new Date(data.treasury.date))}` : "The Treasury's daily rates couldn't be loaded just now",
  });
  return (
    <div className="rf-stats">
      {cells.map((c) => (
        <div className="rf-stat" key={c.id}>
          <span className="rf-lbl">{c.label}</span>
          <span className="rf-stat-value">{c.value}</span>
          <span className="rf-stat-note">{c.note}</span>
        </div>
      ))}
    </div>
  );
}

function Peers({ data, symbol, name, metrics }: { data: ValuationData; symbol: string; name: string; metrics: MetricKey[] }) {
  if (!data.peers) {
    return <p className="rf-note">Finnhub&rsquo;s list of peers couldn&rsquo;t be loaded just now. Try again in a minute.</p>;
  }
  if (data.peers.length === 0) {
    return <p className="rf-note">Finnhub lists no peers for this company that file with the SEC.</p>;
  }
  const cols = metrics;
  const fmt = (key: MetricKey, v: number | null) => (v == null ? "—" : formatMetric(key, v));
  const growth = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : "-"}${Math.abs(v * 100).toFixed(1)}%`);
  const loading = data.peers.some((p) => p.status === "loading");
  return (
    <>
      <div className="rf-table-scroll" tabIndex={0} role="region" aria-label={`${name} and its peers`}>
        <table className="rf-table rf-peers">
          <thead>
            <tr>
              <th scope="col">Company</th>
              <th scope="col">Market value</th>
              {cols.map((k) => (
                <th scope="col" key={k}>
                  {METRIC_LABELS[k].title}
                </th>
              ))}
              <th scope="col">Revenue growth</th>
            </tr>
          </thead>
          <tbody>
            {data.today && (
              <tr className="is-emphasis">
                <th scope="row">
                  {name} <span className="rf-ticker">{symbol}</span>
                </th>
                <td>{formatMoney(data.today.marketValue)}</td>
                {cols.map((k) => (
                  <td key={k}>{fmt(k, data.today![k])}</td>
                ))}
                <td>{growth(data.today.revenueGrowth)}</td>
              </tr>
            )}
            {data.peers.map((p) => (
              <tr key={p.symbol}>
                <th scope="row">
                  <a href={`/research/${p.symbol.toLowerCase()}/valuation`}>{p.name}</a> <span className="rf-ticker">{p.symbol}</span>
                </th>
                {p.status === "ready" ? (
                  <>
                    <td>{formatMoney(p.figures.marketValue)}</td>
                    {cols.map((k) => (
                      <td key={k}>{fmt(k, p.figures[k])}</td>
                    ))}
                    <td>{growth(p.figures.revenueGrowth)}</td>
                  </>
                ) : (
                  <td colSpan={cols.length + 2} className="rf-peers-wait">
                    {p.status === "loading" ? "Loading its filings. Refresh in a minute." : "No current price."}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rf-vh-def">
        Peers as listed by Finnhub, U.S. filers only, capped at six. Each figure is worked out the same way as {name}&rsquo;s,
        from that company&rsquo;s own filings and current price.
        {loading && " Companies nobody has opened here yet are read from the SEC in the background."}
      </p>
    </>
  );
}

export default async function ValuationPage({ params }: Props) {
  const { ticker } = await params;
  const company = await loadCompanyPage(decodeURIComponent(ticker).toUpperCase());
  if (!company || !company.filesReports) notFound();

  if (company.financialsUnavailable) {
    return (
      <div className="rf-tab-body">
        <p className="rf-note">{company.financialsUnavailable}</p>
      </div>
    );
  }
  // A crawler sees stored peers only, and loads none (lib/research/crawler.ts).
  const data = await loadValuation(company, { background: !isCrawler((await headers()).get("user-agent")) });
  if (!data) {
    return (
      <div className="rf-tab-body">
        <p className="rf-note">The SEC&rsquo;s figures for this company couldn&rsquo;t be loaded just now. Try again in a minute.</p>
      </div>
    );
  }

  const name = company.name;
  const metrics = metricsFor(data.filerKind);
  const t = data.today;
  const through = t ? MONTH_YEAR.format(new Date(t.through.periodEnd)) : null;
  // Named by the first quarter-end actually shown, so the heading and the
  // sentences under it agree.
  const since = data.history[0]?.periodEnd ?? historyWindowStart(new Date().toISOString().slice(0, 10));

  // The calculator, or one line on why it isn't here.
  let pricedIn: React.ReactNode;
  if (data.filerKind === "financial") {
    pricedIn = (
      <p className="rf-note">
        What&rsquo;s priced in works from free cash flow, which doesn&rsquo;t describe a bank or insurer (see Financials), so
        it isn&rsquo;t shown here.
      </p>
    );
  } else if (!t) {
    pricedIn = <p className="rf-note">Today&rsquo;s market value couldn&rsquo;t be worked out just now, so the calculator isn&rsquo;t shown. Try again in a minute.</p>;
  } else if (t.fcf == null) {
    pricedIn = (
      <p className="rf-note">
        What&rsquo;s priced in needs free cash flow for the trailing four quarters, and {name}&rsquo;s filings don&rsquo;t give all four.
      </p>
    );
  } else if (t.fcf <= 0) {
    pricedIn = (
      <p className="rf-note">
        {`Free cash flow over the four quarters to ${through} was ${formatMoney(t.fcf)}, so there's no positive starting point to grow from, and the calculator isn't shown.`}
      </p>
    );
  } else {
    pricedIn = <PricedIn marketValue={t.marketValue} baseFcf={t.fcf} baseLabel={`the four quarters to ${through}`} />;
  }

  const todayValues: Record<MetricKey, number | null> = {
    pe: t?.pe ?? null,
    evSales: t?.evSales ?? null,
    fcfYield: t?.fcfYield ?? null,
    pb: t?.pb ?? null,
  };
  const missingToday: Record<MetricKey, string> = {
    pe: t && t.netIncome != null && t.netIncome <= 0 ? "No P/E today: net income over the trailing four quarters was a loss." : "No P/E today: the latest filings don't give a full trailing year of net income.",
    evSales: "No EV/sales today: it needs debt, cash and revenue as of the latest quarter, and the latest filing doesn't give all three in a standard form.",
    fcfYield: "No free cash flow yield today: the latest filings don't give a full trailing year of free cash flow.",
    pb: "No price to book today: the latest balance sheet doesn't give shareholders' equity.",
  };

  const coverDate = data.shares?.coverDate ? DAY.format(new Date(data.shares.coverDate)) : null;
  const sharesLine =
    data.shares?.source === "cover"
      ? `Market value: today's price × the ${coverDate} share count on the cover of ${name}'s latest filing, checked against Finnhub's count.`
      : data.shares?.source === "finnhub"
        ? coverDate
          ? `Market value: Finnhub's. It differs from today's price × the ${coverDate} count on the cover of ${name}'s latest filing by more than buybacks would explain (usually a stock split since, or a share class the cover leaves out).`
          : `Market value: Finnhub's. ${name}'s recent filings don't state a single share count on the cover, which is usual for a company with more than one class of shares.`
        : null;

  return (
    <div className="rf-tab-body">
      {pricedIn}

      <section className="rf-sec" aria-labelledby="rf-yields">
        <div className="rf-sechead">
          <div>
            <div className="rf-lbl rf-kicker">Yields</div>
            <h2 className="rf-h2" id="rf-yields">
              Cash, earnings and repurchases against market value
            </h2>
          </div>
          {through && <span className="rf-lbl">Trailing four quarters to {through}</span>}
        </div>
        <Yields data={data} name={name} />
      </section>

      <section className="rf-sec" aria-labelledby="rf-history">
        <div className="rf-sechead">
          <div>
            <div className="rf-lbl rf-kicker">Against its own history</div>
            <h2 className="rf-h2" id="rf-history">
              Today&rsquo;s multiples against past quarter-ends
            </h2>
          </div>
          <span className="rf-lbl">Each quarter-end since {MONTH_YEAR.format(new Date(since))}</span>
        </div>
        {data.historyStatus === "busy" ? (
          <div className="rf-chart-pending">The price history behind this section is updating. Try again in a minute.</div>
        ) : data.historyStatus === "no-shares" || data.historyStatus === "mismatch" ? (
          <p className="rf-note">
            {data.historyStatus === "no-shares"
              ? "Past market values need a share count for each quarter, and these filings don't give one in a standard form, so there's no history to compare against."
              : "Past market values can't be put on the same footing as today's: the filings count shares one way and the quoted price is for another (usual where a company has share classes at different prices). Rather than show figures that are off, this section is left out."}
          </p>
        ) : data.historyStatus === "unavailable" || data.history.length === 0 ? (
          <p className="rf-note">The price history behind this section couldn&rsquo;t be loaded just now. Try again in a minute.</p>
        ) : (
          <ValuationHistory
            metrics={metrics}
            points={data.history}
            ranges={data.ranges}
            today={todayValues}
            since={data.history[0].periodEnd}
            missingToday={missingToday}
          />
        )}
      </section>

      <section className="rf-sec" aria-labelledby="rf-peers">
        <div className="rf-sechead">
          <div>
            <div className="rf-lbl rf-kicker">Peers</div>
            <h2 className="rf-h2" id="rf-peers">
              The same figures for similar companies
            </h2>
          </div>
          <span className="rf-lbl">Today</span>
        </div>
        <Peers data={data} symbol={company.symbol} name={name} metrics={metrics} />
      </section>

      <div className="rf-sourceline">
        {sharesLine && <p>{sharesLine}</p>}
        <p>
          {`Trailing figures: the four quarters${through ? ` to ${through}` : ""}, from ${name}'s 10-Q and 10-K filings with the SEC. Free cash flow is operating cash flow minus capital expenditure, calculated by The Dispatch.`}
        </p>
        <p>
          History: each quarter-end&rsquo;s closing price × the share count stated in that quarter&rsquo;s filing, with stock
          splits accounted for. Enterprise value is market value plus debt minus cash and equivalents, all as of the same date.
          Debt is long-term debt as filed; quarterly filings often state only the part due after the coming year, so a
          quarter&rsquo;s figure can be slightly lower than a year-end&rsquo;s. Prices from Twelve Data.
        </p>
      </div>
    </div>
  );
}
