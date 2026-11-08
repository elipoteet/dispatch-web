import Link from "next/link";
import {
  DEFAULT_BASE,
  MAX_SHOW,
  PAGE_SIZE,
  RANGE_FILTERS,
  boxText,
  dayLabel,
  describeScreen,
  dividendShareText,
  filterLines,
  formatFigure,
  hasFilters,
  medianText,
  rangeFilter,
  resultColumns,
  sameFilters,
  sortPhrase,
  sortTarget,
  stateName,
  viewQuery,
  withoutFilter,
  yearEnded,
  type Filters,
  type RangeFilter,
  type SortBase,
  type SortKey,
  type View,
} from "@/lib/screener/filters";
import { filtersAlone, loadMedians, loadOverview, loadResults, type ResultRow } from "@/lib/screener/query";
import { matchingScreen, type StartingScreen } from "@/lib/screener/screens";
import { ScreenerControls, type Chip, type SortChoice } from "@/components/screener/ScreenerControls";

const REVENUE = rangeFilter("revenue") as RangeFilter;

// "Build your own" starts here: revenue of at least $100 million, so the
// thousands of very small companies don't crowd the list (the addendum).
export const BUILD_YOUR_OWN: Filters = { ranges: { revenue: { min: 1e8, max: null } }, sectors: [], states: [], dividend: false };
export const BUILD_YOUR_OWN_HREF = `/screener?${viewQuery({ filters: BUILD_YOUR_OWN, sort: "revenue", order: "desc", show: PAGE_SIZE, edit: true })}`;

// Where this view's links go. On a starting screen's own page, sorting and
// paging stay on that page; any change to the filters moves to /screener,
// where the filters are spelled out in the link.
function linker(view: View, screen: StartingScreen | null, base: SortBase) {
  const page = screen ? `/screener/${screen.slug}` : "/screener";
  return {
    at(v: View): string {
      const q = viewQuery(v, { filters: !screen, base });
      return q ? `${page}?${q}` : page;
    },
    custom(filters: Filters): string {
      const q = viewQuery({ ...view, filters, show: PAGE_SIZE, edit: false }, { base: DEFAULT_BASE });
      return q ? `/screener?${q}` : "/screener?edit=1";
    },
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export async function ScreenerResults({ view, screen }: { view: View; screen: StartingScreen | null }) {
  const base: SortBase = screen ? { sort: screen.sort, order: screen.order } : DEFAULT_BASE;
  const [results, overview, medians] = await Promise.all([loadResults(view), loadOverview(), loadMedians()]);
  const link = linker(view, screen, base);
  const filtered = hasFilters(view.filters);
  const named = screen ?? (filtered ? matchingScreen(view.filters) : undefined);
  const title = named?.title ?? (filtered ? "Your screen" : "All companies");
  const columns = resultColumns(view);
  const measures = columns.filter((f) => f.param !== "revenue");
  const showState = view.filters.states.length > 0;

  // The toolbar's chips: each removes its own filter.
  const lines = filterLines(view.filters);
  const chips: Chip[] = lines.map((l) => ({ key: l.key, text: l.text, href: link.custom(withoutFilter(view.filters, l.key)) }));
  const note = sameFilters(view.filters, BUILD_YOUR_OWN) ? "Companies with revenue under $100 million are hidden until you remove the revenue filter." : null;
  const boxes = Object.fromEntries(
    RANGE_FILTERS.map((f) => {
      const r = view.filters.ranges[f.param];
      return [f.param, { min: boxText(f.unit, r?.min ?? null), max: boxText(f.unit, r?.max ?? null) }];
    }),
  );
  const medianLines: Record<string, string> = {};
  for (const f of RANGE_FILTERS) if (medians[f.column] != null) medianLines[f.param] = medianText(f, medians[f.column]);
  if (medians.pays_dividend != null) medianLines.dividend = dividendShareText(medians.pays_dividend);

  // A phone's Sort menu: the columns shown, each way, then name.
  const sortKeys: SortKey[] = [...columns.map((f) => f.param), "name"];
  const sortChoices: SortChoice[] = sortKeys.flatMap((key) =>
    (key === "name" ? (["asc", "desc"] as const) : (["desc", "asc"] as const)).map((order) => ({
      label: sortPhrase(key, order).replace(/^Sorted by /, "").replace(/^./, (c) => c.toUpperCase()),
      href: link.at({ ...view, sort: key, order, show: PAGE_SIZE, edit: false }),
    })),
  );
  const sortHref = link.at({ ...view, show: PAGE_SIZE, edit: false });
  if (!sortChoices.some((c) => c.href === sortHref)) sortChoices.unshift({ label: sortPhrase(view.sort, view.order).replace(/^Sorted by /, ""), href: sortHref });

  const updated = overview.ok ? dayLabel(overview.data.updated) : null;
  const about = overview.ok ? `About ${(Math.round(overview.data.total / 100) * 100).toLocaleString("en-US")}` : "About 4,600";

  return (
    <section className="page active rf" id="page-screener">
      <div className="rf-wrap rf-scr">
        <header className="rf-scr-head">
          <Link href="/screener" className="rf-scr-back" prefetch={false}>
            <span aria-hidden="true">←</span> Starting screens
          </Link>
          <div className="rf-lbl rf-kicker">Screener</div>
          <h1 className="rf-scr-title">{title}</h1>
          <p className="rf-scr-says">{describeScreen(view.filters)}</p>
          {named?.why && <p className="rf-scr-why">{named.why}</p>}
          {/* No count line for no matches: the box below says so. */}
          {results.ok && results.total > 0 && (
            <p className="rf-scr-count">
              <strong>{filtered ? `${plural(results.total, "company matches", "companies match")}.` : `${plural(results.total, "company", "companies")}.`}</strong>{" "}
              {sortPhrase(view.sort, view.order)}.
            </p>
          )}
        </header>

        <ScreenerControls
          // A new link starts the controls afresh, with that link's filters.
          key={viewQuery(view)}
          chips={chips}
          note={note}
          boxes={boxes}
          sectors={view.filters.sectors}
          states={view.filters.states}
          dividend={view.filters.dividend}
          medians={medianLines}
          sort={view.sort}
          order={view.order}
          open={view.edit}
          sortChoices={sortChoices}
          sortHref={sortHref}
          clearHref="/screener?edit=1"
        />

        {!results.ok ? (
          <p className="rf-note" role="status">
            {results.reason === "not-built"
              ? "The screener’s figures are being gathered from the SEC for the first time. Check back tomorrow."
              : "The screener couldn’t be loaded just now. Try again in a minute."}
          </p>
        ) : results.total === 0 ? (
          <NoMatches view={view} link={link} />
        ) : (
          <>
            <ResultsTable rows={results.rows} columns={columns} showState={showState} view={view} link={link} />
            <ResultsList rows={results.rows} measures={measures.slice(0, 2)} />
            <More shown={results.rows.length} total={results.total} view={view} link={link} />
          </>
        )}

        {/* Written as strings: a multi-line JSX text run holding an HTML
            entity loses its leading space in this build ("year.Each"). */}
        <aside className="rf-scr-notes" aria-label="About these figures">
          <p>
            <strong>Latest fiscal year.</strong>
            {" Each company’s figures come from its latest full fiscal year, as reported in its annual report. Fiscal years end in different months, so the last column gives each company’s year end."}
          </p>
          <p>
            <strong>Calculated by The Dispatch.</strong>
            {" Free cash flow is operating cash flow minus capital spending. Net cash is cash and short-term investments, less all debt, long- and short-term. Return on invested capital uses the company’s own tax rate, or 21% where that can’t be worked out. “What the price assumes” opens each company’s Valuation tab, where today’s price is set against the business."}
          </p>
          <p>
            <strong>n/a</strong>
            {" means the measure doesn’t fit the business (gross margin at a bank), a figure wasn’t filed, or it can’t be worked out (growth from a loss). A company with n/a drops out of any filter on that measure; a missing figure is never counted as zero."}
          </p>
          <p>
            <strong>Coverage.</strong>
            {` ${about} companies listed on a U.S. exchange that report under U.S. accounting rules (GAAP), with an annual report from the last 18 months. Commodity and crypto funds, and companies that report under international rules (IFRS), aren’t included. Updated nightly from the SEC${updated ? `; last updated ${updated}` : ""}.`}
          </p>
        </aside>
      </div>
    </section>
  );
}

type Linker = ReturnType<typeof linker>;

function SortHead({ label, sortKey, view, link, className }: { label: string; sortKey: SortKey; view: View; link: Linker; className?: string }) {
  const active = view.sort === sortKey;
  return (
    <th scope="col" className={className} aria-sort={active ? (view.order === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={link.at(sortTarget(view, sortKey))} className={`rf-scr-sort${active ? " is-active" : ""}`} scroll={false} prefetch={false}>
        {label}
        <span aria-hidden="true" className="rf-scr-arrow">
          {active ? (view.order === "asc" ? "↑" : "↓") : ""}
        </span>
      </Link>
    </th>
  );
}

// The company's name, ticker, and the way across to what its price assumes.
// No prefetch on either link: prefetching a company's file loads its data.
function Company({ r }: { r: ResultRow }) {
  const slug = encodeURIComponent(r.ticker.toLowerCase());
  return (
    <span className="rf-scr-co">
      <span className="rf-scr-co-top">
        <Link href={`/research/${slug}`} prefetch={false}>
          {r.name}
        </Link>
        <span className="rf-scr-tk">{r.ticker}</span>
      </span>
      <Link href={`/research/${slug}/valuation`} className="rf-scr-val" prefetch={false}>
        What the price assumes
      </Link>
    </span>
  );
}

function ResultsTable({ rows, columns, showState, view, link }: { rows: ResultRow[]; columns: RangeFilter[]; showState: boolean; view: View; link: Linker }) {
  return (
    <div className="rf-table-scroll rf-scr-tablebox" tabIndex={0} role="region" aria-label="Results">
      <table className="rf-table rf-scr-table">
        <thead>
          <tr>
            <SortHead label="Company" sortKey="name" view={view} link={link} />
            {columns.map((f) => (
              <SortHead key={f.param} label={f.label} sortKey={f.param} view={view} link={link} className={f.param === view.sort ? "is-key" : undefined} />
            ))}
            <SortHead label="Sector" sortKey="sector" view={view} link={link} className="rf-scr-left" />
            {showState && <th scope="col" className="rf-scr-left">Headquarters</th>}
            <th scope="col">Year ended</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cik}>
              <th scope="row">
                <Company r={r} />
              </th>
              {columns.map((f) => (
                <td key={f.param} className={r.values[f.param] == null ? "rf-scr-na" : undefined}>
                  {formatFigure(f, r.values[f.param])}
                </td>
              ))}
              <td className={`rf-scr-left${r.sector ? "" : " rf-scr-na"}`}>{r.sector ?? "n/a"}</td>
              {showState && <td className="rf-scr-left">{r.state ? stateName(r.state) : "n/a"}</td>}
              <td className="rf-scr-year">{yearEnded(r.periodEnd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A phone's two-line rows: name, ticker and revenue, then the two figures
// that match the screen, its own measure first.
function ResultsList({ rows, measures }: { rows: ResultRow[]; measures: RangeFilter[] }) {
  return (
    <ol className="rf-scr-list" aria-label="Results">
      {rows.map((r) => (
        <li key={r.cik} className="rf-scr-item">
          <span className="rf-scr-item-top">
            <Company r={r} />
            <span className={`rf-scr-item-rev${r.values.revenue == null ? " rf-scr-na" : ""}`}>{formatFigure(REVENUE, r.values.revenue)}</span>
          </span>
          <span className="rf-scr-item-sub">
            {measures.map((f) => (
              <span key={f.param}>
                <span className="rf-scr-item-lbl">{f.label}</span>{" "}
                <span className={r.values[f.param] == null ? "rf-scr-na" : "rf-scr-item-val"}>{formatFigure(f, r.values[f.param])}</span>
              </span>
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
}

function More({ shown, total, view, link }: { shown: number; total: number; view: View; link: Linker }) {
  if (shown >= total) return <p className="rf-scr-more rf-muted">{total === 1 ? "That’s the only match." : `All ${total.toLocaleString("en-US")} shown.`}</p>;
  if (view.show >= MAX_SHOW)
    return (
      <p className="rf-scr-more rf-muted">
        {`Showing the first ${MAX_SHOW.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}. Narrow the screen or change the sort to see the others.`}
      </p>
    );
  const next = Math.min(PAGE_SIZE, total - shown);
  return (
    <div className="rf-scr-more">
      <span className="rf-muted">{`Showing ${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}.`}</span>
      <Link href={link.at({ ...view, show: view.show + PAGE_SIZE, edit: false })} className="rf-btn" scroll={false} replace prefetch={false}>
        Show {next} more
      </Link>
    </div>
  );
}

async function NoMatches({ view, link }: { view: View; link: Linker }) {
  const alone = await filtersAlone(view.filters);
  const tightest = alone?.[0];
  const text = tightest ? filterLines(view.filters).find((l) => l.key === tightest.key)?.text : null;
  return (
    <div className="rf-scr-empty" role="status">
      <h2 className="rf-h2">No company matches all of these filters.</h2>
      {tightest && text && (
        <p>
          The tightest is <strong>{text}</strong>
          {tightest.alone === 0 ? ". No company meets it, even on its own." : `. ${plural(tightest.alone, "company meets", "companies meet")} it on its own.`}
        </p>
      )}
      <div className="rf-scr-empty-actions">
        {tightest && (alone?.length ?? 0) > 1 && (
          <Link href={link.custom(withoutFilter(view.filters, tightest.key))} className="rf-btn rf-btn-solid" prefetch={false}>
            Remove that filter
          </Link>
        )}
        <Link href="/screener?edit=1" className="rf-btn" prefetch={false}>
          Clear all filters
        </Link>
      </div>
    </div>
  );
}
