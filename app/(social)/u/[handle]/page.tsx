import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileByHandle, getPostsByAuthor } from "@/lib/social/queries";
import { PostCard } from "@/components/social/PostCard";
import { IdentityBadge } from "@/components/social/IdentityBadge";
import { EmptyState } from "@/components/social/EmptyState";
import { NotificationSettings } from "@/components/social/NotificationSettings";
import { AvatarUpload } from "@/components/social/AvatarUpload";
import { Avatar } from "@/components/social/Avatar";
import { LinkedInField } from "@/components/social/LinkedInField";
import { DisplayNameField } from "@/components/social/DisplayNameField";

// Public URL is /@handle — see next.config.ts's rewrite. A literal
// app/@[handle]/ folder isn't possible in the App Router (@folder is the
// parallel-routes slot convention, not a URL segment), so the real page
// lives here at /u/[handle] instead. Canonical below still points at the
// public /@handle form, since rewrites are transparent to the browser URL.
type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { handle } = await props.params;
  const supabase = await createClient();
  const profile = await getProfileByHandle(supabase, handle.toLowerCase());

  if (!profile) {
    // title explicit — same doubled-title reasoning as not-found.tsx's
    // own comment for this segment.
    return { title: "Profile Not Found", robots: { index: false, follow: false } };
  }
  return {
    title: `${profile.displayName} (@${profile.handle})`,
    robots: { index: false, follow: false },
    alternates: { canonical: `/@${profile.handle}` },
  };
}

export default async function ProfilePage(props: Props) {
  const { handle } = await props.params;
  const supabase = await createClient();
  const profile = await getProfileByHandle(supabase, handle.toLowerCase());
  if (!profile) notFound();

  const [posts, userResult] = await Promise.all([
    getPostsByAuthor(supabase, profile.id),
    supabase.auth.getUser(),
  ]);
  const isOwnProfile = userResult.data.user?.id === profile.id;

  let notifyPrefs: { notifyReplies: boolean; notifyPushback: boolean; notifyDigest: boolean } | null = null;
  if (isOwnProfile) {
    const { data } = await supabase
      .from("profiles")
      .select("notify_replies, notify_pushback, notify_digest")
      .eq("id", profile.id)
      .maybeSingle();
    if (data) {
      notifyPrefs = {
        notifyReplies: data.notify_replies,
        notifyPushback: data.notify_pushback,
        notifyDigest: data.notify_digest,
      };
    }
  }

  return (
    <div className="social-content-card">
      <div className="profile-head">
        {isOwnProfile ? (
          <AvatarUpload profileId={profile.id} displayName={profile.displayName} avatarUrl={profile.avatarUrl} />
        ) : (
          <Avatar
            avatarUrl={profile.avatarUrl}
            displayName={profile.displayName}
            verifiedRole={profile.verifiedRole}
            className="profile-avatar"
          />
        )}
        <div className="profile-head-info">
          <DisplayNameField
            profileId={profile.id}
            displayName={profile.displayName}
            displayNameChangedAt={profile.displayNameChangedAt}
            isOwnProfile={isOwnProfile}
          />
          <div className="profile-handle">@{profile.handle}</div>
          <div className="profile-badge-row">
            <IdentityBadge subject={profile} size={16} />
          </div>
          {/* The profile's shareable URL, spelled out — product-spec.md
              calls this out explicitly ("a shareable URL at
              dispatchresearch.com/@handle") as part of what makes a
              profile valuable outside the app, not just inside it. Plain
              text, not a link to itself. */}
          <div className="profile-url-chip">dispatchresearch.com/@{profile.handle}</div>
          <LinkedInField profileId={profile.id} linkedinUrl={profile.linkedinUrl} isOwnProfile={isOwnProfile} />
        </div>
      </div>

      {/* docs/phase-seven.md section A, verbatim. */}
      {profile.verifiedRole === "system" && (
        <p className="profile-bot-note">
          An automated account. It posts counts and moves, never opinions, and never replies.
        </p>
      )}

      {isOwnProfile && notifyPrefs && <NotificationSettings profileId={profile.id} initial={notifyPrefs} />}

      {posts.length === 0 ? (
        <EmptyState headline="No posts yet." sub={`@${profile.handle} hasn't posted anything so far.`} />
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </div>
  );
}
