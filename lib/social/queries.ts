import type { SupabaseClient } from "@supabase/supabase-js";
import type { TickerSnapshot } from "@/lib/analysis/tickerSnapshot";

export type PostType = "take" | "question" | "thesis" | "link";

// Hand-written row types, mapped at the query call site — same convention
// as lib/portfolio.ts and lib/competition/publicBoard.ts (this repo has no
// generated database.types.ts). Untyped SupabaseClient generic so this
// works with the request-scoped server client, the browser client, and the
// service-role client interchangeably.

export type PostAuthor = {
  id: string;
  handle: string;
  displayName: string;
  gradYear: number;
  schoolShortName: string;
  schoolColorPrimary: string | null;
  avatarUrl: string | null;
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
};

export type Reply = {
  id: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
  author: PostAuthor;
  isPushback: boolean;
};

export type ProfileDetail = PostAuthor;

export const POST_SELECT = `
  id, body, created_at, edited_at, deleted_at,
  type, ticker, ticker_snapshot, position, change_my_mind, link_url,
  space_id, promoted_from,
  author:profiles (
    id, handle, display_name, grad_year, avatar_url,
    school:schools ( short_name, color_primary )
  )
`;

const REPLY_SELECT = `
  id, body, created_at, deleted_at, is_pushback,
  author:profiles (
    id, handle, display_name, grad_year, avatar_url,
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
    grad_year: number;
    avatar_url: string | null;
    school: { short_name: string; color_primary: string | null } | null;
  };
  return {
    id: r.id,
    handle: r.handle,
    displayName: r.display_name,
    gradYear: r.grad_year,
    schoolShortName: r.school?.short_name ?? "",
    schoolColorPrimary: r.school?.color_primary ?? null,
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

// The public feed — space_id is filtered here, explicitly, rather than
// left to RLS. RLS decides who is *authorized* to read a row; a Space
// member is authorized to read their own Space's posts, so if this just
// selected everything RLS lets through, that member's own private Space
// posts would leak straight into the public feed for that member (and
// only that member — the signed-out/non-member case would look fine,
// which is exactly what makes this the easiest version of the bug to
// miss). This filter is what actually makes space_id null mean "the
// public feed."
export async function getFeedPosts(supabase: SupabaseClient, limit = 50): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .is("space_id", null)
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

export async function getProfileByHandle(
  supabase: SupabaseClient,
  handle: string,
): Promise<ProfileDetail | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, handle, display_name, grad_year, avatar_url, school:schools ( short_name, color_primary )")
    .eq("handle", handle)
    .maybeSingle();
  if (error || !data) return null;
  return mapAuthor(data);
}
