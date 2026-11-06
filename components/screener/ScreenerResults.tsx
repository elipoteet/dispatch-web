import Link from "next/link";
import {
  MAX_SHOW,
  PAGE_SIZE,
  RANGE_FILTERS,
  boxText,
  chipText,
  dayLabel,
  defaultOrder,
  formatFigure,
  hasFilters,
  rangeFilter,
  resultColumns,
  sectorChipText,
  sortPhrase,
  sortTarget,
  viewQuery,
  withoutRange,
  yearEnded,
  type Filters,
  type Order,
  type RangeFilter,
  type SortKey,
  type View,
} from "@/lib/screener/filters";
import { filtersAlone, loadOverview, loadResults, type ResultRow } from "@/lib/screener/query";
import { matchingScreen, type StartingScreen } from "@/lib/screener/screens";
import { ScreenerControls, type Chip, type SortChoice } from "@/components/screener/ScreenerControls";

const REVENUE = rangeFilter("revenue") as RangeFilter;

// Where this view's links go. On a starting screen's own page, sorting and
// paging stay on that page; any change to the filters moves to /screener,
// where the filters are spelled out in the link.
function linker(view: View, screen: StartingScreen | null) {
  const base = screen ? `/screener/${screen.slug}` : "/screener";
  return {
    at(v: View): string {
      const q = viewQuery(v, { filters: !screen });
      return q ? `${base}?${q}` : base;
    },
    custom(filters: Filters): string {
      const q = viewQuery({ ...view, filters, show: PAGE_SIZE, edit: false });
      return q ? `/screener?${q}` : "/screener?edit=1";
    },
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

function filterText(filters: Filters, key: string): string {
  if (key === "sector") return sectorChipText(filters.sectors);
  const f = rangeFilter(key) as RangeFilter;
  return chipText(f, filters.ranges[key]!);
}

function withoutKey(filters: Filters, key: string): Filters {
  return key === "sector" ? { ranges: filters.ranges, sectors: [] } : withoutRange(filters, key);
}

export async function ScreenerResults({ view, screen }: { view: View; screen: StartingScreen | null }) {
  const [results, overview] = await Promise.all([loadResults(view), loadOverview()]);
  const link = linker(view, screen);
  const filtered = hasFilters(view.filters);
  const title = screen?.title ?? (filtered ? (matchingScreen(view.filters)?.title ?? "Your screen") : "All companies");
  const columns = resultColumns(view);

  // The toolbar's chips: each removes its own filter.
  const chips: Chip[] = [
    ...RANGE_FILTERS.filter((f) => view.filters.ranges[f.param]).map((f) => ({
      key: f.param,
      text: chipText(f, view.filters.ranges[f.param]!),
      href: link.custom(withoutRange(view.filters, f.param)),
    })),
    ...(view.filters.sectors.length ? [{ key: "sector", text: sectorChipText(view.filters.sectors), href: link.custom(withoutKey(view.filters, "sector")) }] : []),
  ];
  const boxes = Object.fromEntries(
    RANGE_FILTERS.map((f) => {
      const r = view.filters.ranges[f.param];
      return [f.param, { min: boxText(f.unit, r?.min ?? null), max: boxText(f.unit, r?.max ?? null) }];
    }),
  );

  // A phone's Sort menu: every sortable column, each way.
  const sortKeys: SortKey[] = ["revenue", ...RANGE_FILTERS.filter((f) => f.param !== "revenue").map((f) => f.param), "name", "sector"];
  const sortChoices: SortChoice[] = sortKeys.flatMap((key) =>
    (["desc", "asc"] as Order[])
      .sort((a, b) => (a === defaultOrder(key) ? -1 : b === defaultOrder(key) ? 1 : 0))
      .map((order) => ({ label: sortPhrase(key, order).replace(/^Sorted by /, "").replace(/^./, (c) => c.toUpperCase()), href: link.at({ ...view, sort: key, order, show: PAGE_SIZE, edit: false }) })),
  );
  const sortHref = link.at({ ...view, show: PAGE_SIZE, edit: false });

  const updated = overview.ok ? dayLabel(overview.data.updated) : null;
  const about = overview.ok ? `About ${(Math.round(overview.data.total / 100) * 100).toLocaleString("en-US")}` : "About 4,700";

  return (
    <section className="page active rf" id="page-screener">
      <div className="rf-wrap rf-scr">
        <header className="rf-scr-head">
          <Link href="/screener" className="rf-scr-back" prefetch={false}>
            <span aria-hidden="true">←</span> Starting screens
          </Link>
          <div className="rf-lbl rf-kicker">Screener</div>
          <h1 className="rf-scr-title">{title}</h1>
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
          boxes={boxes}
          sectors={view.filters.sectors}
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
            <ResultsTable rows={results.rows} columns={columns} view={view} link={link} />
            <ResultsList rows={results.rows} columns={columns.slice(0, 2)} />
            <More shown={results.rows.length} total={results.total} view={view} link={link} />
          </>
        )}

        <aside className="rf-scr-notes" aria-label="About these figures">
          {/* Written as strings: a multi-line JSX text run holding an HTML
              entity loses its leading space in this build ("year.Each"). */}
          <p>
            <strong>Latest fiscal year.</strong>
            {" Each company’s figures come from its latest full fiscal year, as reported in its annual report. Fiscal years end in different months, so the last column gives each company’s year end."}
          </p>
          <p>
            <strong>Calculated by The Dispatch.</strong>
            {" Free cash flow is operating cash flow minus capital spending. Net cash is cash and equivalents minus debt as tagged in the filing: mainly long-term debt, including the part due within a year. Short-term borrowings such as commercial paper are usually left out."}
          </p>
          <p>
            <strong>n/a</strong>
            {" means the measure doesn’t fit the business (gross margin at a bank), a figure wasn’t filed, or it can’t be worked out (growth from a loss). A company with n/a drops out of any filter on that measure; a missing figure is never counted as zero."}
          </p>
          <p>
            <strong>Coverage.</strong>
            {` ${about} companies listed on a U.S. exchange that report under U.S. accounting rules (GAAP), with an annual report from the last 18 months. Companies that report under international rules (IFRS) aren’t included. Updated nightly from the SEC${updated ? `; last updated ${updated}` : ""}.`}
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

function ResultsTable({ rows, columns, view, link }: { rows: ResultRow[]; columns: RangeFilter[]; view: View; link: Linker }) {
  return (
    <div className="rf-table-scroll rf-scr-tablebox" tabIndex={0} role="region" aria-label="Results">
      <table className="rf-table rf-scr-table">
        <thead>
          <tr>
            <SortHead label="Company" sortKey="name" view={view} link={link} />
            <SortHead label="Sector" sortKey="sector" view={view} link={link} className="rf-scr-left" />
            <SortHead label="Revenue" sortKey="revenue" view={view} link={link} />
            {columns.map((f) => (
              <SortHead key={f.param} label={f.short} sortKey={f.param} view={view} link={link} />
            ))}
            <th scope="col">Year ended</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cik}>
              <th scope="row">
                <span className="rf-scr-co">
                  {/* No prefetch: prefetching a company's file loads its data. */}
                  <Link href={`/research/${encodeURIComponent(r.ticker.toLowerCase())}`} prefetch={false}>
                    {r.name}
                  </Link>
                  <span className="rf-scr-tk">{r.ticker}</span>
                </span>
              </th>
              <td className={`rf-scr-left${r.sector ? "" : " rf-scr-na"}`}>{r.sector ?? "n/a"}</td>
              <Figure f={REVENUE} value={r.values.revenue} />
              {columns.map((f) => (
                <Figure key={f.param} f={f} value={r.values[f.param]} />
              ))}
              <td className="rf-scr-year">{yearEnded(r.periodEnd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Figure({ f, value }: { f: RangeFilter; value: number | null }) {
  return <td className={value == null ? "rf-scr-na" : undefined}>{formatFigure(f, value)}</td>;
}

// A phone's two-line rows: name, ticker and revenue, then the two figures
// that match the screen.
function ResultsList({ rows, columns }: { rows: ResultRow[]; columns: RangeFilter[] }) {
  return (
    <ol className="rf-scr-list" aria-label="Results">
      {rows.map((r) => (
        <li key={r.cik} className="rf-scr-item">
          <span className="rf-scr-item-top">
            <span className="rf-scr-co">
              <Link href={`/research/${encodeURIComponent(r.ticker.toLowerCase())}`} prefetch={false}>
                {r.name}
              </Link>
              <span className="rf-scr-tk">{r.ticker}</span>
            </span>
            <span className={`rf-scr-item-rev${r.values.revenue == null ? " rf-scr-na" : ""}`}>{formatFigure(REVENUE, r.values.revenue)}</span>
          </span>
          <span className="rf-scr-item-sub">
            {columns.map((f) => (
              <span key={f.param}>
                <span className="rf-scr-item-lbl">{f.short}</span>{" "}
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
        Showing the first {MAX_SHOW.toLocaleString("en-US")} of {total.toLocaleString("en-US")}. Narrow the screen or change the sort to see
        the others.
      </p>
    );
  const next = Math.min(PAGE_SIZE, total - shown);
  return (
    <div className="rf-scr-more">
      <span className="rf-muted">
        Showing {shown.toLocaleString("en-US")} of {total.toLocaleString("en-US")}.
      </span>
      <Link href={link.at({ ...view, show: view.show + PAGE_SIZE, edit: false })} className="rf-btn" scroll={false} replace prefetch={false}>
        Show {next} more
      </Link>
    </div>
  );
}

async function NoMatches({ view, link }: { view: View; link: Linker }) {
  const alone = await filtersAlone(view.filters);
  const tightest = alone?.[0];
  return (
    <div className="rf-scr-empty" role="status">
      <h2 className="rf-h2">No company matches all of these filters.</h2>
      {tightest && (
        <p>
          The tightest is <strong>{filterText(view.filters, tightest.key)}</strong>
          {tightest.alone === 0
            ? ". No company meets it, even on its own."
            : `. ${plural(tightest.alone, "company meets", "companies meet")} it on its own.`}
        </p>
      )}
      <div className="rf-scr-empty-actions">
        {tightest && (alone?.length ?? 0) > 1 && (
          <Link href={link.custom(withoutKey(view.filters, tightest.key))} className="rf-btn rf-btn-solid" prefetch={false}>
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
