// Reading an earnings release for the company's own revenue outlook (phase
// nine, stage 5). Server-only.
//
// Two SEC requests per release: the filing's index page, to find the press
// release among its documents, and the press release itself. A release never
// changes once filed, so what's read is kept for good (unstable_cache with no
// expiry) and each one costs those two requests once, ever. Only the outlook
// found is kept, never the document.
//
// The key carries a version: bump it when the rules in guidance.ts change, or
// releases read under the old rules keep their old answer forever.

import { unstable_cache } from "next/cache";
import { fetchSecText, filingIndexUrl, pressReleaseUrl } from "@/lib/sec/client";
import { htmlToText } from "@/lib/sec/tenK";
import { findRevenueGuidance, type RevenueGuidance } from "@/lib/sec/guidance";

export type ReleaseReading = {
  // The press release's address, for the "from its release" link. Null when
  // the filing has no exhibit 99.1.
  url: string | null;
  candidates: RevenueGuidance[];
};

async function readReleaseRaw(cik: string, accession: string): Promise<ReleaseReading> {
  console.log(`[sec] reading earnings release ${accession}`);
  const url = pressReleaseUrl(await fetchSecText(filingIndexUrl(cik, accession)));
  if (!url) return { url: null, candidates: [] };
  return { url, candidates: findRevenueGuidance(htmlToText(await fetchSecText(url))) };
}

const cachedRelease = unstable_cache(readReleaseRaw, ["earningsRelease", "guidance-v1"], { revalidate: false });

export async function readEarningsRelease(cik: string, accession: string): Promise<ReleaseReading | null> {
  try {
    return await cachedRelease(cik, accession);
  } catch (err) {
    console.error(`[sec] earnings release ${accession}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
