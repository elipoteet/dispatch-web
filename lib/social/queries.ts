import type { SupabaseClient } from "@supabase/supabase-js";

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
};

export type Reply = {
  id: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
  author: PostAuthor;
};

export type ProfileDetail = PostAuthor;

const POST_SELECT = `
  id, body, created_at, edited_at, deleted_at,
  author:profiles (
    id, handle, display_name, grad_year,
    school:schools ( short_name )
  )
`;

const REPLY_SELECT = `
  id, body, created_at, deleted_at,
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

function mapPostRow(row: unknown, replyCount: number): FeedPost {
  const r = row as {
    id: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
    author: unknown;
  };
  return {
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    editedAt: r.edited_at,
    deletedAt: r.deleted_at,
    author: mapAuthor(r.author),
    replyCount,
  };
}

function mapReplyRow(row: unknown): Reply {
  const r = row as {
    id: string;
    body: string;
    created_at: string;
    deleted_at: string | null;
    author: unknown;
  };
  return {
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    deletedAt: r.deleted_at,
    author: mapAuthor(r.author),
  };
}

// Total reply count per post, deleted or not — a deleted reply still
// rendering as a small tombstone in the thread (same soft-delete spirit
// as posts), so it still counts toward "how many replies this post has."
async function getReplyCounts(
  supabase: SupabaseClient,
  postIds: string[],
): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};
  const { data, error } = await supabase.from("replies").select("post_id").in("post_id", postIds);
  if (error || !data) return {};
  const counts: Record<string, number> = {};
  for (const row of data as { post_id: string }[]) {
    counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
  }
  return counts;
}

// Newest first, per docs/phase-one.md's feed spec. No pagination in phase
// one — a flat cap is enough for the first slice.
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
  return (data as unknown[]).map((row) => mapPostRow(row, counts[(row as { id: string }).id] ?? 0));
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
  return (data as unknown[]).map((row) => mapPostRow(row, counts[(row as { id: string }).id] ?? 0));
}

export async function getPostById(supabase: SupabaseClient, id: string): Promise<FeedPost | null> {
  const { data, error } = await supabase.from("posts").select(POST_SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const counts = await getReplyCounts(supabase, [(data as { id: string }).id]);
  return mapPostRow(data, counts[(data as { id: string }).id] ?? 0);
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
