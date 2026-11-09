// A balance sheet read from the page the SEC renders for a filing, for the
// figures a company tags with its own elements. Pure: the fetching is
// client.ts, fetchFilingFile.
//
// The SEC's data services (companyfacts, frames) carry only the standard
// taxonomies, so a line a company tags with an element of its own is
// invisible to them. NVIDIA's balance sheet at 25 January 2026 has $10.6B of
// cash and $52.0B of marketable securities, tagged
// nvda:MarketableSecuritiesAndEquitySecuritiesFVNI; from the frames alone its
// net cash came to $2.1B against the $54.1B its 10-K shows (found by Eli, 9
// November 2026). Every filing's financial statements are also published as
// pages (R2.htm, R4.htm...), listed in the filing's FilingSummary.xml, and
// those pages name every line's element, the company's own included.
//
// Of the 50 largest companies by revenue, NVIDIA was the only one whose cash
// side missed a line this way; below them, KLA ($3.3B, its own element) and
// eBay ($1.1B) did too (9 November 2026).

export type StatementRow = {
  label: string;
  // "us-gaap", or the company's own prefix ("nvda").
  prefix: string;
  element: string;
  // One per column, left to right: a 10-K's balance sheet puts the year end
  // first and the year before second; a 10-Q's puts the quarter first.
  values: (number | null)[];
};

export type StatementPage = { scale: number; rows: StatementRow[] };

// The balance sheet's page in a filing's FilingSummary.xml: the first
// statement whose short name says balance sheet or financial position, not
// its parenthetical page.
export function balanceSheetFile(filingSummaryXml: string): string | null {
  for (const m of filingSummaryXml.matchAll(/<Report\b[^>]*>([\s\S]*?)<\/Report>/g)) {
    const body = m[1];
    const short = body.match(/<ShortName>([\s\S]*?)<\/ShortName>/)?.[1] ?? "";
    const category = body.match(/<MenuCategory>([\s\S]*?)<\/MenuCategory>/)?.[1] ?? "";
    const file = body.match(/<HtmlFileName>([\s\S]*?)<\/HtmlFileName>/)?.[1] ?? null;
    if (category !== "Statements" || !file) continue;
    // Investment companies call it a statement of assets and liabilities.
    if (/balance sheet|financial condition|financial position|assets and liabilities/i.test(short) && !/parenthetical/i.test(short)) return file;
  }
  return null;
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&#8217;/g, "’")
    .replace(/\s+/g, " ")
    .trim();
}

const SCALES: [RegExp, number][] = [
  [/\bin billions\b/i, 1e9],
  [/\bin millions\b/i, 1e6],
  [/\bin thousands\b/i, 1e3],
];

// The page's own statement of scale: "$ in Millions" (NVIDIA), or "In
// Thousands" for the whole page. Dollars' scale wins when the page states
// shares' separately ("shares in Thousands, $ in Millions").
function pageScale(heading: string): number {
  const dollars = heading.match(/\$\s*in\s+(billions|millions|thousands)/i)?.[1];
  const which = dollars ? `in ${dollars}` : heading;
  for (const [re, scale] of SCALES) if (re.test(which)) return scale;
  return 1;
}

export function parseStatementPage(html: string): StatementPage {
  const heading = text(html.match(/<th\b[^>]*>([\s\S]*?)<\/th>/)?.[1] ?? "");
  const scale = pageScale(heading);
  const rows: StatementRow[] = [];
  for (const tr of html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const label = tr.match(/<td class="pl[^"]*"[^>]*>([\s\S]*?)<\/td>/);
    if (!label) continue;
    const ref = tr.match(/defref_([A-Za-z0-9-]+)_([A-Za-z0-9_]+)/);
    // Every cell after the label, so the columns line up; a text cell (a
    // blank, a dash, a note) is no number.
    const values = [...tr.matchAll(/<td class="(nump?|text)\b[^"]*"[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => {
      if (cell[1] === "text") return null;
      const raw = text(cell[2]);
      const digits = raw.replace(/[^0-9.]/g, "");
      return digits ? (raw.includes("(") ? -1 : 1) * Number(digits) * scale : null;
    });
    rows.push({ label: text(label[1]), prefix: ref?.[1] ?? "", element: ref?.[2] ?? "", values });
  }
  return { scale, rows };
}

// —— Securities the cash side hasn't counted ——
const SECURITIES = /marketable|short[- ]term investments|investments|securities|time deposits|certificates of deposit/i;
const NOT_CASH_LIKE =
  /restricted|receivable|held for sale|equity[- ]method|customer|client|funds held|settlement|derivative|long[- ]term|non-?current|pledged|collateral|total/i;

export type SecuritiesRead =
  | { ok: true; added: { element: string; label: string; value: number }[] }
  | { ok: false; reason: string };

// Lines among the current assets that look like cash's neighbours (marketable
// securities, short-term investments, time deposits) and whose element isn't
// one the cash figure already counted. The page is trusted only when its
// cash line (labelled cash, or under the cash figure's own element) equals
// the cash figure from the frames within 0.5% in some column, which proves
// the column and the scale; the securities are read from that column.
// Otherwise nothing is added and the read says why. A balance sheet with no
// current assets (an investment company's, U-Haul's) has nothing to add: its
// securities are investments, and only cash counts, as for every company.
export function securitiesOnBalanceSheet(page: StatementPage, cash: { value: number; tag: string }, counted: ReadonlySet<string>): SecuritiesRead {
  const end = currentAssetsEnd(page);
  if (end < 0) return { ok: true, added: [] };
  const current = page.rows.slice(0, end);
  const found = cashColumn(current, cash);
  if (!found) return { ok: false, reason: CASH_MISMATCH };
  const { col, cashRow } = found;
  const added = current
    .filter((r) => r !== cashRow && SECURITIES.test(r.label) && !NOT_CASH_LIKE.test(r.label) && !counted.has(r.element))
    .filter((r) => (r.values[col] ?? 0) > 0)
    .map((r) => line(r, col));
  return { ok: true, added };
}

const CASH_MISMATCH = "the page's cash line doesn't match the filed cash figure";

function currentAssetsEnd(page: StatementPage): number {
  return page.rows.findIndex((r) => r.element === "AssetsCurrent" || /^total current assets$/i.test(r.label));
}

// The column whose cash line equals the filed cash figure.
function cashColumn(rows: StatementRow[], cash: { value: number; tag: string }): { col: number; cashRow: StatementRow } | null {
  const matches = (v: number | null | undefined) => v != null && Math.abs(v - cash.value) <= Math.max(Math.abs(cash.value) * 0.005, 1);
  const width = Math.max(0, ...rows.map((r) => r.values.length));
  for (let col = 0; col < width; col++) {
    const cashRow = rows.find((r) => (r.element === cash.tag || /^cash\b/i.test(r.label)) && matches(r.values[col]));
    if (cashRow) return { col, cashRow };
  }
  return null;
}

function line(r: StatementRow, col: number) {
  return { element: r.prefix ? `${r.prefix}:${r.element}` : r.element, label: r.label, value: r.values[col]! };
}

// —— Debt due within a year that the debt figure hasn't counted ——
// Every debt line among the current liabilities is read, from the column the
// cash line proves; the caller subtracts what it already counted
// (metrics.ts, withStatementDebt).
//
// Caterpillar's page is the hard case. Under the heading "Long-term debt due
// within one year:" its consolidated balance sheet has no figure; the
// figures sit further down the page, one block per business ($0.04B for
// machinery, $7.09B for its finance arm, end of 2025), and never added up,
// which is why the frames have nothing. A heading like that is filled from
// the blocks, but only when the blocks provably add up to the whole: some
// consolidated debt line must equal the sum of its own block lines
// (Caterpillar's short-term borrowings: $0 + $5.51B = $5.51B). Otherwise the
// read fails, and net cash is n/a rather than short.
const DEBT = /debt|borrowing|notes payable|commercial paper|loans? payable|bank loans/i;
const NOT_DEBT = /lease|interest|accrued|tax|deferred|derivative|operating|total|accounts payable|trade|customer|compensation|warrant/i;
const isDebt = (r: StatementRow) => DEBT.test(r.label) && !NOT_DEBT.test(r.label);
const bare = (label: string) => label.replace(/:\s*$/, "").trim().toLowerCase();

export type DebtRead = { ok: true; lines: { element: string; label: string; value: number }[] } | { ok: false; reason: string };

export function shortTermDebtOnBalanceSheet(page: StatementPage, cash: { value: number; tag: string }): DebtRead {
  const assetsEnd = currentAssetsEnd(page);
  const liabilitiesEnd = page.rows.findIndex((r) => r.element === "LiabilitiesCurrent" || /^total current liabilities$/i.test(r.label));
  if (assetsEnd < 0 || liabilitiesEnd < 0) return { ok: true, lines: [] };
  const found = cashColumn(page.rows.slice(0, assetsEnd), cash);
  if (!found) return { ok: false, reason: CASH_MISMATCH };
  const { col } = found;
  const totalAssets = page.rows.findIndex((r) => r.element === "Assets" || /^total assets$/i.test(r.label));
  const start = totalAssets >= 0 && totalAssets < liabilitiesEnd ? totalAssets + 1 : assetsEnd + 1;
  const section = page.rows.slice(start, liabilitiesEnd);
  const below = page.rows.slice(liabilitiesEnd + 1);
  const value = (r: StatementRow) => r.values[col] ?? null;
  const lines = section.filter((r) => isDebt(r) && (value(r) ?? 0) > 0).map((r) => line(r, col));

  // Headings with no figure of their own, filled from the blocks below.
  const empty = section.filter((r, i) => isDebt(r) && r.values.every((v) => v == null) && !(section[i + 1] && isDebt(section[i + 1]) && value(section[i + 1]) != null));
  if (empty.length === 0) return { ok: true, lines };
  const blocksOf = (label: string) => below.filter((r) => bare(r.label) === bare(label) && value(r) != null);
  const check = section.find((r) => isDebt(r) && value(r) != null && blocksOf(r.label).length > 0);
  const sum = (rows: StatementRow[]) => rows.reduce((s, r) => s + (value(r) ?? 0), 0);
  if (!check || Math.abs(sum(blocksOf(check.label)) - value(check)!) > Math.max(Math.abs(value(check)!) * 0.005, 1)) {
    return { ok: false, reason: "debt shown only by business, and the businesses' figures can't be checked against a total" };
  }
  for (const heading of empty) for (const r of blocksOf(heading.label)) if ((value(r) ?? 0) > 0) lines.push(line(r, col));
  return { ok: true, lines };
}
