// Every request to the SEC goes through here. Server-only.
//
// Two hard requirements from the SEC, both verified empirically in October 2026:
//
// 1. A descriptive User-Agent naming the site and a contact email. Without one,
//    data.sec.gov answers 403 — confirmed by sending an empty header and getting
//    exactly that. This is not advisory.
// 2. Stay under ~10 requests a second. The limiter below is deliberately set
//    well under it; nothing in this phase is latency-critical enough to justify
//    crowding a free public service that has no commercial relationship with us.
//
// Unlike Twelve Data, the SEC has no per-minute quota to ration — the constraint
// is politeness and payload size, not credits.

import { unstable_cache } from "next/cache";

// Thrown when the SEC has confirmed there is no data for this company — an
// unknown CIK, or a company that has never filed XBRL. Distinct from a plain
// Error (network failure, 503, a blocked User-Agent), exactly as
// NoTickerDataError is in lib/providers.ts, so callers can tell "this company
// has no SEC data" from "the SEC is unreachable right now".
export class NoSecDataError extends Error {}

// The contact address the SEC sees, from SEC_CONTACT_EMAIL. There is deliberately
// NO fallback: the SEC uses this address to reach the owner of a script that
// misbehaves, so a default pointing at an unmonitored mailbox would be worse
// than not calling at all. If it is unset we skip the SEC entirely and say so in
// the logs, rather than sending a request that earns a 403 or, worse, one that
// works and names an inbox nobody reads.
export class SecNotConfiguredError extends Error {}

// Logged once per process rather than per request — an unset variable would
// otherwise bury every other line in the logs.
let warnedMissingContact = false;

function userAgent(): string {
  const email = process.env.SEC_CONTACT_EMAIL?.trim();
  if (!email) {
    if (!warnedMissingContact) {
      warnedMissingContact = true;
      console.warn(
        "[sec] SEC_CONTACT_EMAIL is not set — skipping all SEC requests. " +
          "The SEC requires a contact email in the User-Agent and returns 403 without one. " +
          "Set it in .env.local and in Vercel's project settings.",
      );
    }
    throw new SecNotConfiguredError("SEC_CONTACT_EMAIL is not set.");
  }
  return `The Dispatch (dispatchresearch.com) ${email}`;
}

// True when the SEC can be called at all. Callers that want to degrade quietly
// rather than catch can check this first.
export function isSecConfigured(): boolean {
  return Boolean(process.env.SEC_CONTACT_EMAIL?.trim());
}

// —— Rate limiting ——
// A single in-process gate. This is one of the few places a plain module-level
// variable is correct rather than a mistake: it is not a cache (nothing is being
// remembered across invocations, so the usual unstable_cache rule does not
// apply), it is a throttle whose only job is to space out calls inside one
// serverless invocation. Several invocations running at once each keep their own
// spacing, which is why the floor is set far below the SEC's actual ceiling.
const MIN_GAP_MS = 150; // ~6.6 requests/second at worst, against a ~10/s limit
let nextSlot = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_GAP_MS;
  if (slot > now) await sleep(slot - now);
}

async function secFetch(url: string): Promise<Response> {
  // Built before the rate-limit wait so an unconfigured contact fails instantly
  // instead of sleeping first.
  const ua = userAgent();
  await waitForSlot();
  return fetch(url, {
    headers: { "User-Agent": ua, Accept: "application/json" },
    cache: "no-store",
  });
}

// One retry on 429 or 5xx, then give up. The SEC is normally rock solid; a long
// retry chain would just hold a serverless invocation open.
async function getJson<T>(url: string, what: string): Promise<T> {
  let res = await secFetch(url);
  if (res.status === 404) throw new NoSecDataError(`No SEC data for ${what}.`);
  if (res.status === 429 || res.status >= 500) {
    await sleep(1_000);
    res = await secFetch(url);
  }
  if (res.status === 404) throw new NoSecDataError(`No SEC data for ${what}.`);
  if (res.status === 403) {
    // Almost always the User-Agent. Say so, rather than letting it look like an outage.
    throw new Error(`SEC returned 403 for ${what} — check SEC_CONTACT_EMAIL is a real, monitored address.`);
  }
  if (!res.ok) throw new Error(`SEC HTTP ${res.status} for ${what}`);
  return (await res.json()) as T;
}

// —— Ticker to CIK ——
// company_tickers.json is ~800KB and maps every listed symbol to its CIK (the
// SEC's permanent company id) and name. Small enough to cache whole, and it is
// also the only company-name search source the site has — TickerSearchBar
// currently has no name lookup at all.
//
// Shape is an object keyed by row number, not an array:
//   { "0": { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" }, ... }
type TickerFileRow = { cik_str: number; ticker: string; title: string };

export type CompanyRef = { cik: string; symbol: string; name: string };

// CIKs are zero-padded to ten digits in every data.sec.gov path.
export function padCik(cik: string | number): string {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

async function fetchTickerMapRaw(): Promise<Record<string, CompanyRef>> {
  console.log("[cache] MISS fetchTickerMap — calling SEC");
  const json = await getJson<Record<string, TickerFileRow>>(
    "https://www.sec.gov/files/company_tickers.json",
    "the ticker list",
  );
  const map: Record<string, CompanyRef> = {};
  for (const row of Object.values(json)) {
    if (!row?.ticker) continue;
    // First listing wins: the file is ordered by size, and a handful of symbols
    // appear twice across share classes.
    if (map[row.ticker]) continue;
    map[row.ticker] = { cik: padCik(row.cik_str), symbol: row.ticker, name: row.title };
  }
  return map;
}

// 24 hours, per the brief. New listings are rare and a day late is harmless.
const cachedTickerMap = unstable_cache(fetchTickerMapRaw, ["secTickerMap"], { revalidate: 60 * 60 * 24 });

export async function getTickerMap(): Promise<Record<string, CompanyRef> | null> {
  try {
    return await cachedTickerMap();
  } catch {
    return null;
  }
}

export async function lookupCik(symbol: string): Promise<CompanyRef | null> {
  const map = await getTickerMap();
  if (!map) return null;
  const s = symbol.trim().toUpperCase();
  // The SEC writes share classes with a hyphen (BRK-B) where the site and the
  // price providers use a dot (BRK.B). Checked against company_tickers.json.
  return map[s] ?? map[s.replace(/\./g, "-")] ?? null;
}

// —— Submissions ——
// Small, cheap, and the only place that carries SIC code (which decides whether
// gross margin and free cash flow mean anything for this filer), fiscal year
// end, and the filing index used to detect that a new 10-K/10-Q/Form 4 exists.
export type SubmissionsFilings = {
  accessionNumber: string[];
  filingDate: string[];
  reportDate: string[];
  form: string[];
  primaryDocument: string[];
  // An 8-K's item numbers, comma-separated ("2.02,9.01"). Item 2.02 is
  // "Results of Operations and Financial Condition": the earnings release.
  items?: string[];
};

export type Submissions = {
  cik: string;
  name: string;
  sic: string;
  sicDescription: string;
  fiscalYearEnd: string;
  // Parallel arrays: NVIDIA is tickers ["NVDA"], exchanges ["Nasdaq"].
  tickers?: string[];
  exchanges?: (string | null)[];
  // "operating" for companies; "other" for funds like SPY, which are in the
  // ticker file but file no 10-Ks and have no company facts.
  entityType?: string;
  category?: string;
  filings: { recent: SubmissionsFilings; files?: unknown[] };
};

// The filing types any part of the research file reads. Everything else is
// dropped before caching.
const KEPT_FORMS = new Set([
  "10-K",
  "10-K/A",
  "10-KT",
  "10-Q",
  "10-Q/A",
  "20-F",
  "20-F/A",
  "40-F",
  "8-K",
  "8-K/A",
  "4",
  "4/A",
  "DEF 14A",
]);

// The raw submissions file can be far larger than its useful part: JPMorgan's
// is 5.3MB, almost all of it hundreds of 424B2 prospectus supplements for
// structured notes. Over the data cache's 2MB ceiling, unstable_cache silently
// keeps nothing, so every visit re-downloaded it (found in stage 2's server
// log). Keeping only the fields and filing types we read makes it a few KB.
export function compactSubmissions(raw: Submissions): Submissions {
  const r = raw.filings?.recent;
  const recent: SubmissionsFilings = { accessionNumber: [], filingDate: [], reportDate: [], form: [], primaryDocument: [], items: [] };
  for (let i = 0; i < (r?.form?.length ?? 0); i++) {
    if (!KEPT_FORMS.has(r.form[i])) continue;
    recent.accessionNumber.push(r.accessionNumber[i]);
    recent.filingDate.push(r.filingDate[i]);
    recent.reportDate.push(r.reportDate[i]);
    recent.form.push(r.form[i]);
    recent.primaryDocument.push(r.primaryDocument?.[i] ?? "");
    // Only 8-Ks carry items, and only their item numbers are ever read.
    recent.items!.push(r.form[i].startsWith("8-K") ? (r.items?.[i] ?? "") : "");
  }
  return {
    cik: raw.cik,
    name: raw.name,
    sic: raw.sic,
    sicDescription: raw.sicDescription,
    fiscalYearEnd: raw.fiscalYearEnd,
    tickers: raw.tickers,
    exchanges: raw.exchanges,
    entityType: raw.entityType,
    category: raw.category,
    filings: { recent },
  };
}

async function fetchSubmissionsRaw(cik: string): Promise<Submissions> {
  console.log(`[cache] MISS fetchSubmissions(${cik}) — calling SEC`);
  return compactSubmissions(await getJson<Submissions>(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`, `CIK ${cik}`));
}

// Six hours. Filings appear on their own schedule; this only needs to be fresh
// enough that a new 10-K is noticed the same day.
// The key carries a version because unstable_cache keys on the cached
// function's own source, not on the helpers it calls: when compactSubmissions
// started keeping 8-K items (stage 3), entries cached without them would
// otherwise have been served for up to six more hours. Bump it whenever
// compactSubmissions' output changes.
const cachedSubmissions = unstable_cache(fetchSubmissionsRaw, ["secSubmissions", "v2"], { revalidate: 60 * 60 * 6 });

export async function getSubmissions(cik: string): Promise<Submissions | null> {
  try {
    return await cachedSubmissions(padCik(cik));
  } catch {
    return null;
  }
}

// The most recent filing of a given form, used to decide whether stored
// financials are stale without downloading the multi-megabyte facts file.
export type FilingRef = {
  accession: string;
  filed: string;
  reportDate: string;
  form: string;
  // The filing's main document, e.g. "nvda-20260125.htm" — what a reader opens.
  primaryDocument: string;
};

export function latestFiling(submissions: Submissions, forms: string[]): FilingRef | null {
  const r = submissions.filings?.recent;
  if (!r?.form?.length) return null;
  for (let i = 0; i < r.form.length; i++) {
    if (!forms.includes(r.form[i])) continue;
    return {
      accession: r.accessionNumber[i],
      filed: r.filingDate[i],
      reportDate: r.reportDate[i],
      form: r.form[i],
      primaryDocument: r.primaryDocument?.[i] ?? "",
    };
  }
  return null;
}

// —— Earnings release dates ——
// The day a company reports earnings it files an 8-K under Item 2.02
// ("Results of Operations and Financial Condition"). Those filing dates are
// the earnings dates the price chart marks: free, and the company's own
// record, where Finnhub's free calendar has only upcoming dates.
//
// They come from the submissions file's recent filings, which reach back as
// far as the filer's last thousand filings or a year, whichever is longer:
// NVIDIA to 2020, Coca-Cola to 2018, Apple to 2015, but JPMorgan only to late
// 2025, because it files tens of thousands of prospectus supplements a year.
// So the result also says how far back it can be trusted to be complete.
export function earningsReleaseDates(submissions: Submissions): { dates: string[]; completeFrom: string | null } {
  const r = submissions.filings?.recent;
  if (!r?.form?.length) return { dates: [], completeFrom: null };
  const dates = new Set<string>();
  let oldestFiling: string | null = null;
  for (let i = 0; i < r.form.length; i++) {
    const filed = r.filingDate[i];
    if (!oldestFiling || filed < oldestFiling) oldestFiling = filed;
    if (!r.form[i].startsWith("8-K")) continue;
    if ((r.items?.[i] ?? "").split(",").map((s) => s.trim()).includes("2.02")) dates.add(filed);
  }
  return { dates: [...dates].sort(), completeFrom: oldestFiling };
}

// The earnings-release 8-Ks themselves, newest first, for the Earnings tab's
// guidance (stage 5). One per filing day: a company occasionally files two
// 8-Ks under Item 2.02 on the same day (the release and a correction).
export type ReleaseFiling = { accession: string; filed: string };

export function earningsReleaseFilings(submissions: Submissions, limit = 5): ReleaseFiling[] {
  const r = submissions.filings?.recent;
  if (!r?.form?.length) return [];
  const out: ReleaseFiling[] = [];
  const days = new Set<string>();
  for (let i = 0; i < r.form.length && out.length < limit; i++) {
    if (r.form[i] !== "8-K") continue;
    if (!(r.items?.[i] ?? "").split(",").map((s) => s.trim()).includes("2.02")) continue;
    if (days.has(r.filingDate[i])) continue;
    days.add(r.filingDate[i]);
    out.push({ accession: r.accessionNumber[i], filed: r.filingDate[i] });
  }
  return out.sort((a, b) => (a.filed < b.filed ? 1 : -1));
}

// A filing's index page on EDGAR, which lists every document in it by type.
export function filingIndexUrl(cik: string, accession: string): string {
  const cikNum = String(Number(padCik(cik)));
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accession.replace(/-/g, "")}/${accession}-index.htm`;
}

// The press release in an earnings 8-K: the document typed EX-99.1 on the
// filing's index page (some filers number it EX-99.01 or plain EX-99). Index
// links sometimes go through the inline-XBRL viewer ("/ix?doc=/Archives/...");
// the document's own address is what's returned.
export function pressReleaseUrl(indexHtml: string): string | null {
  return documentOfType(indexHtml, [/^EX-99\.0?1$/i, /^EX-99$/i]);
}

// The address of the first document in a filing's index whose type matches,
// trying each pattern in turn.
export function documentOfType(indexHtml: string, types: RegExp[]): string | null {
  const rows = [...indexHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
  const typed = (re: RegExp) =>
    rows.find((row) => {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1].replace(/<[^>]+>/g, "").trim());
      return cells.some((c) => re.test(c));
    });
  let row: string | undefined;
  for (const re of types) {
    row = typed(re);
    if (row) break;
  }
  const href = row?.match(/href="([^"]+)"/i)?.[1];
  if (!href) return null;
  const path = href.replace(/^\/ix\?doc=/, "").replace(/^https:\/\/www\.sec\.gov/, "");
  return path.startsWith("/") ? `https://www.sec.gov${path}` : null;
}

// —— A company's annual reports, newest first ——
// The submissions file's recent list can stop short of last year's 10-K: for
// JPMorgan it reaches back only about a year, behind thousands of prospectus
// supplements, and the older pages run to some two thousand filings a month.
// EDGAR's company feed lists the 10-Ks alone, in one small request (17KB).
export type AnnualReport = { accession: string; filed: string; indexUrl: string };

export function parseAnnualReportFeed(atom: string): AnnualReport[] {
  const out: AnnualReport[] = [];
  for (const m of atom.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const type = e.match(/<filing-type>([^<]+)<\/filing-type>/)?.[1]?.trim();
    const accession = e.match(/<accession-number>([^<]+)<\/accession-number>/)?.[1]?.trim();
    const filed = e.match(/<filing-date>([^<]+)<\/filing-date>/)?.[1]?.trim();
    const indexUrl = e.match(/<filing-href>([^<]+)<\/filing-href>/)?.[1]?.trim();
    // Original annual reports only: an amendment (10-K/A) often carries just
    // a part of the report.
    if (type === "10-K" && accession && filed && indexUrl) out.push({ accession, filed, indexUrl });
  }
  return out.sort((a, b) => (a.filed < b.filed ? 1 : -1));
}

export async function fetchAnnualReports(cik: string): Promise<AnnualReport[]> {
  const atom = await fetchSecText(
    `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${padCik(cik)}&type=10-K&dateb=&owner=include&count=10&output=atom`,
  );
  return parseAnnualReportFeed(atom);
}

// Any EDGAR page as text, through the same rate limit and User-Agent as
// everything else. Throws on failure, so a cache never keeps one.
export async function fetchSecText(url: string): Promise<string> {
  const ua = userAgent();
  await waitForSlot();
  const res = await fetch(url, { headers: { "User-Agent": ua, Accept: "text/html" }, cache: "no-store" });
  if (res.status === 404) throw new NoSecDataError(`No document at ${url}.`);
  if (!res.ok) throw new Error(`SEC HTTP ${res.status} for ${url}`);
  return res.text();
}

// The public EDGAR address of a filing's main document — the page every
// "source" link on the research pages points at.
export function filingDocumentUrl(cik: string, filing: Pick<FilingRef, "accession" | "primaryDocument">): string {
  const cikNum = String(Number(padCik(cik)));
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${filing.accession.replace(/-/g, "")}/${filing.primaryDocument}`;
}

// —— A filing's own document ——
// Used to read a 10-K's Item 1 for the Overview's two-sentence description.
// Several megabytes for a large company (NVIDIA's fiscal 2026 10-K is mostly
// inline XBRL markup), so, like company facts, it is never cached raw: the
// caller extracts the few kilobytes it needs and stores the result.
export async function fetchFilingDocument(
  cik: string,
  filing: Pick<FilingRef, "accession" | "primaryDocument">,
): Promise<string> {
  const ua = userAgent();
  await waitForSlot();
  const url = filingDocumentUrl(cik, filing);
  const res = await fetch(url, { headers: { "User-Agent": ua, Accept: "text/html" }, cache: "no-store" });
  if (res.status === 404) throw new NoSecDataError(`No document at ${url}.`);
  if (!res.ok) throw new Error(`SEC HTTP ${res.status} for ${url}`);
  return res.text();
}

// —— Company facts ——
// The whole XBRL history in one file. It is LARGE — NVDA 4.1MB, JPMorgan 8.0MB,
// both measured — which is why it is deliberately NOT wrapped in unstable_cache:
// Vercel's data cache rejects entries over roughly 2MB, so caching the raw file
// would fail silently and re-fetch every time. Callers normalise it to the
// compact row shape and persist THAT (see lib/sec/store.ts). Nothing else in
// this codebase should hold the raw object for longer than one request.
import type { CompanyFacts } from "@/lib/sec/normalize";

export async function fetchCompanyFacts(cik: string): Promise<CompanyFacts> {
  console.log(`[sec] fetching companyfacts for CIK ${padCik(cik)}`);
  return getJson<CompanyFacts>(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`,
    `CIK ${cik} company facts`,
  );
}
