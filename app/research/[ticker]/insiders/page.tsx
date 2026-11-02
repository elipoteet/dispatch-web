import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { after } from "next/server";
import { isCrawler } from "@/lib/research/crawler";
import { notFound } from "next/navigation";
import { loadCompanyPage } from "@/lib/research/company";
import { filingIndexUrl, getSubmissions } from "@/lib/sec/client";
import {
  filingsListedFrom,
  form4Filings,
  insiderWindowStart,
  readAccessions,
  readInsiderFilings,
  storedTrades,
} from "@/lib/sec/insiders";
import { isMarketTrade, summarize, summarySentences, tradeLabel, tradeValue, withoutRepeats } from "@/lib/research/insiders";
import { formatMoney, titleCaseName } from "@/lib/research/format";

type Props = {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ show?: string }>;
};

// Room for the filings not read while the visitor waited to be read after
// the page has gone: about seven a second under the SEC's limit.
export const maxDuration = 60;

// Read before the page is sent, so a first visit has something to show.
const READ_NOW = 10;
// Read after it's sent, per visit. The rest wait for the next visit or the
// daily cron.
const READ_AFTER = 150;
// Rows in the table.
const MAX_ROWS = 150;

// Per server instance: one background read per company at a time.
const inFlight = new Set<string>();

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const company = await loadCompanyPage(decodeURIComponent(ticker).toUpperCase());
  if (!company || !company.filesReports) return { title: "Not found", robots: { index: false, follow: false } };
  const path = `/research/${company.slug}/insiders`;
  const description = `${company.name} (${company.symbol}) insider trades: purchases and sales by its officers, directors and largest owners, from their Form 4 filings with the SEC, with trades made under preset plans marked.`;
  return {
    title: `${company.name} (${company.symbol}) insider trades`,
    description,
    alternates: { canonical: path },
    openGraph: { url: path, description },
    twitter: { description },
  };
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const LONG_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const count = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));

export default async function InsidersPage({ params, searchParams }: Props) {
  const { ticker } = await params;
  const { show } = await searchParams;
  const company = await loadCompanyPage(decodeURIComponent(ticker).toUpperCase());
  if (!company || !company.filesReports || !company.cik) notFound();
  const cik = company.cik;
  const showAll = show === "all";

  const submissions = await getSubmissions(cik);
  if (!submissions) {
    return (
      <div className="rf-tab-body">
        <p className="rf-note">The SEC&rsquo;s list of filings for this company couldn&rsquo;t be loaded just now. Try again in a minute.</p>
      </div>
    );
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const since = insiderWindowStart(asOf);
  const filings = form4Filings(submissions, since);
  const read = await readAccessions(cik, since);
  if (!read) {
    return (
      <div className="rf-tab-body">
        <p className="rf-note">Insider trades aren&rsquo;t available just now. Try again later.</p>
      </div>
    );
  }

  const missing = filings.filter((f) => !read.has(f.accession));
  // A crawler sees what's stored and reads nothing (lib/research/crawler.ts).
  const person = !isCrawler((await headers()).get("user-agent"));
  if (person && missing.length) await readInsiderFilings(cik, missing.slice(0, READ_NOW));
  const later = missing.slice(READ_NOW, READ_NOW + READ_AFTER);
  if (person && later.length && !inFlight.has(cik)) {
    inFlight.add(cik);
    after(async () => {
      try {
        const n = await readInsiderFilings(cik, later);
        console.log(`[insiders] ${company.symbol}: read ${n} filings in the background`);
      } finally {
        inFlight.delete(cik);
      }
    });
  }
  const pending = Math.max(0, missing.length - READ_NOW);

  const trades = withoutRepeats((await storedTrades(cik, since)) ?? []);
  const summary = summarize(trades, asOf);
  const shown = (showAll ? trades : trades.filter(isMarketTrade)).slice(0, MAX_ROWS);

  // The submissions file lists only so many recent filings. If it stops short
  // of a year ago, the year's totals can't be complete, and the page says so.
  const listedFrom = filingsListedFrom(submissions);
  const yearAgo = summary.from;
  const yearIncomplete = listedFrom != null && listedFrom > yearAgo;
  // What the table actually covers: two years, or less where the list stops.
  const coveredFrom = listedFrom != null && listedFrom > since ? listedFrom : since;
  const base = `/research/${company.slug}/insiders`;
  const name = company.name;

  return (
    <div className="rf-tab-body">
      <section className="rf-sec rf-next" aria-labelledby="rf-insider-year">
        <div>
          <div className="rf-lbl rf-kicker">Past 12 months</div>
          <h2 className="rf-h2" id="rf-insider-year">
            Purchases and sales on the open market
          </h2>
        </div>
        {summarySentences(summary).map((s) => (
          <p key={s} className="rf-next-line">
            {s}
          </p>
        ))}
        {yearIncomplete && (
          <p className="rf-next-line rf-muted">
            {`The SEC's list of ${name}'s recent filings only reaches back to ${LONG_DATE.format(new Date(listedFrom!))}, so trades before then aren't counted.`}
          </p>
        )}
        {pending > 0 && (
          <p className="rf-next-line rf-muted">
            {`Reading ${pending.toLocaleString("en-US")} more Form 4 ${pending === 1 ? "filing" : "filings"} from the SEC in the background. Refresh in a minute for the full picture.`}
          </p>
        )}
      </section>

      {(summary.bought.trades > 0 || summary.sold.trades > 0) && (
        <div className="rf-stats">
          <div className="rf-stat">
            <span className="rf-lbl">Bought</span>
            <span className="rf-stat-value">{formatMoney(summary.bought.value)}</span>
            <span className="rf-stat-note">
              {`${summary.bought.trades.toLocaleString("en-US")} ${summary.bought.trades === 1 ? "purchase" : "purchases"}, ${count(summary.bought.shares)} shares`}
            </span>
          </div>
          <div className="rf-stat">
            <span className="rf-lbl">Sold</span>
            <span className="rf-stat-value">{formatMoney(summary.sold.value)}</span>
            <span className="rf-stat-note">
              {`${summary.sold.trades.toLocaleString("en-US")} ${summary.sold.trades === 1 ? "sale" : "sales"}, ${count(summary.sold.shares)} shares`}
            </span>
          </div>
          <div className="rf-stat">
            <span className="rf-lbl">Sales on preset plans</span>
            <span className="rf-stat-value">{summary.onPlanShare == null ? "—" : `${Math.round(summary.onPlanShare * 100)}%`}</span>
            <span className="rf-stat-note">Of the sales by value, under Rule 10b5-1 plans set up in advance</span>
          </div>
        </div>
      )}

      <section className="rf-sec" aria-labelledby="rf-insider-trades">
        <div className="rf-sechead">
          <div>
            <div className="rf-lbl rf-kicker">Trades reported since {LONG_DATE.format(new Date(coveredFrom))}</div>
            <h2 className="rf-h2" id="rf-insider-trades">
              {showAll ? "Every transaction, as filed" : "Each purchase and sale, as filed"}
            </h2>
          </div>
          <div className="rf-seg" role="group" aria-label="Which transactions">
            {/* No prefetch: each would render this page again before anyone clicks. */}
            <Link href={base} prefetch={false} className={`rf-seg-btn${showAll ? "" : " is-active"}`} aria-current={showAll ? undefined : "page"}>
              Purchases and sales
            </Link>
            <Link href={`${base}?show=all`} prefetch={false} className={`rf-seg-btn${showAll ? " is-active" : ""}`} aria-current={showAll ? "page" : undefined}>
              All transactions
            </Link>
          </div>
        </div>

        {shown.length > 0 ? (
          <div className="rf-table-scroll" tabIndex={0} role="region" aria-label={`${name} insider trades`}>
            <table className="rf-table rf-insiders">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Insider</th>
                  <th scope="col">Transaction</th>
                  <th scope="col">Shares</th>
                  <th scope="col">Price</th>
                  <th scope="col">Value</th>
                  <th scope="col">Owned after</th>
                  <th scope="col">Filing</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => {
                  const value = tradeValue(t);
                  return (
                    <tr key={`${t.accession}-${t.line}`}>
                      <th scope="row">{t.date ? DATE.format(new Date(t.date)) : "—"}</th>
                      <td className="rf-insider-who">
                        <span>{titleCaseName(t.ownerName)}</span>
                        {t.ownerRole && <span className="rf-insider-role">{t.ownerRole}</span>}
                      </td>
                      <td className="rf-insider-what">
                        {tradeLabel(t)}
                        {t.onPlan && isMarketTrade(t) && <span className="rf-insider-plan">On a preset plan</span>}
                      </td>
                      <td>{count(t.shares)}</td>
                      <td>{t.price != null && t.price > 0 ? `$${t.price.toFixed(2)}` : "—"}</td>
                      <td>{value != null ? formatMoney(value) : "—"}</td>
                      <td>{count(t.sharesAfter)}</td>
                      <td>
                        <a href={filingIndexUrl(cik, t.accession)} target="_blank" rel="noopener noreferrer">
                          Form {t.form}
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rf-note">
            {filings.length === 0
              ? `No Form 4 filings about ${name} in the past two years.${company.financialsUnavailable ? " Insiders of companies that report on Form 20-F don't file them." : ""}`
              : showAll
                ? "No transactions in the filings read so far."
                : "No open-market purchases or sales by insiders in the filings read so far. Grants, option exercises and the shares withheld for tax are under All transactions."}
          </p>
        )}
        {(showAll ? trades.length : trades.filter(isMarketTrade).length) > MAX_ROWS && (
          <p className="rf-vh-def">{`Showing the latest ${MAX_ROWS}.`}</p>
        )}
      </section>

      <div className="rf-sourceline">
        <p>
          From Form 4 filings with the SEC, which a company&rsquo;s officers, directors and owners of more than 10% must file
          within two business days of a trade. Value is shares times the price filed, which is often an average across several
          trades that day. &ldquo;On a preset plan&rdquo; means the filing says the trade was made under a Rule 10b5-1 plan, set up
          in advance and run on a schedule. An amendment that repeats an earlier filing&rsquo;s line is counted once.
        </p>
      </div>
    </div>
  );
}
