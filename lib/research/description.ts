// The Overview's "In its own words" line: the opening of the company's own
// description of itself, quoted from Item 1 of its latest 10-K and stored.
// Server-only.
//
// This was going to be a two-sentence summary written by Claude. Eli decided
// on 31 October 2026 not to pay for an AI API, so it is a quote instead:
// free, straight from the source, and labelled as the company's words rather
// than ours (lib/sec/tenK.ts, ownWordsExcerpt).
//
// The only cost left is downloading the 10-K (2–13MB), so:
//   - it runs in after(), once the page has already been sent;
//   - it happens once per annual report, not per visit: a new 10-K is the only
//     thing that triggers a second read;
//   - a filing whose Item 1 can't be read is recorded as 'unavailable', so it
//     isn't downloaded again on every visit;
//   - nothing runs at all if the table from migration 0022 can't be read.

import { createPublicClient, createServiceRoleClient } from "@/lib/supabase/service";
import { fetchFilingDocument, type FilingRef } from "@/lib/sec/client";
import { extractBusinessSection, htmlToText, ownWordsExcerpt } from "@/lib/sec/tenK";

export type StoredDescription = {
  status: "ok" | "unavailable";
  description: string;
  sourceAccession: string;
  sourceForm: string;
  generatedAt: string;
};

// `available: false` means the table can't be read. In that state nothing is
// extracted, since there would be nowhere to keep the result and every visit
// would download the filing again.
export type DescriptionRead = { available: false } | { available: true; row: StoredDescription | null };

type DescriptionRowDb = {
  status: string;
  description: string;
  source_accession: string;
  source_form: string;
  generated_at: string;
};

export async function readDescription(cik: string): Promise<DescriptionRead> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("company_description")
    .select("status, description, source_accession, source_form, generated_at")
    .eq("cik", cik)
    .maybeSingle();
  if (error) return { available: false };
  if (!data) return { available: true, row: null };
  const row = data as DescriptionRowDb;
  return {
    available: true,
    row: {
      status: row.status === "unavailable" ? "unavailable" : "ok",
      description: row.description,
      sourceAccession: row.source_accession,
      sourceForm: row.source_form,
      generatedAt: row.generated_at,
    },
  };
}

// Pure, so the "when do we download a 10-K" rule is unit-tested.
export function needsDescription(read: DescriptionRead, latestAnnual: FilingRef | null): boolean {
  if (!read.available || !latestAnnual || !latestAnnual.primaryDocument) return false;
  return !read.row || read.row.sourceAccession !== latestAnnual.accession;
}

// The quote to show, or null when there is none.
export function descriptionToShow(read: DescriptionRead): StoredDescription | null {
  if (!read.available || !read.row || read.row.status !== "ok" || !read.row.description) return null;
  return read.row;
}

// Requests already running in this process, so two visitors opening the same
// new company in the same moment don't download the filing twice. Not a
// cache: nothing outlives the request that added it.
const inFlight = new Set<string>();

async function store(cik: string, filing: FilingRef, quote: string | null): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("company_description").upsert(
    {
      cik,
      status: quote ? "ok" : "unavailable",
      description: quote ?? "",
      source_accession: filing.accession,
      source_form: filing.form,
      // The column was made for the AI model's name. No model writes these.
      model: null,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "cik" },
  );
  if (error) console.error(`[description] store(${cik}) failed:`, error.message);
}

// Runs inside after(): never throws, never blocks a page.
export async function generateDescription(cik: string, filing: FilingRef): Promise<void> {
  if (inFlight.has(cik)) return;
  inFlight.add(cik);
  try {
    let html: string;
    try {
      html = await fetchFilingDocument(cik, filing);
    } catch (err) {
      // The SEC being unreachable is transient: record nothing, try next visit.
      console.error(`[description] ${cik}: could not download ${filing.accession}:`, err instanceof Error ? err.message : err);
      return;
    }
    const section = extractBusinessSection(htmlToText(html));
    const quote = section ? ownWordsExcerpt(section) : null;
    await store(cik, filing, quote);
    console.log(
      quote
        ? `[description] ${cik}: stored the opening of ${filing.form} ${filing.accession}`
        : `[description] ${cik}: no readable description in ${filing.accession}; marked unavailable`,
    );
  } catch (err) {
    console.error(`[description] ${cik}: unexpected failure:`, err instanceof Error ? err.message : err);
  } finally {
    inFlight.delete(cik);
  }
}
