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
  return map[symbol.trim().toUpperCase()] ?? null;
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
};

export type Submissions = {
  cik: string;
  name: string;
  sic: string;
  sicDescription: string;
  fiscalYearEnd: string;
  category?: string;
  filings: { recent: SubmissionsFilings; files?: unknown[] };
};

async function fetchSubmissionsRaw(cik: string): Promise<Submissions> {
  console.log(`[cache] MISS fetchSubmissions(${cik}) — calling SEC`);
  return getJson<Submissions>(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`, `CIK ${cik}`);
}

// Six hours. Filings appear on their own schedule; this only needs to be fresh
// enough that a new 10-K is noticed the same day.
const cachedSubmissions = unstable_cache(fetchSubmissionsRaw, ["secSubmissions"], { revalidate: 60 * 60 * 6 });

export async function getSubmissions(cik: string): Promise<Submissions | null> {
  try {
    return await cachedSubmissions(padCik(cik));
  } catch {
    return null;
  }
}

// The most recent filing of a given form, used to decide whether stored
// financials are stale without downloading the multi-megabyte facts file.
export type FilingRef = { accession: string; filed: string; reportDate: string; form: string };

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
    };
  }
  return null;
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
