import type { SupabaseClient } from "@supabase/supabase-js";
import { getTickerSnapshot } from "@/lib/analysis/tickerSnapshot";
import type { GeneratedTemplate } from "./queries";

// docs/phase-seven.md. Template-only, deliberately no language model —
// every sentence here is arithmetic anyone can verify against the
// database, never a ranking, a characterization, or an opinion. Kept out
// of the cron route file so it's testable/callable on its own.

export const DISPATCH_AI_HANDLE = "dispatchai";

// Easy to change, per the brief's own instruction — a bot narrating a
// four-person feed is embarrassing, so it stays silent below this many
// real (non-generated) public posts that day.
export const QUIET_DAY_FLOOR = 3;

// "Moved more than a threshold today" — the brief leaves the number
// unspecified; 5% is a plain, round, defensible "genuinely moved" bar for
// a daily check, easy to change in one place.
const MOVE_THRESHOLD_PCT = 5;

// Weekly templates (4, 5) fire once, on this fixed day — matches the
// existing digest cron's own weekly day (app/api/cron/digest/route.ts,
// "0 23 * * 0"), so the site's two weekly rhythms line up.
const WEEKLY_TEMPLATE_DAY = 0; // Sunday

export type GeneratedPostDraft = {
  body: string;
  ticker: string | null;
  generatedTemplate: GeneratedTemplate;
  generatedRefPostId: string | null;
  generatedStats: { label: string; value: string }[] | null;
};

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function getDispatchAiProfileId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("id").eq("handle", DISPATCH_AI_HANDLE).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// How many real, public posts happened today — the quiet-day floor check.
// Every query here (and in every template below) filters space_id is null
// (public only — private Spaces must never leak into a generated post,
// docs/phase-seven.md section F) and generated = false (a generated post
// must never count toward the bot's own activity — the self-reference-
// loop warning).
export async function countRealPostsToday(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .is("space_id", null)
    .eq("generated", false)
    .is("deleted_at", null)
    .gte("created_at", startOfTodayIso());
  return count ?? 0;
}

export type LastGeneratedPost = { template: GeneratedTemplate; createdAt: string };

// Backs both "at most one post per day" and "never the same template
// twice in a row."
export async function getLastGeneratedPost(supabase: SupabaseClient): Promise<LastGeneratedPost | null> {
  const { data } = await supabase
    .from("posts")
    .select("generated_template, created_at")
    .eq("generated", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { template: data.generated_template as GeneratedTemplate, createdAt: data.created_at as string };
}

function isSameCalendarDay(aIso: string, b: Date): boolean {
  const a = new Date(aIso);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ============================================================
// Template 2 — unanswered question. "The most useful of the five on a
// thin site: it converts a dead post into a reply" (docs/phase-seven.md)
// — checked first among the daily templates for exactly that reason.
// ============================================================
async function findUnanswered(supabase: SupabaseClient): Promise<GeneratedPostDraft | null> {
  const { data: candidates } = await supabase
    .from("posts")
    .select("id, body, ticker, created_at, author:profiles ( display_name )")
    .eq("type", "question")
    .eq("generated", false)
    .is("space_id", null)
    .is("deleted_at", null)
    .lt("created_at", daysAgoIso(0.5)) // ~12 hours
    .order("created_at", { ascending: true })
    .limit(20);
  if (!candidates || candidates.length === 0) return null;

  for (const post of candidates as unknown as {
    id: string;
    ticker: string | null;
    created_at: string;
    author: { display_name: string } | null;
  }[]) {
    const { count } = await supabase
      .from("replies")
      .select("id", { count: "exact", head: true })
      .eq("post_id", post.id);
    if ((count ?? 0) > 0) continue;

    const hoursAgo = Math.max(1, Math.round((Date.now() - new Date(post.created_at).getTime()) / (60 * 60 * 1000)));
    const tickerPart = post.ticker ? ` about $${post.ticker}` : "";
    const name = post.author?.display_name ?? "Someone";
    return {
      body: `${name} asked a question${tickerPart} ${hoursAgo} hours ago and nobody has replied.`,
      ticker: post.ticker,
      generatedTemplate: "unanswered",
      generatedRefPostId: post.id,
      generatedStats: null,
    };
  }
  return null;
}

// ============================================================
// Template 1 — ticker moved. Candidate list comes from today's real
// public posts (zero provider calls), then getTickerSnapshot (cached,
// Finnhub-only) checks just those candidates for the day's move — never
// a new uncached fetch, per the brief's explicit instruction.
// ============================================================
async function findTickerMoved(supabase: SupabaseClient): Promise<GeneratedPostDraft | null> {
  const { data: todaysTickerPosts } = await supabase
    .from("posts")
    .select("ticker")
    .is("space_id", null)
    .eq("generated", false)
    .is("deleted_at", null)
    .not("ticker", "is", null)
    .gte("created_at", startOfTodayIso());
  if (!todaysTickerPosts || todaysTickerPosts.length === 0) return null;

  const candidateTickers = Array.from(new Set((todaysTickerPosts as { ticker: string }[]).map((p) => p.ticker)));

  for (const ticker of candidateTickers) {
    const snapshot = await getTickerSnapshot(ticker);
    if (!snapshot || Math.abs(snapshot.dayChangePct) < MOVE_THRESHOLD_PCT) continue;

    const { data: weekPosts } = await supabase
      .from("posts")
      .select("type, author_id")
      .is("space_id", null)
      .eq("generated", false)
      .is("deleted_at", null)
      .eq("ticker", ticker)
      .gte("created_at", daysAgoIso(7));
    const rows = (weekPosts ?? []) as { type: string; author_id: string }[];
    const distinctAuthors = new Set(rows.map((r) => r.author_id)).size;
    const thesesOpen = rows.filter((r) => r.type === "thesis").length;

    const pctStr = `${snapshot.dayChangePct >= 0 ? "+" : ""}${snapshot.dayChangePct.toFixed(2)}%`;
    const peopleWord = distinctAuthors === 1 ? "person" : "people";

    return {
      body: `$${ticker} closed ${snapshot.dayChangePct >= 0 ? "up" : "down"} ${Math.abs(snapshot.dayChangePct).toFixed(2)}% today. ${distinctAuthors} ${peopleWord} here ${distinctAuthors === 1 ? "has" : "have"} posted about it this week.`,
      ticker,
      generatedTemplate: "ticker_moved",
      generatedRefPostId: null,
      generatedStats: [
        { label: "Today", value: pctStr },
        { label: "Posts this week", value: String(distinctAuthors) },
        { label: "Theses open", value: String(thesesOpen) },
      ],
    };
  }
  return null;
}

// ============================================================
// Template 3 — first mention. A ticker that has never appeared on a
// real, public post before today.
// ============================================================
async function findFirstMention(supabase: SupabaseClient): Promise<GeneratedPostDraft | null> {
  const { data: todaysFirsts } = await supabase
    .from("posts")
    .select("id, ticker, created_at")
    .is("space_id", null)
    .eq("generated", false)
    .is("deleted_at", null)
    .not("ticker", "is", null)
    .gte("created_at", startOfTodayIso())
    .order("created_at", { ascending: true });
  if (!todaysFirsts || todaysFirsts.length === 0) return null;

  for (const post of todaysFirsts as { id: string; ticker: string; created_at: string }[]) {
    const { count } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .is("space_id", null)
      .eq("generated", false)
      .is("deleted_at", null)
      .eq("ticker", post.ticker)
      .lt("created_at", post.created_at);
    if ((count ?? 0) === 0) {
      return {
        body: `First post about $${post.ticker} on Dispatch Social.`,
        ticker: post.ticker,
        generatedTemplate: "first_mention",
        generatedRefPostId: post.id,
        generatedStats: null,
      };
    }
  }
  return null;
}

// ============================================================
// Template 4 — promotion flow (weekly). Never names a space, per the
// existing promotion rule (docs/phase-three.md) — only that promotion
// happened, and how many, never what or from where.
// ============================================================
async function findPromotionFlow(supabase: SupabaseClient): Promise<GeneratedPostDraft | null> {
  const { data } = await supabase
    .from("posts")
    .select("type")
    .is("space_id", null)
    .not("promoted_from", "is", null)
    .eq("generated", false)
    .is("deleted_at", null)
    .gte("created_at", daysAgoIso(7));
  const rows = (data ?? []) as { type: string }[];
  if (rows.length === 0) return null;

  const theses = rows.filter((r) => r.type === "thesis").length;
  const postWord = rows.length === 1 ? "post came" : "posts came";
  let thesisLine = "";
  if (theses > 0) {
    thesisLine = ` ${theses === 1 ? "One was a thesis" : `${theses} were theses`}.`;
  }
  return {
    body: `${rows.length} ${postWord} out of spaces and into the feed this week.${thesisLine}`,
    ticker: null,
    generatedTemplate: "promotion_flow",
    generatedRefPostId: null,
    generatedStats: null,
  };
}

// ============================================================
// Template 5 — busiest beat (weekly). "Beat" here means the ticker with
// the most posts this week, since that's the closest concept the schema
// actually has — this app has no separate beat/topic column.
// ============================================================
async function findBusiestBeat(supabase: SupabaseClient): Promise<GeneratedPostDraft | null> {
  const { data } = await supabase
    .from("posts")
    .select("ticker")
    .is("space_id", null)
    .eq("generated", false)
    .is("deleted_at", null)
    .not("ticker", "is", null)
    .gte("created_at", daysAgoIso(7));
  const rows = (data ?? []) as { ticker: string }[];
  if (rows.length === 0) return null;

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.ticker, (counts.get(r.ticker) ?? 0) + 1);
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const [topTicker, topCount] = sorted[0];
  const others = sorted.slice(1, 3).map(([t]) => `$${t}`);
  const tickerList = [`$${topTicker}`, ...others].join(", ");

  return {
    body: `$${topTicker} was the most-posted ticker this week: ${topCount} ${topCount === 1 ? "post" : "posts"} across ${tickerList}.`,
    ticker: topTicker,
    generatedTemplate: "busiest_beat",
    generatedRefPostId: null,
    generatedStats: null,
  };
}

// ============================================================
// Orchestration — priority order when multiple templates are eligible
// (only one post per day, total). On the weekly day, the weekly
// templates go first (rarer, only-available-that-day content); daily
// templates otherwise, unanswered first per the brief's own "most useful
// of the five" note. Skips a candidate that would repeat the immediately
// prior generated post's template.
// ============================================================
export async function generateDispatchAiDraft(supabase: SupabaseClient): Promise<GeneratedPostDraft | null> {
  const now = new Date();

  const last = await getLastGeneratedPost(supabase);
  if (last && isSameCalendarDay(last.createdAt, now)) return null; // at most one per day

  const realPostsToday = await countRealPostsToday(supabase);
  if (realPostsToday < QUIET_DAY_FLOOR) return null; // silence is the default on a quiet day

  const finders: ((s: SupabaseClient) => Promise<GeneratedPostDraft | null>)[] =
    now.getDay() === WEEKLY_TEMPLATE_DAY
      ? [findBusiestBeat, findPromotionFlow, findUnanswered, findTickerMoved, findFirstMention]
      : [findUnanswered, findTickerMoved, findFirstMention];

  for (const find of finders) {
    const draft = await find(supabase);
    if (draft && draft.generatedTemplate !== last?.template) {
      return draft;
    }
  }
  return null;
}
