import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileByHandle, getPostsByAuthor } from "@/lib/social/queries";
import { PostCard } from "@/components/social/PostCard";
import { SchoolBadge } from "@/components/social/SchoolBadge";
import { EmptyState } from "@/components/social/EmptyState";
import { NotificationSettings } from "@/components/social/NotificationSettings";
import { initials } from "@/lib/social/avatar";

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
    return { robots: { index: false, follow: false } };
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
    <>
      <div className="profile-head">
        <div className="avatar profile-avatar">{initials(profile.displayName)}</div>
        <div>
          <div className="profile-name">{profile.displayName}</div>
          <div className="profile-handle">@{profile.handle}</div>
          <div className="profile-badge-row">
            <SchoolBadge shortName={profile.schoolShortName} gradYear={profile.gradYear} />
          </div>
        </div>
      </div>

      {isOwnProfile && notifyPrefs && <NotificationSettings profileId={profile.id} initial={notifyPrefs} />}

      {posts.length === 0 ? (
        <EmptyState headline="No posts yet." sub={`@${profile.handle} hasn't posted anything so far.`} />
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </>
  );
}
