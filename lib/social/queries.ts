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

const POST_SELECT = `
  id, body, created_at, edited_at, deleted_at,
  type, ticker, ticker_snapshot, position, change_my_mind, link_url,
  author:profiles (
    id, handle, display_name, grad_year,
    school:schools ( short_name )
  )
`;

const REPLY_SELECT = `
  id, body, created_at, deleted_at, is_pushback,
  author:profiles (
    id, handle, display_name, grad_year,
    school:schools ( short_name )
  )
`;

// PostgREST returns an embedded to-one relation as an object, but its
// typed shape isn't worth fighting without a generated Database type
// (this repo has none) — read the fields defensively.
function mapAuthor(row: unknown): PostAuthor {
  const r = row as {
    id: string;
    handle: string;
    display_name: string;
    grad_year: number;
    school: { short_name: string } | null;
  };
  return {
    id: r.id,
    handle: r.handle,
    displayName: r.display_name,
    gradYear: r.grad_year,
    schoolShortName: r.school?.short_name ?? "",
  };
}

type Counts = { replyCount: number; pushbackCount: number };

function mapPostRow(row: unknown, counts: Counts): FeedPost {
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
async function getReplyCounts(supabase: SupabaseClient, postIds: string[]): Promise<Record<string, Counts>> {
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

// Newest first, per docs/phase-one.md's feed spec. No pagination in phase
// one — a flat cap is enough for the first slice.
const EMPTY_COUNTS: Counts = { replyCount: 0, pushbackCount: 0 };

export async function getFeedPosts(supabase: SupabaseClient, limit = 50): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
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

export async function getPostsByAuthor(
  supabase: SupabaseClient,
  authorId: string,
  limit = 50,
): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("author_id", authorId)
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

export async function getPostById(supabase: SupabaseClient, id: string): Promise<FeedPost | null> {
  const { data, error } = await supabase.from("posts").select(POST_SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const counts = await getReplyCounts(supabase, [(data as { id: string }).id]);
  return mapPostRow(data, counts[(data as { id: string }).id] ?? EMPTY_COUNTS);
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
    .select("id, handle, display_name, grad_year, school:schools ( short_name )")
    .eq("handle", handle)
    .maybeSingle();
  if (error || !data) return null;
  return mapAuthor(data);
}
