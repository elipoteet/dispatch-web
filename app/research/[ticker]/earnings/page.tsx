import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadCompanyPage } from "@/lib/research/company";
import { loadEarnings } from "@/lib/research/earningsPage";
import { formatEps, outlookRange } from "@/lib/research/earnings";
import { formatMoney } from "@/lib/research/format";
import { QuarterBars, type BarColumn } from "@/components/company/QuarterBars";

type Props = { params: Promise<{ ticker: string }> };

// Room for the first visit to read five earnings releases from the SEC.
export const maxDuration = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const company = await loadCompanyPage(decodeURIComponent(ticker).toUpperCase());
  if (!company || !company.filesReports) return { title: "Not found", robots: { index: false, follow: false } };
  const path = `/research/${company.slug}/earnings`;
  const description = `${company.name} (${company.symbol}) earnings: the next report date, quarterly revenue and EPS from its filings, results against the average estimate, and its own revenue outlook where its release states one.`;
  return {
    title: `${company.name} (${company.symbol}) earnings`,
    description,
    alternates: { canonical: path },
    openGraph: { url: path, description },
    twitter: { description },
  };
}

const LONG_DATE = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const WHEN = { bmo: "before the market opens", amc: "after the market closes", dmh: "during market hours" } as const;

const billions = (v: number) => {
  const b = v / 1e9;
  return Math.abs(b) >= 100 ? `${b.toFixed(0)}` : Math.abs(b) >= 1 ? b.toFixed(1) : b.toFixed(2);
};

export default async function EarningsPage({ params }: Props) {
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
  const data = await loadEarnings(company);
  if (!data || data.quarters.length === 0) {
    return (
      <div className="rf-tab-body">
        <p className="rf-note">The SEC&rsquo;s figures for this company couldn&rsquo;t be loaded just now. Try again in a minute.</p>
      </div>
    );
  }

  const name = company.name;
  const { next, upcoming, quarters } = data;
  const nextLabel = data.nextLabel;
  const anyOutlook = Boolean(upcoming) || quarters.some((q) => q.outlook);
  const pastOutlooks = quarters.filter((q) => q.outlook && q.revenue != null);

  const revenueColumns: BarColumn[] = quarters.map((q) => ({
    key: q.label,
    label: q.label,
    value: q.revenue,
    outlook: q.outlook ? { low: q.outlook.low, high: q.outlook.high, mid: q.outlook.mid } : null,
  }));
  if (upcoming && nextLabel && data.upcomingInChart) {
    revenueColumns.push({ key: "next", label: `${nextLabel} (next)`, value: null, outlook: { low: upcoming.low, high: upcoming.high, mid: upcoming.mid } });
  }
  const epsColumns: BarColumn[] = quarters.map((q) => ({ key: q.label, label: q.label, value: q.eps, calculated: q.epsCalculated }));
  const anyCalculated = quarters.some((q) => q.eps != null && q.epsCalculated);
  const scaleIsBillions = quarters.some((q) => (q.revenue ?? 0) >= 1e9);
  const revenueFormat = scaleIsBillions ? billions : (v: number) => (v / 1e6).toFixed(1);

  return (
    <div className="rf-tab-body">
      <section className="rf-sec rf-next" aria-labelledby="rf-next-report">
        <div>
          <div className="rf-lbl rf-kicker">Next report{nextLabel ? ` · ${nextLabel}` : ""}</div>
          <h2 className="rf-h2 rf-next-date" id="rf-next-report">
            {next ? (
              <>
                {LONG_DATE.format(new Date(next.date))}
                {next.hour ? `, ${WHEN[next.hour]}` : ""}
              </>
            ) : (
              "No date yet"
            )}
          </h2>
        </div>
        {!next && <p className="rf-next-line rf-muted">The next report date isn&rsquo;t on Finnhub&rsquo;s calendar yet.</p>}
        {next && (next.epsEstimate != null || next.revenueEstimate != null) && (
          <p className="rf-next-line">
            {"The average analyst estimate, as compiled by Finnhub: "}
            {[
              next.epsEstimate != null ? `EPS of ${formatEps(next.epsEstimate)}` : null,
              next.revenueEstimate != null ? `revenue of ${formatMoney(next.revenueEstimate)}` : null,
            ]
              .filter(Boolean)
              .join(" and ")}
            .
          </p>
        )}
        {upcoming ? (
          <>
            <p className="rf-next-line">
              {`${name}'s own outlook, from its ${SHORT_DATE.format(new Date(upcoming.releaseFiled))} earnings release:`}
            </p>
            <blockquote className="rf-quote">&ldquo;{upcoming.quote}&rdquo;</blockquote>
            <p className="rf-next-line rf-muted">
              {`That is revenue of ${outlookRange(upcoming)}.`}{" "}
              {upcoming.releaseUrl && (
                <a href={upcoming.releaseUrl} target="_blank" rel="noopener noreferrer">
                  Read the release
                </a>
              )}
            </p>
          </>
        ) : (
          data.newestRelease && (
            <p className="rf-next-line rf-muted">
              {`No revenue figure for the coming quarter was found in ${name}'s latest earnings release (${SHORT_DATE.format(new Date(data.newestRelease.filed))}). Many companies give their outlook on the conference call, as a growth rate, or not at all; this page quotes one only when the release states it.`}{" "}
              {data.newestRelease.url && (
                <a href={data.newestRelease.url} target="_blank" rel="noopener noreferrer">
                  Read the release
                </a>
              )}
            </p>
          )
        )}
      </section>

      <section className="rf-panel" aria-labelledby="rf-rev-q">
        <div className="rf-panel-head">
          <h2 className="rf-panel-title" id="rf-rev-q">
            Revenue by quarter
          </h2>
          <span className="rf-lbl">{scaleIsBillions ? "$ billions" : "$ millions"}</span>
        </div>
        <QuarterBars columns={revenueColumns} format={revenueFormat} label={`${name} revenue by quarter`} />
        <div className="rf-legend">
          <span>
            <span className="rf-legend-solid" /> Reported, from the 10-Q and 10-K filings
          </span>
          {anyOutlook && (
            <span>
              <span className="rf-legend-hatch" /> {name}&rsquo;s own outlook, from the earnings release a quarter earlier
            </span>
          )}
        </div>
      </section>

      {pastOutlooks.length > 0 && (
        <section className="rf-sec" aria-labelledby="rf-outlooks">
          <div>
            <div className="rf-lbl rf-kicker">Outlook against reported</div>
            <h2 className="rf-h2" id="rf-outlooks">
              The company&rsquo;s own outlook against what it then reported
            </h2>
          </div>
          <div className="rf-table-scroll" tabIndex={0} role="region" aria-label="Outlook against reported revenue">
            <table className="rf-table rf-est">
              <thead>
                <tr>
                  <th scope="col">Quarter</th>
                  <th scope="col">Outlook</th>
                  <th scope="col">Reported</th>
                  <th scope="col">Given in</th>
                </tr>
              </thead>
              <tbody>
                {pastOutlooks.map((q) => (
                  <tr key={q.label}>
                    <th scope="row">{q.label}</th>
                    <td>{outlookRange(q.outlook!)}</td>
                    <td>{formatMoney(q.revenue!)}</td>
                    <td>
                      {q.outlook!.releaseUrl ? (
                        <a href={q.outlook!.releaseUrl} target="_blank" rel="noopener noreferrer">
                          {SHORT_DATE.format(new Date(q.outlook!.releaseFiled))} release
                        </a>
                      ) : (
                        `${SHORT_DATE.format(new Date(q.outlook!.releaseFiled))} release`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rf-panel" aria-labelledby="rf-eps-q">
        <div className="rf-panel-head">
          <h2 className="rf-panel-title" id="rf-eps-q">
            Diluted EPS by quarter
          </h2>
          <span className="rf-lbl">$ per share, as reported</span>
        </div>
        {data.epsStatus === "ok" ? (
          <QuarterBars columns={epsColumns} format={(v) => v.toFixed(2)} label={`${name} diluted earnings per share by quarter`} />
        ) : (
          <div className="rf-chart-pending">
            {data.epsStatus === "busy"
              ? "Updating, try again in a minute."
              : "EPS can't be shown just now: it has to be put on today's share basis first, and the check for stock splits didn't run."}
          </div>
        )}
        {data.epsStatus === "ok" && <p className="rf-vh-def" style={{ marginTop: 12 }}>On today&rsquo;s share basis: figures from before a stock split are divided by it, so every quarter compares.</p>}
        {data.epsStatus === "ok" && anyCalculated && (
          <p className="rf-vh-def" style={{ marginTop: 12 }}>
            ‡ A fourth quarter is the year&rsquo;s EPS less the first three quarters&rsquo;, calculated by The Dispatch: a 10-K
            reports the year, not the quarter. It can differ by a cent or two from the company&rsquo;s own figure, because the share
            count moves during the year.
          </p>
        )}
      </section>

      <section className="rf-sec" aria-labelledby="rf-estimates">
        <div className="rf-sechead">
          <div>
            <div className="rf-lbl rf-kicker">Estimates</div>
            <h2 className="rf-h2" id="rf-estimates">
              EPS against the average estimate
            </h2>
          </div>
          <span className="rf-lbl">Last four quarters</span>
        </div>
        {data.estimates && data.estimates.length > 0 ? (
          <>
            <div className="rf-table-scroll" tabIndex={0} role="region" aria-label="EPS against the average estimate">
              <table className="rf-table rf-est">
                <thead>
                  <tr>
                    <th scope="col">Quarter</th>
                    <th scope="col">Average estimate</th>
                    <th scope="col">Reported</th>
                    <th scope="col">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.estimates.map((e) => (
                    <tr key={e.label}>
                      <th scope="row">{e.label}</th>
                      <td>{formatEps(e.estimate)}</td>
                      <td>{formatEps(e.actual)}</td>
                      <td>{`EPS ${e.sentence}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="rf-vh-def">
              Both from Finnhub. Its reported figures are on the same basis as analysts&rsquo; estimates, which usually leave out
              some one-off items, so they can differ from the diluted EPS above, which is as filed with the SEC.
            </p>
          </>
        ) : (
          <p className="rf-note">Finnhub has no estimates on record for {company.symbol}, or couldn&rsquo;t be reached just now.</p>
        )}
      </section>

      <div className="rf-sourceline">
        <p>
          {`Revenue and EPS: ${name}'s 10-Q and 10-K filings, from SEC EDGAR. Outlooks: the company's earnings releases (exhibit 99.1 to its 8-K filings), quoted as written; only a revenue figure stated for the coming quarter is read, and the last five releases are checked. Next report date and estimates: Finnhub.`}
        </p>
      </div>
    </div>
  );
}
