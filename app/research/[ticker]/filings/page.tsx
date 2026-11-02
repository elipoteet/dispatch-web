import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { after } from "next/server";
import { isCrawler } from "@/lib/research/crawler";
import { notFound } from "next/navigation";
import { loadCompanyPage } from "@/lib/research/company";
import { filingDocumentUrl, getSubmissions, latestFiling, padCik } from "@/lib/sec/client";
import { computeFilingChanges, readFilingChanges, type StoredComparison } from "@/lib/sec/filingChanges";
import { textFragment, type SentencePair } from "@/lib/sec/riskFactors";
import { filingsListedFrom } from "@/lib/sec/insiders";
import { CATEGORY_LABELS, filingEntries, type FilingCategory } from "@/lib/research/filings";

type Props = {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ type?: string }>;
};

// Room for the comparison to be worked out after the page has gone: two
// 10-Ks downloaded (up to 13MB each) and compared.
export const maxDuration = 60;

const MAX_ROWS = 100;
const inFlight = new Set<string>();

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const company = await loadCompanyPage(decodeURIComponent(ticker).toUpperCase());
  if (!company || !company.filesReports) return { title: "Not found", robots: { index: false, follow: false } };
  const path = `/research/${company.slug}/filings`;
  const description = `${company.name} (${company.symbol}) filings: every recent report to the SEC, in plain words, and what changed in the risk factors of its latest annual report against the year before.`;
  return {
    title: `${company.name} (${company.symbol}) filings`,
    description,
    alternates: { canonical: path },
    openGraph: { url: path, description },
    twitter: { description },
  };
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const LONG_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmt = (d: string) => LONG_DATE.format(new Date(d));

function Sentence({ text, url }: { text: string; url: string }) {
  return (
    <a href={`${url}${textFragment(text)}`} target="_blank" rel="noopener noreferrer" className="rf-risk-link">
      {text}
    </a>
  );
}

function Pairs({ pairs, cmp }: { pairs: SentencePair[]; cmp: StoredComparison }) {
  return (
    <div className="rf-diff">
      {pairs.map((p, k) => (
        <div className="rf-diff-row" key={k}>
          <div className="rf-diff-old">{p.old ? <Sentence text={p.old} url={cmp.older.url} /> : <span className="rf-muted">Not in the earlier report</span>}</div>
          <div className="rf-diff-new">{p.new ? <Sentence text={p.new} url={cmp.newer.url} /> : <span className="rf-muted">Taken out</span>}</div>
        </div>
      ))}
    </div>
  );
}

function shownOf(shown: number, total: number): string {
  return shown < total ? ` (the first ${shown} of ${total.toLocaleString("en-US")})` : "";
}

function RiskChanges({ cmp, name }: { cmp: StoredComparison; name: string }) {
  const c = cmp.counts;
  const changed = cmp.changes.filter((x) => x.kind === "changed");
  const reworded = cmp.changes.filter((x) => x.kind === "reworded");
  const n = (v: number, one: string, many: string) => `${v.toLocaleString("en-US")} ${v === 1 ? one : many}`;
  return (
    <>
      <p className="rf-next-line">
        {`${name}'s annual report filed ${fmt(cmp.newer.filed)}, against the one filed ${fmt(cmp.older.filed)}: `}
        {`${n(c.added, "risk paragraph", "risk paragraphs")} added, ${c.removed.toLocaleString("en-US")} taken out, ${c.changed.toLocaleString("en-US")} with sentences added or removed, and ${c.reworded.toLocaleString("en-US")} reworded. ${c.unchanged.toLocaleString("en-US")} of ${c.newParagraphs.toLocaleString("en-US")} are unchanged, apart from dates and figures.`}
      </p>
      <p className="rf-next-line rf-muted">
        Each sentence links to its place in the filing.{" "}
        <a href={cmp.newer.url} target="_blank" rel="noopener noreferrer">
          This year&rsquo;s report
        </a>
        {" · "}
        <a href={cmp.older.url} target="_blank" rel="noopener noreferrer">
          Last year&rsquo;s
        </a>
      </p>

      {cmp.added.length > 0 && (
        <details className="rf-risk-group" open>
          <summary>
            <span className="rf-lbl">Added{shownOf(cmp.added.length, c.added)}</span>
          </summary>
          <ul className="rf-risk-list">
            {cmp.added.map((s, k) => (
              <li key={k}>
                <Sentence text={s} url={cmp.newer.url} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {cmp.removed.length > 0 && (
        <details className="rf-risk-group" open>
          <summary>
            <span className="rf-lbl">Taken out{shownOf(cmp.removed.length, c.removed)}</span>
          </summary>
          <ul className="rf-risk-list">
            {cmp.removed.map((s, k) => (
              <li key={k}>
                <Sentence text={s} url={cmp.older.url} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {changed.length > 0 && (
        <details className="rf-risk-group" open>
          <summary>
            <span className="rf-lbl">Sentences added or removed{shownOf(changed.length, c.changed)}</span>
          </summary>
          <div className="rf-diff-head">
            <span className="rf-lbl">Last year</span>
            <span className="rf-lbl">This year</span>
          </div>
          {changed.map((x, k) => (
            <Pairs key={k} pairs={x.pairs} cmp={cmp} />
          ))}
        </details>
      )}
      {reworded.length > 0 && (
        <details className="rf-risk-group">
          <summary>
            <span className="rf-lbl">Reworded{shownOf(reworded.length, c.reworded)}</span>
          </summary>
          <div className="rf-diff-head">
            <span className="rf-lbl">Last year</span>
            <span className="rf-lbl">This year</span>
          </div>
          {reworded.map((x, k) => (
            <Pairs key={k} pairs={x.pairs} cmp={cmp} />
          ))}
        </details>
      )}
    </>
  );
}

export default async function FilingsPage({ params, searchParams }: Props) {
  const { ticker } = await params;
  const { type } = await searchParams;
  const company = await loadCompanyPage(decodeURIComponent(ticker).toUpperCase());
  if (!company || !company.filesReports || !company.cik) notFound();
  const cik = company.cik;
  const name = company.name;

  const submissions = await getSubmissions(cik);
  if (!submissions) {
    return (
      <div className="rf-tab-body">
        <p className="rf-note">The SEC&rsquo;s list of filings for this company couldn&rsquo;t be loaded just now. Try again in a minute.</p>
      </div>
    );
  }

  // —— What changed in the risk factors ——
  const latest10K = latestFiling(submissions, ["10-K"]);
  let risk: React.ReactNode;
  if (!latest10K) {
    risk = (
      <p className="rf-next-line rf-muted">
        {company.financialsUnavailable
          ? "This comparison covers 10-K annual reports; companies that report on Form 20-F aren't covered yet."
          : "There's no 10-K annual report on file to compare."}
      </p>
    );
  } else {
    const row = await readFilingChanges(latest10K.accession);
    if (row === null) {
      risk = <p className="rf-next-line rf-muted">The comparison isn&rsquo;t available just now. Try again later.</p>;
    } else if (row === "missing") {
      // A crawler's visit doesn't start the comparison (lib/research/crawler.ts).
      const person = !isCrawler((await headers()).get("user-agent"));
      if (person && !inFlight.has(latest10K.accession)) {
        inFlight.add(latest10K.accession);
        after(async () => {
          try {
            await computeFilingChanges(cik, latest10K.accession);
          } catch (err) {
            console.error(`[filing-changes] ${company.symbol}:`, err instanceof Error ? err.message : err);
          } finally {
            inFlight.delete(latest10K.accession);
          }
        });
      }
      risk = (
        <p className="rf-next-line rf-muted">
          {`Comparing the risk factors in ${name}'s annual report filed ${fmt(latest10K.filed)} with the year before's. That means reading two long documents from the SEC; refresh in a minute.`}
        </p>
      );
    } else if (row.status === "unavailable") {
      risk = (
        <p className="rf-next-line rf-muted">
          {row.reason === "no-prior"
            ? `There's no earlier 10-K on file to compare ${name}'s latest one with.`
            : `${name}'s annual report doesn't have a risk factors section this page can read. Smaller companies may leave it out.`}
        </p>
      );
    } else {
      risk = <RiskChanges cmp={row.result} name={name} />;
    }
  }

  // —— The filings ——
  const category = (Object.keys(CATEGORY_LABELS) as FilingCategory[]).find((c) => c === type) ?? null;
  const all = filingEntries(submissions);
  const shown = (category ? all.filter((f) => f.category === category) : all).slice(0, MAX_ROWS);
  const listedFrom = filingsListedFrom(submissions);
  const base = `/research/${company.slug}/filings`;
  const edgar = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${padCik(cik)}&owner=include&count=40`;

  return (
    <div className="rf-tab-body">
      <section className="rf-sec rf-next" aria-labelledby="rf-risk">
        <div>
          <div className="rf-lbl rf-kicker">What changed</div>
          <h2 className="rf-h2" id="rf-risk">
            The risk factors in the latest annual report, against the year before
          </h2>
        </div>
        {risk}
      </section>

      <section className="rf-sec" aria-labelledby="rf-filings">
        <div className="rf-fin-controls">
          <div>
            <div className="rf-lbl rf-kicker">Filings with the SEC</div>
            <h2 className="rf-h2" id="rf-filings">
              Every recent report
            </h2>
          </div>
          <div className="rf-chips" role="group" aria-label="Which filings">
            <Link href={base} className={`rf-chip${category ? "" : " is-active"}`} aria-current={category ? undefined : "page"}>
              All
            </Link>
            {(Object.keys(CATEGORY_LABELS) as FilingCategory[]).map((c) => (
              <Link key={c} href={`${base}?type=${c}`} className={`rf-chip${category === c ? " is-active" : ""}`} aria-current={category === c ? "page" : undefined}>
                {CATEGORY_LABELS[c]}
              </Link>
            ))}
          </div>
        </div>
        {shown.length > 0 ? (
          <div className="rf-table-scroll" tabIndex={0} role="region" aria-label={`${name} filings`}>
            <table className="rf-table rf-filings">
              <thead>
                <tr>
                  <th scope="col">Filed</th>
                  <th scope="col">Form</th>
                  <th scope="col">What it is</th>
                  <th scope="col">Period or event</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((f) => (
                  <tr key={f.accession}>
                    <th scope="row">{DATE.format(new Date(f.filed))}</th>
                    <td>
                      {f.primaryDocument ? (
                        <a href={filingDocumentUrl(cik, f)} target="_blank" rel="noopener noreferrer">
                          {f.form}
                        </a>
                      ) : (
                        f.form
                      )}
                    </td>
                    <td>{f.description}</td>
                    <td>{f.reportDate ? DATE.format(new Date(f.reportDate)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rf-note">No filings of this kind in the SEC&rsquo;s recent list.</p>
        )}
        <p className="rf-vh-def">
          {`The SEC's list of ${name}'s recent filings${listedFrom ? ` reaches back to ${fmt(listedFrom)}` : ""}; registration statements and other prospectus filings aren't shown. `}
          <a href={edgar} target="_blank" rel="noopener noreferrer">
            Every filing on EDGAR
          </a>
        </p>
      </section>

      <div className="rf-sourceline">
        <p>
          The comparison takes Item 1A (risk factors) of the latest 10-K and of the one before it, splits each into paragraphs,
          and matches every paragraph to its closest counterpart by the words they share. Dates and figures are set aside, so a
          paragraph whose only change is the year counts as unchanged. It is done by rules, not by anyone&rsquo;s reading: the
          sentences are the company&rsquo;s own, quoted as filed.
        </p>
      </div>
    </div>
  );
}
