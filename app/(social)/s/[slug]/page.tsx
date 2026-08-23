import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSpaceBySlug, getSpaceMembers, getOwnerInviteToken, getSpacePosts } from "@/lib/social/spaces";
import { PostCard } from "@/components/social/PostCard";
import { SpaceComposer } from "@/components/social/SpaceComposer";
import { SpaceInvitePanel } from "@/components/social/SpaceInvitePanel";
import { SpaceManage } from "@/components/social/SpaceManage";
import { PromoteAction } from "@/components/social/PromoteAction";
import { PromotedMarker } from "@/components/social/PromotionMarker";
import { Avatar } from "@/components/social/Avatar";
import { EmptyState } from "@/components/social/EmptyState";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dispatchresearch.com";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const supabase = await createClient();
  const space = await getSpaceBySlug(supabase, slug);
  // Never index a private Space page — same reasoning as every other
  // not-yet-public surface in this app, just permanent here rather than a
  // TODO, since a Space is never meant to become publicly indexable.
  if (!space) return { robots: { index: false, follow: false } };
  return { title: space.name, robots: { index: false, follow: false } };
}

// A non-member (or a signed-out visitor) gets exactly the same 404 a
// missing slug would — getSpaceBySlug runs through the request-scoped,
// RLS-respecting client, and spaces_select_member (0011_spaces.sql)
// returns zero rows for anyone who isn't a member. No separate "you don't
// have access" branch needed; membership and existence collapse into the
// same not-found response, which is also what avoids confirming to a
// stranger that a given slug exists at all.
export default async function SpacePage(props: Props) {
  const { slug } = await props.params;
  const supabase = await createClient();
  const space = await getSpaceBySlug(supabase, slug);
  if (!space) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const isOwner = user.id === space.ownerId;

  const [members, posts, profileResult] = await Promise.all([
    getSpaceMembers(supabase, space.id),
    getSpacePosts(supabase, space.id),
    supabase.from("profiles").select("id, display_name, avatar_url").eq("id", user.id).maybeSingle(),
    // Fire-and-forget-ish: marks this visit as "seen" for the nav's quiet
    // unread count. Awaited alongside the rest so the request settles
    // before the response streams, but its result isn't used.
    supabase.rpc("touch_space_last_seen", { p_space_id: space.id }),
  ]);

  const profile = profileResult.data as { id: string; display_name: string; avatar_url: string | null } | null;
  const inviteToken = isOwner ? await getOwnerInviteToken(supabase, space.id) : null;

  return (
    <>
      <div className="space-head">
        <div className="space-head-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1>{space.name}</h1>
            {space.description && <p className="space-head-desc">{space.description}</p>}
            <div className="space-head-meta">
              <span className="space-lock-chip">Private · members only</span>
              <div className="space-avatar-stack">
                {members.slice(0, 8).map((m) => (
                  <Avatar key={m.id} avatarUrl={m.avatarUrl} displayName={m.displayName} className="avatar--sm" />
                ))}
              </div>
              <span className="space-member-chip">
                {members.length} member{members.length === 1 ? "" : "s"}
              </span>
              {isOwner && <span className="space-owner-chip">You own this</span>}
            </div>

            {isOwner && inviteToken && (
              <SpaceInvitePanel spaceId={space.id} inviteUrl={`${SITE_URL}/j/${inviteToken}`} />
            )}

            {isOwner && (
              <SpaceManage
                spaceId={space.id}
                name={space.name}
                description={space.description}
                members={members}
                viewerId={user.id}
              />
            )}
          </div>
        </div>
      </div>

      {profile && (
        <SpaceComposer
          spaceId={space.id}
          authorId={profile.id}
          authorAvatarUrl={profile.avatar_url}
          authorDisplayName={profile.display_name}
        />
      )}

      {posts.length === 0 ? (
        <EmptyState headline="Nothing here yet." sub="Post a working note — no types, no scaffold, just the argument." />
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            actions={
              post.promotedToId ? (
                <PromotedMarker publicPostId={post.promotedToId} />
              ) : (
                <PromoteAction post={post} viewerId={user.id} />
              )
            }
          />
        ))
      )}
    </>
  );
}
