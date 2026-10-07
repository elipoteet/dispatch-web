// Reading and writing the normalised SEC rows. Server-only — it writes with the
// service-role key, which bypasses row-level security (see
// supabase/migrations/0021_research_data.sql for why writes have no policy).
//
// The shape of the whole thing: a company's financials are fetched from the SEC
// the first time anyone opens its page, normalised, and stored. Every later read
// comes from the table. A refresh happens only when the submissions file shows a
// filing newer than the one already stored — which is a small, cheap request,
// unlike the multi-megabyte facts file it saves us from downloading.

import { createServiceRoleClient } from "@/lib/supabase/service";
import { createPublicClient } from "@/lib/supabase/service";
import type { FinancialRow, FiscalPeriod } from "@/lib/sec/normalize";
import type { FilerKind, LineItem } from "@/lib/sec/concepts";

export type StoredCompany = {
  cik: string;
  symbol: string;
  name: string;
  sic: string | null;
  sicDescription: string | null;
  fiscalYearEnd: string | null;
  filerType: FilerKind;
  latestAccession: string | null;
  lastCheckedAt: string | null;
};

type CompanyRowDb = {
  cik: string;
  symbol: string;
  name: string;
  sic: string | null;
  sic_description: string | null;
  fiscal_year_end: string | null;
  filer_type: string;
  latest_accession: string | null;
  last_checked_at: string | null;
};

type FinancialRowDb = {
  fiscal_year: number;
  fiscal_period: string;
  line_item: string;
  period_end: string;
  value: string | number;
  unit: string;
  source_tag: string;
  accession: string | null;
  filed_at: string | null;
  restated: boolean;
  derived: boolean;
};

function toStoredCompany(row: CompanyRowDb): StoredCompany {
  return {
    cik: row.cik,
    symbol: row.symbol,
    name: row.name,
    sic: row.sic,
    sicDescription: row.sic_description,
    fiscalYearEnd: row.fiscal_year_end,
    filerType: (row.filer_type as FilerKind) ?? "operating",
    latestAccession: row.latest_accession,
    lastCheckedAt: row.last_checked_at,
  };
}

export async function getStoredCompany(cik: string): Promise<StoredCompany | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("sec_company").select("*").eq("cik", cik).maybeSingle();
  if (error || !data) return null;
  return toStoredCompany(data as CompanyRowDb);
}

export async function upsertCompany(company: {
  cik: string;
  symbol: string;
  name: string;
  sic?: string | null;
  sicDescription?: string | null;
  fiscalYearEnd?: string | null;
  filerType: FilerKind;
  latestAccession?: string | null;
}): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("sec_company").upsert(
    {
      cik: company.cik,
      symbol: company.symbol,
      name: company.name,
      sic: company.sic ?? null,
      sic_description: company.sicDescription ?? null,
      fiscal_year_end: company.fiscalYearEnd ?? null,
      filer_type: company.filerType,
      latest_accession: company.latestAccession ?? null,
      last_checked_at: new Date().toISOString(),
    },
    { onConflict: "cik" },
  );
  if (error) console.error(`[sec] upsertCompany(${company.cik}) failed:`, error.message);
  return !error;
}

// Chunked because a ten-year history across every line item runs to a few
// thousand rows, and one oversized request is the kind of thing that fails only
// on the largest companies — exactly the ones most likely to be looked at.
const UPSERT_CHUNK = 500;

export async function saveFinancials(cik: string, rows: FinancialRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = createServiceRoleClient();
  const payload = rows.map((r) => ({
    cik,
    fiscal_year: r.fiscalYear,
    fiscal_period: r.fiscalPeriod,
    line_item: r.lineItem,
    period_end: r.periodEnd,
    value: r.value,
    unit: r.unit,
    source_tag: r.sourceTag,
    accession: r.accession,
    filed_at: r.filedAt,
    restated: r.restated,
    derived: r.derived,
    updated_at: new Date().toISOString(),
  }));

  let written = 0;
  for (let i = 0; i < payload.length; i += UPSERT_CHUNK) {
    const chunk = payload.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .from("sec_financials")
      .upsert(chunk, { onConflict: "cik,fiscal_year,fiscal_period,line_item" });
    if (error) {
      console.error(`[sec] saveFinancials(${cik}) chunk failed:`, error.message);
      return written;
    }
    written += chunk.length;
  }
  return written;
}

export async function getStoredFinancials(
  cik: string,
  options: { lineItems?: LineItem[]; period?: FiscalPeriod } = {},
): Promise<FinancialRow[]> {
  const supabase = createPublicClient();
  let query = supabase.from("sec_financials").select("*").eq("cik", cik);
  if (options.lineItems?.length) query = query.in("line_item", options.lineItems);
  if (options.period) query = query.eq("fiscal_period", options.period);

  const { data, error } = await query.order("fiscal_year", { ascending: false });
  if (error || !data) return [];

  return (data as FinancialRowDb[]).map((r) => ({
    fiscalYear: r.fiscal_year,
    fiscalPeriod: r.fiscal_period as FiscalPeriod,
    lineItem: r.line_item as LineItem,
    periodEnd: r.period_end,
    // Postgres numeric comes back as a string through PostgREST; Number() is
    // exact here because every figure is well inside a double's integer range.
    value: typeof r.value === "string" ? Number(r.value) : r.value,
    unit: r.unit,
    sourceTag: r.source_tag,
    accession: r.accession ?? "",
    filedAt: r.filed_at ?? "",
    restated: r.restated,
    derived: r.derived,
  }));
}
