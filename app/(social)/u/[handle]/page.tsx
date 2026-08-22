import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileByHandle, getPostsByAuthor } from "@/lib/social/queries";
import { PostCard } from "@/components/social/PostCard";
import { SchoolBadge } from "@/components/social/SchoolBadge";
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

  const posts = await getPostsByAuthor(supabase, profile.id);

  return (
    <>
      <div className="profile-head">
        <div className="avatar profile-avatar">{initials(profile.displayName)}</div>
        <div>
          <div className="profile-name">{profile.displayName}</div>
          <div className="profile-badge-row">
            <SchoolBadge shortName={profile.schoolShortName} gradYear={profile.gradYear} />
          </div>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="social-empty">No posts yet.</div>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </>
  );
}
