import type { SupabaseClient } from "@supabase/supabase-js";
import type { TickerSnapshot } from "@/lib/analysis/tickerSnapshot";

export type PostType = "take" | "question" | "thesis" | "link";

// Hand-written row types, mapped at the query call site — same convention
// as lib/portfolio.ts and lib/competition/publicBoard.ts (this repo has no
// generated database.types.ts). Untyped SupabaseClient generic so this
// works with the request-scoped server client, the browser client, and the
// service-role client interchangeably.

// "system" is the one Dispatch AI account (docs/phase-seven.md) — never
// self-granted, same as faculty/mentor; created once via a service-role
// script, not through signup.
export type VerifiedRole = "student" | "faculty" | "mentor" | "system";

export type PostAuthor = {
  id: string;
  handle: string;
  displayName: string;
  // Nullable now (supabase/migrations/0014_roles.sql) — a mentor has
  // neither a school nor a class year. Named verifiedRole, not role: a
  // Space member row already has its own unrelated `role` field
  // ("owner" | "member" — see lib/social/spaces.ts's SpaceMember), and
  // PostAuthor & { role: "owner" | "member" } would otherwise collapse
  // that key to an unconstructible intersection.
  gradYear: number | null;
  schoolShortName: string | null;
  schoolColorPrimary: string | null;
  avatarUrl: string | null;
  verifiedRole: VerifiedRole;
  affiliation: string | null;
};

export type FeedPost = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  author: PostAuthor;
  replyCount: number;
  pushbackCount: number;
  type: PostType;
  ticker: string | null;
  tickerSnapshot: TickerSnapshot | null;
  position: "owns" | "none" | null;
  changeMyMind: string | null;
  linkUrl: string | null;
  // null = the public feed — see 0011_spaces.sql's comment on this column,
  // "the single most important column in the schema now."
  spaceId: string | null;
  // Set only on the public copy a promotion creates — points back at the
  // Space post it came from.
  promotedFrom: string | null;
  // The reverse direction: for a Space post, the id of the public post it
  // was promoted to, if any. Not a column — derived by a batched lookup
  // (getPromotedToIds) the same way replyCount/pushbackCount are, per
  // phase-three.md's explicit "do not denormalise this onto the space
  // post" instruction.
  promotedToId: string | null;
  // docs/phase-seven.md — Dispatch AI. generated is what excludes a post
  // from every count the bot itself makes (the self-reference-loop
  // warning) and drives .post--bot styling; the other three are only
  // ever set when generated is true. generatedStats is only used by the
  // "ticker moved" template's stat-tile block.
  generated: boolean;
  generatedTemplate: GeneratedTemplate | null;
  generatedRefPostId: string | null;
  generatedStats: { label: string; value: string }[] | null;
};

export type GeneratedTemplate = "ticker_moved" | "unanswered" | "first_mention" | "promotion_flow" | "busiest_beat";

export type Reply = {
  id: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
  author: PostAuthor;
  isPushback: boolean;
};

// Wider than PostAuthor deliberately — linkedinUrl/displayNameChangedAt
// only matter on the profile page itself, not on every post/reply author
// blob (feed cards, replies, etc.), so neither is threaded through
// PostAuthor/mapAuthor at all. See supabase/migrations/0013_profile_linkedin.sql
// and 0015_display_name_cooldown.sql.
export type ProfileDetail = PostAuthor & { linkedinUrl: string | null; displayNameChangedAt: string | null };

export const POST_SELECT = `
  id, body, created_at, edited_at, deleted_at,
  type, ticker, ticker_snapshot, position, change_my_mind, link_url,
  space_id, promoted_from,
  generated, generated_template, generated_ref_post_id, generated_stats,
  author:profiles (
    id, handle, display_name, grad_year, avatar_url, role, affiliation,
    school:schools ( short_name, color_primary )
  )
`;

const REPLY_SELECT = `
  id, body, created_at, deleted_at, is_pushback,
  author:profiles (
    id, handle, display_name, grad_year, avatar_url, role, affiliation,
    school:schools ( short_name, color_primary )
  )
`;

// PostgREST returns an embedded to-one relation as an object, but its
// typed shape isn't worth fighting without a generated Database type
// (this repo has none) — read the fields defensively.
export function mapAuthor(row: unknown): PostAuthor {
  const r = row as {
    id: string;
    handle: string;
    display_name: string;
    grad_year: number | null;
    avatar_url: string | null;
    role: VerifiedRole;
    affiliation: string | null;
    school: { short_name: string; color_primary: string | null } | null;
  };
  return {
    id: r.id,
    handle: r.handle,
    displayName: r.display_name,
    gradYear: r.grad_year,
    schoolShortName: r.school?.short_name ?? null,
    schoolColorPrimary: r.school?.color_primary ?? null,
    verifiedRole: r.role ?? "student",
    affiliation: r.affiliation ?? null,
    avatarUrl: r.avatar_url,
  };
}

type Counts = { replyCount: number; pushbackCount: number };

export function mapPostRow(row: unknown, counts: Counts, promotedToId: string | null = null): FeedPost {
  const r = row as {
    id: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
    author: unknown;
    type: PostType;
    ticker: string | null;
    ticker_snapshot: TickerSnapshot | null;
    position: "owns" | "none" | null;
    change_my_mind: string | null;
    link_url: string | null;
    space_id: string | null;
    promoted_from: string | null;
    generated: boolean;
    generated_template: GeneratedTemplate | null;
    generated_ref_post_id: string | null;
    generated_stats: { label: string; value: string }[] | null;
  };
  return {
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    deletedAt: r.deleted_at,
    author: mapAuthor(r.author),
    replyCount: counts.replyCount,
    pushbackCount: counts.pushbackCount,
    type: r.type,
    ticker: r.ticker,
    tickerSnapshot: r.ticker_snapshot,
    position: r.position,
    changeMyMind: r.change_my_mind,
    linkUrl: r.link_url,
    spaceId: r.space_id,
    promotedFrom: r.promoted_from,
    promotedToId,
    generated: r.generated,
    generatedTemplate: r.generated_template,
    generatedRefPostId: r.generated_ref_post_id,
    generatedStats: r.generated_stats,
  };
}

function mapReplyRow(row: unknown): Reply {
  const r = row as {
    id: string;
    body: string;
    created_at: string;
    deleted_at: string | null;
    author: unknown;
    is_pushback: boolean;
  };
  return {
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    deletedAt: r.deleted_at,
    author: mapAuthor(r.author),
    isPushback: r.is_pushback,
  };
}

// Reply and pushback counts per post, deleted or not — a deleted reply
// still rendering as a small tombstone in the thread (same soft-delete
// spirit as posts), so it still counts toward "how many replies this post
// has." Counted separately per docs/phase-two.md: "Both counts are
// public."
export async function getReplyCounts(supabase: SupabaseClient, postIds: string[]): Promise<Record<string, Counts>> {
  if (postIds.length === 0) return {};
  const { data, error } = await supabase
    .from("replies")
    .select("post_id, is_pushback")
    .in("post_id", postIds);
  if (error || !data) return {};
  const counts: Record<string, Counts> = {};
  for (const row of data as { post_id: string; is_pushback: boolean }[]) {
    const existing = counts[row.post_id] ?? { replyCount: 0, pushbackCount: 0 };
    if (row.is_pushback) existing.pushbackCount += 1;
    else existing.replyCount += 1;
    counts[row.post_id] = existing;
  }
  return counts;
}

// Reverse lookup for promotion's "published" marker — phase-three.md is
// explicit that whether a Space post has been published is derived by
// checking for a public post whose promoted_from points at it, never
// denormalised onto the Space post itself. Batched the same way
// getReplyCounts is, rather than one query per post.
export async function getPromotedToIds(
  supabase: SupabaseClient,
  postIds: string[],
): Promise<Record<string, string>> {
  if (postIds.length === 0) return {};
  const { data, error } = await supabase.from("posts").select("id, promoted_from").in("promoted_from", postIds);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const row of data as { id: string; promoted_from: string }[]) {
    map[row.promoted_from] = row.id;
  }
  return map;
}

// Newest first, per docs/phase-one.md's feed spec. No pagination in phase
// one — a flat cap is enough for the first slice.
export const EMPTY_COUNTS: Counts = { replyCount: 0, pushbackCount: 0 };

// A deleted post still renders as a tombstone ("This post was deleted" —
// PostCard.tsx) that "still shows its replies," per docs/phase-one.md —
// that guarantee is unchanged, and holds forever via direct permalink
// (getPostById below has no time filter at all). This only controls how
// long the tombstone itself keeps surfacing in *list* views (the feed,
// a profile) before it's just noise — real user report: an old deleted
// post was still sitting in the feed days later. Soft-delete only ever
// sets deleted_at (PostActions.tsx's handleDelete never touches body),
// so nothing is destroyed here, this is purely a visibility cutoff.
const DELETED_POST_LIST_VISIBILITY_HOURS = 24;

// PostgREST .or() filter clause — "not deleted, or deleted less than 24h
// ago." A function (not a constant) since it has to be evaluated fresh
// per request, not once at module load.
function notDeletedOrRecentlyDeletedFilter(): string {
  const cutoffIso = new Date(Date.now() - DELETED_POST_LIST_VISIBILITY_HOURS * 60 * 60 * 1000).toISOString();
  return `deleted_at.is.null,deleted_at.gt.${cutoffIso}`;
}

// KNOWN LIMITATION, not just an unbuilt feature: this is a flat LIMIT, not
// a cursor. Once a feed/profile/Space genuinely has more than `limit`
// rows, whatever's past the cutoff isn't paginated to — it's just gone
// from what any reader can reach, silently, with no "load more" and no
// error. Fine while every surface in this app has far fewer posts than
// the cap; worth fixing for real (a created_at/id cursor, per
// docs/phase-four.md Part 2's "pagination that does not jump") before any
// single feed/Space/profile plausibly crosses it — flagging here so it's
// a known, chosen limit rather than something a club discovers the day
// their 51st post quietly stops existing for readers.
export async function getFeedPosts(supabase: SupabaseClient, limit = 50): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .is("space_id", null)
    .or(notDeletedOrRecentlyDeletedFilter())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const ids = (data as { id: string }[]).map((p) => p.id);
  const [counts, promotedToIds] = await Promise.all([getReplyCounts(supabase, ids), getPromotedToIds(supabase, ids)]);
  return (data as unknown[]).map((row) => {
    const id = (row as { id: string }).id;
    return mapPostRow(row, counts[id] ?? EMPTY_COUNTS, promotedToIds[id] ?? null);
  });
}

// A profile's public post list — same space_id filter as getFeedPosts and
// for the same reason: docs/product-spec.md describes the profile as
// showing "every public post they have written," not their Space posts.
// Same flat-limit-not-a-cursor caveat as getFeedPosts above.
export async function getPostsByAuthor(
  supabase: SupabaseClient,
  authorId: string,
  limit = 50,
): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("author_id", authorId)
    .is("space_id", null)
    .or(notDeletedOrRecentlyDeletedFilter())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const counts = await getReplyCounts(
    supabase,
    (data as { id: string }[]).map((p) => p.id),
  );
  return (data as unknown[]).map((row) =>
    mapPostRow(row, counts[(row as { id: string }).id] ?? EMPTY_COUNTS),
  );
}

// Deliberately no space_id filter — this backs /p/[id], which has to work
// for both public and Space posts. RLS is what actually gates access here:
// a non-member's select on a Space post comes back as zero rows, so this
// returns null and the page's own notFound() fires naturally, no special
// casing needed in the page itself.
export async function getPostById(supabase: SupabaseClient, id: string): Promise<FeedPost | null> {
  const { data, error } = await supabase.from("posts").select(POST_SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const postId = (data as { id: string }).id;
  const [counts, promotedToIds] = await Promise.all([
    getReplyCounts(supabase, [postId]),
    getPromotedToIds(supabase, [postId]),
  ]);
  return mapPostRow(data, counts[postId] ?? EMPTY_COUNTS, promotedToIds[postId] ?? null);
}

// Chronological (oldest first) — flat, one level, per docs/phase-one.md.
export async function getReplies(supabase: SupabaseClient, postId: string): Promise<Reply[]> {
  const { data, error } = await supabase
    .from("replies")
    .select(REPLY_SELECT)
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as unknown[]).map(mapReplyRow);
}

// Backs the ticker page's "What the network is saying" (docs/phase-five.md
// section A) — every public post whose attached ticker is this symbol OR
// whose body mentions it as a cashtag, newest first. Deliberately an OR:
// the attached-ticker column only ever holds the *first* recognized
// cashtag in a post (see cashtags.tsx's firstCashtag), so a post that
// mentions a second symbol in passing would otherwise never surface on
// that symbol's page. Same space_id filter as getFeedPosts — a club's
// internal Space chatter about a ticker isn't "what the network is
// saying" in the public sense this section means.
//
// `count: "exact"` alongside `.limit()` so "Posts" (the numbers section's
// sixth stat) reflects the true total even once a popular ticker's post
// list is capped, not just how many happen to be displayed.
export async function getPostsByTicker(
  supabase: SupabaseClient,
  symbol: string,
  limit = 50,
): Promise<{ posts: FeedPost[]; total: number }> {
  const { data, error, count } = await supabase
    .from("posts")
    .select(POST_SELECT, { count: "exact" })
    .is("space_id", null)
    // docs/phase-seven.md's "self-reference loop" warning — a generated
    // post must never count as a post about a ticker, or Dispatch AI
    // starts reporting on itself.
    .eq("generated", false)
    .or(`ticker.eq.${symbol},body.ilike.%$${symbol}%`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return { posts: [], total: 0 };

  const ids = (data as { id: string }[]).map((p) => p.id);
  const [counts, promotedToIds] = await Promise.all([getReplyCounts(supabase, ids), getPromotedToIds(supabase, ids)]);
  const posts = (data as unknown[]).map((row) => {
    const id = (row as { id: string }).id;
    return mapPostRow(row, counts[id] ?? EMPTY_COUNTS, promotedToIds[id] ?? null);
  });
  return { posts, total: count ?? posts.length };
}

export type TrendingTicker = { symbol: string; name: string | null; postCount: number };

// Backs /research's grid (docs/phase-five.md section B) — "the tickers
// people on the site are actually posting about," read entirely from the
// frozen ticker_snapshot JSON already stored on each post at publish
// time. Zero provider calls: unlike the old research desk's static grid
// (which fired a live price request per cell on every load), this counts
// rows already in Postgres. Scoped to the most recent 300 public,
// ticker-attached posts rather than the whole table, so an old ticker
// that spiked once a year ago doesn't keep occupying a grid slot forever
// — "trending" should mean recent, and this window is what makes the sort
// naturally skew toward what's current without needing a real time decay
// function.
export async function getTrendingTickers(supabase: SupabaseClient, limit = 24): Promise<TrendingTicker[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("ticker, ticker_snapshot")
    .is("space_id", null)
    // Same self-reference-loop exclusion as getPostsByTicker above.
    .eq("generated", false)
    .not("ticker", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error || !data) return [];

  const counts = new Map<string, { name: string | null; count: number }>();
  for (const row of data as { ticker: string; ticker_snapshot: TickerSnapshot | null }[]) {
    const existing = counts.get(row.ticker);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(row.ticker, { name: row.ticker_snapshot?.name ?? null, count: 1 });
    }
  }
  return Array.from(counts.entries())
    .map(([symbol, v]) => ({ symbol, name: v.name, postCount: v.count }))
    .sort((a, b) => b.postCount - a.postCount)
    .slice(0, limit);
}

// A minimal PostAuthor lookup by id, not the wider ProfileDetail
// getProfileByHandle returns (no linkedin_url/displayNameChangedAt — the
// invite modal only needs handle/display_name/avatar/badge to show who
// invited you, the same shape every other author render in this app
// already uses). Deliberately plain — profiles_select_all (0006_social.sql)
// is `using (true)`, fully public, so this needs no security-definer
// treatment even for a signed-out caller.
export async function getProfileAuthorById(supabase: SupabaseClient, id: string): Promise<PostAuthor | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, handle, display_name, grad_year, avatar_url, role, affiliation, school:schools ( short_name, color_primary )")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapAuthor(data);
}

export async function getProfileByHandle(
  supabase: SupabaseClient,
  handle: string,
): Promise<ProfileDetail | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, handle, display_name, grad_year, avatar_url, linkedin_url, role, affiliation, display_name_changed_at, school:schools ( short_name, color_primary )",
    )
    .eq("handle", handle)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as { linkedin_url: string | null; display_name_changed_at: string | null };
  return { ...mapAuthor(data), linkedinUrl: r.linkedin_url, displayNameChangedAt: r.display_name_changed_at };
}
