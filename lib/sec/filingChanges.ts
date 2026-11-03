// Comparing a company's newest 10-K's risk factors with the year before's,
// and keeping the result (phase nine, stage 7). Server-only.
//
// Five SEC requests, once per 10-K, ever: the company's list of annual
// reports, the two filings' index pages, and the two documents. The documents
// are large (JPMorgan's run to 13MB each), so this always runs after a page
// has been sent, never while a visitor waits. Only the comparison is kept.

import { createPublicClient, createServiceRoleClient } from "@/lib/supabase/service";
import { documentOfType, fetchAnnualReports, fetchSecText, getSubmissions, latestFiling, NoSecDataError } from "@/lib/sec/client";
import { breakAfterLeadingBold, htmlToText } from "@/lib/sec/tenK";
import { compareRiskFactors, extractRiskFactors, firstSentence, riskParagraphs, type RiskComparison } from "@/lib/sec/riskFactors";

// Stored with every comparison. Bump it when the rules in riskFactors.ts
// change, and comparisons made under the old ones are worked out again on the
// next visit. 2: leading bullets dropped from paragraphs. 3: a heading that
// shares a block with its paragraph split from it (Chevron, review of
// 2 November 2026).
export const COMPARISON_VERSION = 3;

// How much of each list is kept. The counts are always exact; a 10-K that
// was rewritten top to bottom (JPMorgan's, for 2025) would otherwise store
// hundreds of sentences no one would read on one page.
const KEEP_EACH = 100;
const KEEP_CHANGES = 150;

export type FilingRef = { accession: string; filed: string; url: string };

export type StoredComparison = {
  newer: FilingRef;
  older: FilingRef;
  counts: RiskComparison["counts"];
  // First sentences of added and removed paragraphs.
  added: string[];
  removed: string[];
  // Changed first, then reworded.
  changes: RiskComparison["changes"];
};

export type ChangesRow =
  | { status: "ok"; result: StoredComparison }
  | { status: "unavailable"; reason: "no-prior" | "no-section" };

// The stored comparison for a 10-K: the row, "missing" when it hasn't been
// worked out yet, or null when the table can't be read.
export async function readFilingChanges(accession: string): Promise<ChangesRow | "missing" | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("filing_changes").select("status, result").eq("accession", accession).maybeSingle();
  if (error) return null;
  if (!data) return "missing";
  const result = data.result as { version?: number; reason?: string } | null;
  if (result?.version !== COMPARISON_VERSION) return "missing";
  if (data.status === "ok") return { status: "ok", result: data.result as StoredComparison };
  return { status: "unavailable", reason: result.reason === "no-section" ? "no-section" : "no-prior" };
}

async function store(cik: string, accession: string, prior: string | null, row: ChangesRow): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("filing_changes").upsert(
    {
      accession,
      cik,
      prior_accession: prior,
      status: row.status,
      result: { ...(row.status === "ok" ? row.result : { reason: row.reason }), version: COMPARISON_VERSION },
      computed_at: new Date().toISOString(),
    },
    { onConflict: "accession" },
  );
  if (error) console.error(`[filing-changes] store ${accession}:`, error.message);
}

async function mainDocument(indexUrl: string): Promise<string | null> {
  return documentOfType(await fetchSecText(indexUrl), [/^10-K$/i]);
}

async function riskSection(url: string): Promise<string[] | null> {
  // A heading that shares a block with its paragraph gets its own line first.
  const section = extractRiskFactors(htmlToText(breakAfterLeadingBold(await fetchSecText(url))));
  return section ? riskParagraphs(section) : null;
}

// —— The daily refresh (folded into the existing cron) ——
// Companies whose comparison has been worked out before (so someone opened
// their Filings tab): if a newer 10-K has been filed since, compare it. One
// 10-K at a time, each started only with `reserveMs` still left before the
// deadline (a time in ms), so none is cut off part way.
//
// One row per 10-K, so the API's 1,000-row ceiling covers about a thousand
// companies' worth, the longest-unchecked first.
export async function refreshFilingChanges(deadline: number, reserveMs: number): Promise<number> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("filing_changes").select("cik").order("computed_at", { ascending: true }).limit(1000);
  if (error || !data) return 0;
  let done = 0;
  for (const cik of [...new Set(data.map((r) => r.cik as string))]) {
    if (Date.now() + reserveMs > deadline) break;
    const submissions = await getSubmissions(cik);
    const latest = submissions ? latestFiling(submissions, ["10-K"]) : null;
    if (!latest || (await readFilingChanges(latest.accession)) !== "missing") continue;
    try {
      await computeFilingChanges(cik, latest.accession);
      done++;
    } catch (err) {
      console.error(`[filing-changes] refresh ${cik}:`, err instanceof Error ? err.message : err);
    }
  }
  return done;
}

// Works out and stores the comparison for one 10-K. Throws on a transient
// failure, so nothing is stored and it's tried again later.
export async function computeFilingChanges(cik: string, accession: string): Promise<void> {
  const reports = await fetchAnnualReports(cik);
  const at = reports.findIndex((r) => r.accession === accession);
  const newer = at >= 0 ? reports[at] : null;
  const older = at >= 0 ? reports[at + 1] : null;
  if (!newer || !older) {
    await store(cik, accession, null, { status: "unavailable", reason: "no-prior" });
    return;
  }

  const [newerUrl, olderUrl] = await Promise.all([mainDocument(newer.indexUrl), mainDocument(older.indexUrl)]);
  if (!newerUrl || !olderUrl) {
    await store(cik, accession, older.accession, { status: "unavailable", reason: "no-section" });
    return;
  }
  let newParas: string[] | null;
  let oldParas: string[] | null;
  try {
    [newParas, oldParas] = await Promise.all([riskSection(newerUrl), riskSection(olderUrl)]);
  } catch (err) {
    if (err instanceof NoSecDataError) {
      await store(cik, accession, older.accession, { status: "unavailable", reason: "no-section" });
      return;
    }
    throw err;
  }
  if (!newParas || !oldParas) {
    await store(cik, accession, older.accession, { status: "unavailable", reason: "no-section" });
    return;
  }

  const cmp = compareRiskFactors(oldParas, newParas);
  const changes = [...cmp.changes.filter((c) => c.kind === "changed"), ...cmp.changes.filter((c) => c.kind === "reworded")];
  await store(cik, accession, older.accession, {
    status: "ok",
    result: {
      newer: { accession: newer.accession, filed: newer.filed, url: newerUrl },
      older: { accession: older.accession, filed: older.filed, url: olderUrl },
      counts: cmp.counts,
      added: cmp.added.slice(0, KEEP_EACH).map(firstSentence),
      removed: cmp.removed.slice(0, KEEP_EACH).map(firstSentence),
      changes: changes.slice(0, KEEP_CHANGES),
    },
  });
  console.log(`[filing-changes] ${accession}: ${JSON.stringify(cmp.counts)}`);
}
