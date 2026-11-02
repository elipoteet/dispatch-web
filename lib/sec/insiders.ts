// Insider trades: finding a company's Form 4s, reading them, storing what
// they say (phase nine, stage 6). Server-only.
//
// The submissions file lists every Form 4 filed about the company, and each
// is one small XML file at the SEC: one request apiece. NVIDIA had 80 in the
// year to November 2026 and JPMorgan 133, too many to read while a visitor
// waits. So a filing is read once, ever, and stored (insider_filings records
// that it was read, insider_trades what it said): the page reads the newest
// few itself and leaves the rest to after() and the daily cron.

import { createPublicClient, createServiceRoleClient } from "@/lib/supabase/service";
import { fetchSecText, getSubmissions, NoSecDataError, padCik, type Submissions } from "@/lib/sec/client";
import { form4XmlName, parseForm4, tradesFromFiling, type InsiderTrade } from "@/lib/sec/form4";

// How far back the Insiders tab reads: the last two years of filings, which
// covers the twelve-month summary with a year to spare for the table.
export const INSIDER_WINDOW_MONTHS = 24;

export function insiderWindowStart(asOf: string): string {
  const d = new Date(asOf);
  d.setUTCMonth(d.getUTCMonth() - INSIDER_WINDOW_MONTHS);
  return d.toISOString().slice(0, 10);
}

export type Form4Filing = { accession: string; filed: string; form: string; document: string };

// The company's Form 4s (and amendments) filed since a date, newest first.
export function form4Filings(submissions: Submissions, since: string): Form4Filing[] {
  const r = submissions.filings?.recent;
  if (!r?.form?.length) return [];
  const out: Form4Filing[] = [];
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] !== "4" && r.form[i] !== "4/A") continue;
    if (r.filingDate[i] < since) continue;
    out.push({ accession: r.accessionNumber[i], filed: r.filingDate[i], form: r.form[i], document: r.primaryDocument?.[i] ?? "" });
  }
  return out.sort((a, b) => (a.filed < b.filed ? 1 : -1));
}

// How far back the submissions file's list of recent filings reaches. Beyond
// it, Form 4s exist but aren't listed: JPMorgan's list reaches back only about
// a year, because it files thousands of prospectus supplements.
export function filingsListedFrom(submissions: Submissions): string | null {
  const dates = submissions.filings?.recent?.filingDate ?? [];
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
}

function xmlUrl(cik: string, f: Form4Filing): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(padCik(cik))}/${f.accession.replace(/-/g, "")}/${form4XmlName(f.document)}`;
}

type Reading = { status: "read" | "unreadable"; trades: InsiderTrade[] };

// A transient failure (the SEC busy, the network) throws, so nothing is
// recorded and the filing is tried again. A missing or unparseable file is
// recorded as unreadable, so it isn't.
async function readOne(cik: string, f: Form4Filing): Promise<Reading> {
  if (!f.document) return { status: "unreadable", trades: [] };
  let xml: string;
  try {
    xml = await fetchSecText(xmlUrl(cik, f));
  } catch (err) {
    if (err instanceof NoSecDataError) return { status: "unreadable", trades: [] };
    throw err;
  }
  const parsed = parseForm4(xml);
  if (!parsed) return { status: "unreadable", trades: [] };
  return { status: "read", trades: tradesFromFiling(parsed, f) };
}

async function save(cik: string, f: Form4Filing, reading: Reading): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("insider_filings")
    .upsert({ accession: f.accession, cik, form: f.form, filed_at: f.filed, status: reading.status, read_at: new Date().toISOString() }, { onConflict: "accession" });
  if (error) {
    console.error(`[insiders] save filing ${f.accession}:`, error.message);
    return false;
  }
  if (reading.trades.length === 0) return true;
  const { error: tradesError } = await supabase.from("insider_trades").upsert(
    reading.trades.map((t) => ({
      accession: t.accession,
      line: t.line,
      cik,
      filed_at: t.filedAt,
      form: t.form,
      owner_name: t.ownerName,
      owner_cik: t.ownerCik,
      owner_role: t.ownerRole,
      security: t.security,
      is_derivative: t.isDerivative,
      transaction_date: t.date,
      code: t.code,
      acquired_disposed: t.acquiredDisposed,
      shares: t.shares,
      price: t.price,
      shares_after: t.sharesAfter,
      ownership: t.ownership,
      on_plan: t.onPlan,
    })),
    { onConflict: "accession,line" },
  );
  if (tradesError) {
    // Without its trades the filing isn't read: forget it, so it's tried again.
    console.error(`[insiders] save trades ${f.accession}:`, tradesError.message);
    await supabase.from("insider_filings").delete().eq("accession", f.accession);
    return false;
  }
  return true;
}

// Reads and stores the given filings, four at a time under the SEC's rate
// limit. Returns how many were stored.
export async function readInsiderFilings(cik: string, filings: Form4Filing[]): Promise<number> {
  let stored = 0;
  for (let i = 0; i < filings.length; i += 4) {
    const batch = filings.slice(i, i + 4);
    const results = await Promise.all(
      batch.map(async (f) => {
        try {
          return await save(cik, f, await readOne(cik, f));
        } catch (err) {
          console.error(`[insiders] read ${f.accession}:`, err instanceof Error ? err.message : err);
          return false;
        }
      }),
    );
    stored += results.filter(Boolean).length;
  }
  return stored;
}

const PAGE = 1000;

// Which of the company's filings since a date have been read. Null when the
// table can't be read (not created yet, or the database unreachable).
export async function readAccessions(cik: string, since: string): Promise<Set<string> | null> {
  const supabase = createPublicClient();
  const out = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("insider_filings")
      .select("accession")
      .eq("cik", cik)
      .gte("filed_at", since)
      .order("accession", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data) return null;
    for (const r of data) out.add(r.accession as string);
    if (data.length < PAGE) return out;
  }
}

type TradeRowDb = {
  accession: string;
  line: number;
  filed_at: string;
  form: string;
  owner_name: string;
  owner_cik: string | null;
  owner_role: string | null;
  security: string | null;
  is_derivative: boolean;
  transaction_date: string | null;
  code: string;
  acquired_disposed: string | null;
  shares: string | number | null;
  price: string | number | null;
  shares_after: string | number | null;
  ownership: string | null;
  on_plan: boolean;
};

const num = (v: string | number | null): number | null => (v == null ? null : Number(v));

// The company's stored trades from filings since a date, newest first.
export async function storedTrades(cik: string, since: string): Promise<InsiderTrade[] | null> {
  const supabase = createPublicClient();
  const rows: TradeRowDb[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("insider_trades")
      .select("*")
      .eq("cik", cik)
      .gte("filed_at", since)
      .order("transaction_date", { ascending: false })
      .order("accession", { ascending: false })
      .order("line", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data) return null;
    rows.push(...(data as TradeRowDb[]));
    if (data.length < PAGE) break;
  }
  return rows.map((r) => ({
    accession: r.accession,
    line: r.line,
    filedAt: r.filed_at,
    form: r.form,
    ownerName: r.owner_name,
    ownerCik: r.owner_cik,
    ownerRole: r.owner_role,
    security: r.security,
    isDerivative: r.is_derivative,
    date: r.transaction_date,
    code: r.code,
    acquiredDisposed: r.acquired_disposed === "A" || r.acquired_disposed === "D" ? r.acquired_disposed : null,
    shares: num(r.shares),
    price: num(r.price),
    sharesAfter: num(r.shares_after),
    ownership: r.ownership === "D" || r.ownership === "I" ? r.ownership : null,
    onPlan: r.on_plan,
  }));
}

// —— The daily refresh (folded into the existing cron) ——
// Companies whose insider filings have been read before, the longest-unread
// first, each brought up to date with its new Form 4s, until the time budget
// runs out. "Companies someone has opened", per the brief: a company gets
// here only by someone opening its Insiders tab.
export async function refreshInsiders(budgetMs: number, perCompany = 40): Promise<{ companies: number; filings: number }> {
  const started = Date.now();
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("insider_filings").select("cik, read_at").order("read_at", { ascending: false }).limit(5000);
  if (error || !data) return { companies: 0, filings: 0 };

  const lastRead = new Map<string, string>();
  for (const r of data) if (!lastRead.has(r.cik as string)) lastRead.set(r.cik as string, r.read_at as string);
  const ciks = [...lastRead.entries()].sort((a, b) => (a[1] < b[1] ? -1 : 1)).map(([cik]) => cik);

  const since = insiderWindowStart(new Date().toISOString().slice(0, 10));
  let companies = 0;
  let filings = 0;
  for (const cik of ciks) {
    if (Date.now() - started > budgetMs) break;
    const submissions = await getSubmissions(cik);
    const read = submissions ? await readAccessions(cik, since) : null;
    if (!submissions || !read) continue;
    const missing = form4Filings(submissions, since).filter((f) => !read.has(f.accession)).slice(0, perCompany);
    filings += await readInsiderFilings(cik, missing);
    companies++;
  }
  return { companies, filings };
}
