// The Overview's two-sentence description: the company's own 10-K Item 1,
// summarised once by Claude and stored. Server-only.
//
// It is the one AI-written line on the Overview (phase nine, Stage 2), and the
// page labels it so. Everything here is arranged so that it can never slow a
// page down or run up a bill:
//   - generation runs in after(), once the page has already been sent;
//   - it happens once per annual report, not per visit — a new 10-K is the
//     only thing that triggers a second summary;
//   - a filing whose Item 1 can't be read, or that Claude declines, is
//     recorded as 'unavailable' so it isn't downloaded again on every visit;
//   - nothing runs at all until migration 0022 has been pasted.

import Anthropic from "@anthropic-ai/sdk";
import { createPublicClient, createServiceRoleClient } from "@/lib/supabase/service";
import { fetchFilingDocument, type FilingRef } from "@/lib/sec/client";
import { extractBusinessSection, htmlToText } from "@/lib/sec/tenK";

export const DESCRIPTION_MODEL = "claude-opus-5-5";

export type StoredDescription = {
  status: "ok" | "unavailable";
  description: string;
  sourceAccession: string;
  sourceForm: string;
  model: string | null;
  generatedAt: string;
};

// `available: false` means the table can't be read — almost always because
// migration 0022 hasn't been pasted yet. In that state nothing is generated,
// since there would be nowhere to keep the result and every visit would pay
// for a fresh summary.
export type DescriptionRead = { available: false } | { available: true; row: StoredDescription | null };

type DescriptionRowDb = {
  status: string;
  description: string;
  source_accession: string;
  source_form: string;
  model: string | null;
  generated_at: string;
};

export async function readDescription(cik: string): Promise<DescriptionRead> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("company_description")
    .select("status, description, source_accession, source_form, model, generated_at")
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
      model: row.model,
      generatedAt: row.generated_at,
    },
  };
}

// Pure, so the "when do we spend money" rule is unit-tested.
export function needsDescription(read: DescriptionRead, latestAnnual: FilingRef | null): boolean {
  if (!read.available || !latestAnnual || !latestAnnual.primaryDocument) return false;
  return !read.row || read.row.sourceAccession !== latestAnnual.accession;
}

// The text to show, or null when there is none to show yet.
export function descriptionToShow(read: DescriptionRead): StoredDescription | null {
  if (!read.available || !read.row || read.row.status !== "ok" || !read.row.description) return null;
  return read.row;
}

const SYSTEM_PROMPT = `You write the two-sentence summary at the top of a company's research page on The Dispatch, a free research site for individual investors. You are given the Business section (Item 1) of the company's latest annual report on Form 10-K.

Write exactly two plain sentences:
1. What the company does.
2. How it makes money: its main products, services, customers or business lines.

Rules:
- Use only facts stated in the text you are given. Include a figure only if it appears there.
- Write for a first-year finance student. Plain words, no jargon, no acronyms the text doesn't spell out.
- Describe, never judge. Leave out the company's own marketing words (leading, premier, innovative, world-class, pioneering and the like), and give no opinion, forecast or advice about the business or its stock.
- Refer to the company by its short name.
- Reply with the two sentences only.`;

// Longer than any Item 1 seen in testing (NVIDIA 48K characters, JPMorgan 39K,
// Costco 20K). A section past this is almost certainly a parsing error that ran
// on into the rest of the filing, so it is cut here and the cut is logged.
const MAX_SECTION_CHARS = 200_000;

// A summary outside these bounds is not two sentences of plain description.
const MIN_SUMMARY_CHARS = 40;
const MAX_SUMMARY_CHARS = 700;

// Requests already running in this process, so two visitors opening the same
// new company in the same moment don't pay for two summaries. Not a cache:
// nothing outlives the request that added it.
const inFlight = new Set<string>();

let warnedMissingKey = false;

async function store(
  cik: string,
  filing: FilingRef,
  result: { status: "ok"; description: string; model: string } | { status: "unavailable"; model: string | null },
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("company_description").upsert(
    {
      cik,
      status: result.status,
      description: result.status === "ok" ? result.description : "",
      source_accession: filing.accession,
      source_form: filing.form,
      model: result.model,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "cik" },
  );
  if (error) console.error(`[description] store(${cik}) failed:`, error.message);
}

function cleanSummary(text: string): string | null {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length < MIN_SUMMARY_CHARS || flat.length > MAX_SUMMARY_CHARS) return null;
  return flat;
}

export type SummaryResult =
  | { kind: "ok"; text: string; model: string }
  // About this filing, so it won't change on retry: recorded, and the same
  // filing isn't tried again.
  | { kind: "unavailable"; model: string | null; reason: string }
  // Might work next time: nothing is recorded. `pause` means the problem is
  // with the account, not the filing (a key without credit, a revoked key).
  | { kind: "transient"; reason: string; pause?: boolean };

// After an account-level API error, stop trying for a while. Every attempt
// starts by downloading a 2–13MB filing, so a key with no credit would
// otherwise cost a download per visit while achieving nothing. Per process
// only, which is enough to keep the waste small.
const PAUSE_AFTER_ACCOUNT_ERROR_MS = 60 * 60 * 1000;
let pausedUntil = 0;

// The Claude call on its own, separate from downloading and storing, so it can
// be exercised against a real filing without a database to write to.
export async function summarizeBusinessSection(companyName: string, sectionIn: string): Promise<SummaryResult> {
  let section = sectionIn;
  if (section.length > MAX_SECTION_CHARS) {
    console.warn(`[description] ${companyName}: Item 1 is ${section.length} characters; using the first ${MAX_SECTION_CHARS}`);
    section = section.slice(0, MAX_SECTION_CHARS);
  }

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.create({
      model: DESCRIPTION_MODEL,
      max_tokens: 16000,
      // A short, factual summary: low effort is plenty.
      output_config: { effort: "low" },
      // If the model declines, Anthropic re-runs the request on its
      // recommended fallback model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `<company>${companyName}</company>\n<item_1>\n${section}\n</item_1>`,
        },
      ],
    });
  } catch (err) {
    if (
      err instanceof Anthropic.RateLimitError ||
      err instanceof Anthropic.InternalServerError ||
      err instanceof Anthropic.APIConnectionError
    ) {
      return { kind: "transient", reason: `transient API error: ${err.message}` };
    }
    if (err instanceof Anthropic.APIError) {
      // A 400 or 401 here is about the account or the request, never about
      // the filing: the first one hit in testing was "credit balance is too
      // low". Recording it against the filing would mean that company never
      // got a summary even after the account was fixed, so record nothing
      // and pause instead.
      return { kind: "transient", reason: `API error ${err.status}: ${err.message}`, pause: true };
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    return { kind: "unavailable", model: response.model, reason: `declined (${response.stop_details?.category ?? "no category"})` };
  }
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join(" ");
  const summary = cleanSummary(text);
  if (!summary) return { kind: "unavailable", model: response.model, reason: "summary failed the shape check" };
  return { kind: "ok", text: summary, model: response.model };
}

// Runs inside after(): never throws, never blocks a page.
export async function generateDescription(cik: string, companyName: string, filing: FilingRef): Promise<void> {
  if (inFlight.has(cik) || Date.now() < pausedUntil) return;
  if (!process.env.ANTHROPIC_API_KEY) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn("[description] ANTHROPIC_API_KEY is not set — company descriptions are not being generated.");
    }
    return;
  }
  inFlight.add(cik);
  try {
    let section: string | null;
    try {
      section = extractBusinessSection(htmlToText(await fetchFilingDocument(cik, filing)));
    } catch (err) {
      // The SEC being unreachable is transient: record nothing, try next visit.
      console.error(`[description] ${cik}: could not download ${filing.accession}:`, err instanceof Error ? err.message : err);
      return;
    }
    if (!section) {
      console.log(`[description] ${cik}: no readable Item 1 in ${filing.accession}; marked unavailable`);
      await store(cik, filing, { status: "unavailable", model: null });
      return;
    }
    const result = await summarizeBusinessSection(companyName, section);
    if (result.kind === "transient") {
      // Record nothing, so a later visit tries again.
      console.error(`[description] ${cik}: ${result.reason}`);
      if (result.pause) {
        pausedUntil = Date.now() + PAUSE_AFTER_ACCOUNT_ERROR_MS;
        console.error("[description] pausing description generation for an hour after an account-level API error");
      }
      return;
    }
    if (result.kind === "unavailable") {
      console.log(`[description] ${cik}: ${result.reason}; marked unavailable`);
      await store(cik, filing, { status: "unavailable", model: result.model });
      return;
    }
    await store(cik, filing, { status: "ok", description: result.text, model: result.model });
    console.log(`[description] ${cik}: stored a summary of ${filing.form} ${filing.accession} (${result.model})`);
  } catch (err) {
    console.error(`[description] ${cik}: unexpected failure:`, err instanceof Error ? err.message : err);
  } finally {
    inFlight.delete(cik);
  }
}
