// The screener page's reads from screener_metrics. Server only.
//
// Filtering, sorting and paging all happen in the database query; the page
// receives only the rows it shows. Reads use the public key (the table is
// public reference data, migration 0026), with a time limit, and never throw:
// a failure comes back as a reason the page can explain inline with a normal
// 200, since error.tsx boundaries have been unreliable here.

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/service";
import { RANGE_FILTERS, companyName, conditions, rangeFilter, type Filters, type View } from "@/lib/screener/filters";
import { STARTING_SCREENS } from "@/lib/screener/screens";

const TABLE = "screener_metrics";
const TIMEOUT_MS = 8000;

export type Failure = { ok: false; reason: "not-built" | "unavailable" };

export type ResultRow = {
  cik: string;
  ticker: string;
  name: string;
  sector: string | null;
  periodEnd: string;
  // By filter param ("growth1y"), as stored: fractions and dollars.
  values: Record<string, number | null>;
};

export type Results = { ok: true; rows: ResultRow[]; total: number } | Failure;

const SELECT = ["cik", "ticker", "name", "sector", "period_end", ...RANGE_FILTERS.map((f) => f.column)].join(",");

// The two queries below: matching rows, and a bare count.
function listQuery(filters: Filters) {
  let q = createPublicClient().from(TABLE).select(SELECT, { count: "exact" });
  for (const c of conditions(filters)) q = c.op === "in" ? q.in(c.column, c.values) : c.op === "gte" ? q.gte(c.column, c.value) : q.lte(c.column, c.value);
  return q;
}

function countQuery(filters: Filters) {
  let q = createPublicClient().from(TABLE).select("cik", { count: "exact", head: true });
  for (const c of conditions(filters)) q = c.op === "in" ? q.in(c.column, c.values) : c.op === "gte" ? q.gte(c.column, c.value) : q.lte(c.column, c.value);
  return q;
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toRow(raw: Record<string, unknown>): ResultRow {
  const values: Record<string, number | null> = {};
  for (const f of RANGE_FILTERS) values[f.param] = num(raw[f.column]);
  return {
    cik: String(raw.cik),
    ticker: String(raw.ticker),
    name: companyName(String(raw.name ?? raw.ticker)),
    sector: raw.sector == null ? null : String(raw.sector),
    periodEnd: String(raw.period_end ?? ""),
    values,
  };
}

function sortColumn(sort: string): string {
  if (sort === "name" || sort === "sector") return sort;
  return rangeFilter(sort)?.column ?? "revenue";
}

async function count(filters: Filters): Promise<number> {
  const { count: n, error } = await countQuery(filters).abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  if (error) throw new Error(`screener count: ${error.message}`);
  return n ?? 0;
}

function failure(where: string, e: unknown): Failure {
  console.error(`[screener] ${where}:`, e instanceof Error ? e.message : e);
  return { ok: false, reason: "unavailable" };
}

// For checking the page's inline messages on a real server, as
// TWELVE_DATA_FORCE_BUSY does for prices: SCREENER_FORCE_FAILURE=unavailable
// (database down or slow) or =not-built (the job hasn't filled the table).
function forcedFailure(): Failure | null {
  const forced = process.env.SCREENER_FORCE_FAILURE;
  return forced === "unavailable" || forced === "not-built" ? { ok: false, reason: forced } : null;
}

// One page of results, and how many match in all.
export async function loadResults(view: View): Promise<Results> {
  const forced = forcedFailure();
  if (forced) return forced;
  try {
    const q = listQuery(view.filters)
      .order(sortColumn(view.sort), { ascending: view.order === "asc", nullsFirst: false })
      .order("ticker", { ascending: true })
      .range(0, view.show - 1)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    const { data, count: total, error } = await q;
    if (error) return failure("results", error);
    // Nothing matches: a tight screen, or a table the job hasn't filled yet.
    if (!total && (await count({ ranges: {}, sectors: [] })) === 0) return { ok: false, reason: "not-built" };
    return { ok: true, total: total ?? 0, rows: ((data ?? []) as unknown as Record<string, unknown>[]).map(toRow) };
  } catch (e) {
    return failure("results", e);
  }
}

// For a screen with no matches: how many companies each active filter lets
// through on its own, tightest first.
export type Alone = { key: string; alone: number };

export async function filtersAlone(filters: Filters): Promise<Alone[] | null> {
  const keys = [...RANGE_FILTERS.filter((f) => filters.ranges[f.param]).map((f) => f.param), ...(filters.sectors.length ? ["sector"] : [])];
  try {
    const counts = await Promise.all(
      keys.map((key) =>
        count(key === "sector" ? { ranges: {}, sectors: filters.sectors } : { ranges: { [key]: filters.ranges[key] }, sectors: [] }),
      ),
    );
    return keys.map((key, i) => ({ key, alone: counts[i] })).sort((a, b) => a.alone - b.alone);
  } catch (e) {
    failure("filters alone", e);
    return null;
  }
}

// —— The opening view ——
export type Overview = {
  total: number;
  // When the job last published, ISO.
  updated: string | null;
  // Each starting screen's live count, by slug.
  counts: Record<string, number>;
};

async function readOverview(): Promise<Overview> {
  const db = createPublicClient();
  const [total, latest, ...counts] = await Promise.all([
    count({ ranges: {}, sectors: [] }),
    db.from(TABLE).select("updated_at").order("updated_at", { ascending: false }).limit(1).abortSignal(AbortSignal.timeout(TIMEOUT_MS)),
    ...STARTING_SCREENS.map((s) => count(s.filters)),
  ]);
  if (latest.error) throw new Error(`screener updated_at: ${latest.error.message}`);
  const updated = (latest.data?.[0] as { updated_at?: string } | undefined)?.updated_at ?? null;
  return { total, updated, counts: Object.fromEntries(STARTING_SCREENS.map((s, i) => [s.slug, counts[i]])) };
}

// The table changes once a night, so the opening view's eight reads are
// shared for fifteen minutes. A failed read isn't cached.
const cachedOverview = unstable_cache(readOverview, ["screener-overview", "v1"], { revalidate: 900 });

export async function loadOverview(): Promise<{ ok: true; data: Overview } | Failure> {
  const forced = forcedFailure();
  if (forced) return forced;
  try {
    const data = await cachedOverview();
    if (data.total === 0) return { ok: false, reason: "not-built" };
    return { ok: true, data };
  } catch (e) {
    return failure("overview", e);
  }
}
