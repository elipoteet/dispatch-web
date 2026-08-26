import type { SupabaseClient } from "@supabase/supabase-js";
import {
  POST_SELECT,
  EMPTY_COUNTS,
  getReplyCounts,
  getPromotedToIds,
  mapAuthor,
  mapPostRow,
  type FeedPost,
  type PostAuthor,
} from "./queries";

// Hand-mapped row types, same convention as queries.ts — this repo has no
// generated database.types.ts.

export type SpaceSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
};

export type SpaceMember = PostAuthor & { role: "owner" | "member" };

export type SpaceNavItem = {
  id: string;
  slug: string;
  name: string;
  unreadCount: number;
};

function mapSpaceRow(row: unknown): SpaceSummary {
  const r = row as {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    owner_id: string;
    created_at: string;
  };
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    ownerId: r.owner_id,
    createdAt: r.created_at,
  };
}

// Only ever returns spaces the caller is a member of — enforced by
// spaces_select_member (0011_spaces.sql), not by this query. A signed-out
// or non-member caller just gets an empty list back, same shape either
// way.
export async function getSpaceBySlug(supabase: SupabaseClient, slug: string): Promise<SpaceSummary | null> {
  const { data, error } = await supabase
    .from("spaces")
    .select("id, slug, name, description, owner_id, created_at")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return mapSpaceRow(data);
}

// The invite token is deliberately never selected here — only the owner
// needs to see it, and that's a separate, explicit query on the Space
// page rather than something threaded through this general-purpose
// fetch.
export async function getOwnerInviteToken(supabase: SupabaseClient, spaceId: string): Promise<string | null> {
  const { data, error } = await supabase.from("spaces").select("invite_token").eq("id", spaceId).maybeSingle();
  if (error || !data) return null;
  return (data as { invite_token: string }).invite_token;
}

export async function getSpaceMembers(supabase: SupabaseClient, spaceId: string): Promise<SpaceMember[]> {
  const { data, error } = await supabase
    .from("space_members")
    .select(
      `role, profile:profiles ( id, handle, display_name, grad_year, avatar_url, role, affiliation, school:schools ( short_name, color_primary ) )`,
    )
    .eq("space_id", spaceId)
    .order("role", { ascending: true }); // 'owner' sorts before 'member'
  if (error || !data) return [];
  return (data as unknown[]).map((row) => {
    const r = row as { role: "owner" | "member"; profile: unknown };
    return { ...mapAuthor(r.profile), role: r.role };
  });
}

// The spaces a user belongs to, for the nav — each with a quiet count of
// posts made since that member's last_seen_at. Fetched as one query for
// the memberships, then one query for the qualifying posts, with the
// per-space threshold compared in application code (a single row's
// created_at against its own space's last_seen_at) rather than N separate
// per-space count queries — same batching spirit as getReplyCounts.
export async function getUserSpaces(supabase: SupabaseClient, profileId: string): Promise<SpaceNavItem[]> {
  const { data: memberships, error } = await supabase
    .from("space_members")
    .select("space_id, last_seen_at, space:spaces ( id, slug, name, deleted_at )")
    .eq("profile_id", profileId);
  if (error || !memberships) return [];

  const rows = (memberships as unknown[])
    .map((row) => {
      const r = row as {
        space_id: string;
        last_seen_at: string;
        space: { id: string; slug: string; name: string; deleted_at: string | null } | null;
      };
      return r;
    })
    .filter((r) => r.space && !r.space.deleted_at);

  if (rows.length === 0) return [];

  const spaceIds = rows.map((r) => r.space_id);
  const { data: posts } = await supabase.from("posts").select("id, space_id, created_at").in("space_id", spaceIds);

  return rows.map((r) => {
    const unreadCount = ((posts as { space_id: string; created_at: string }[]) ?? []).filter(
      (p) => p.space_id === r.space_id && p.created_at > r.last_seen_at,
    ).length;
    return {
      id: r.space!.id,
      slug: r.space!.slug,
      name: r.space!.name,
      unreadCount,
    };
  });
}

// Same flat-limit-not-a-cursor caveat as getFeedPosts/getPostsByAuthor in
// lib/social/queries.ts — a Space with more than `limit` posts silently
// loses whatever's past the cutoff, not paginates to it.
export async function getSpacePosts(supabase: SupabaseClient, spaceId: string, limit = 50): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("space_id", spaceId)
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
