import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSpaceBySlug, getSpaceMembers, getOwnerInviteToken, getSpacePosts } from "@/lib/social/spaces";
import { SpaceFeedClient } from "@/components/social/SpaceFeedClient";
import { SpaceInvitePanel } from "@/components/social/SpaceInvitePanel";
import { SpaceManage } from "@/components/social/SpaceManage";
import { Avatar } from "@/components/social/Avatar";

// Deliberately NOT the same NEXT_PUBLIC_SITE_URL pattern
// app/api/replies/route.ts uses for notification-email links — those are
// opened from a phone or another machine entirely, so they need to point
// at the real domain regardless of where the code is running. An invite
// link is the opposite: it's meant to be copied and pasted right back
// into the same browser you're testing in, so it needs to reflect
// whatever origin actually served this request (localhost while
// developing, the real domain in production) rather than a static env
// var that's deliberately pinned to production even in .env.local.
async function getSiteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || "https://www.dispatchresearch.com";
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const supabase = await createClient();
  const space = await getSpaceBySlug(supabase, slug);
  // Never index a private Space page — same reasoning as every other
  // not-yet-public surface in this app, just permanent here rather than a
  // TODO, since a Space is never meant to become publicly indexable.
  // title explicit even in the !space branch — see
  // app/(social)/p/[id]/not-found.tsx's comment on the doubled-title bug
  // an omitted title produced live (this route has no dedicated
  // not-found.tsx of its own, so it falls through to Next's generic
  // boundary, which is exactly where that bug showed up).
  if (!space) return { title: "Space Not Found", robots: { index: false, follow: false } };
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

  const [members, posts] = await Promise.all([
    getSpaceMembers(supabase, space.id),
    getSpacePosts(supabase, space.id),
    // Fire-and-forget-ish: marks this visit as "seen" for the nav's quiet
    // unread count. Awaited alongside the rest so the request settles
    // before the response streams, but its result isn't used.
    supabase.rpc("touch_space_last_seen", { p_space_id: space.id }),
  ]);

  // The viewer's own full PostAuthor-shaped row is already in `members`
  // (they have to be a member to see this page at all) — reusing it
  // instead of a second, narrower profiles query, and it gives
  // SpaceFeedClient's optimistic post the same complete author data a
  // real fetched post would carry.
  const author = members.find((m) => m.id === user.id) ?? null;
  const inviteToken = isOwner ? await getOwnerInviteToken(supabase, space.id) : null;
  const inviteUrl = inviteToken ? `${await getSiteOrigin()}/j/${inviteToken}` : null;

  return (
    <div className="social-content-card">
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

            {isOwner && inviteUrl && <SpaceInvitePanel spaceId={space.id} inviteUrl={inviteUrl} />}

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

      <SpaceFeedClient spaceId={space.id} initialPosts={posts} author={author} viewerId={user.id} />
    </div>
  );
}
