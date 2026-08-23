import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFeedPosts } from "@/lib/social/queries";
import { PostCard } from "@/components/social/PostCard";
import { Composer } from "@/components/social/Composer";
import { EmptyState } from "@/components/social/EmptyState";

const TITLE = "The Dispatch";
const DESCRIPTION =
  "College students talking about markets under their real name and school. Not a trading app.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  // Phase one ships public to read but unindexed — see docs/phase-one.md.
  // TODO: once indexing is switched on for the new surface, this page
  // (and its sitemap entry — see app/sitemap.ts) needs to come back.
  robots: { index: false, follow: false },
  alternates: { canonical: "/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { id: string; display_name: string; avatar_url: string | null } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    profile = data;
  }

  const posts = await getFeedPosts(supabase);

  return (
    <>
      <div className="social-orientation">
        <p>Make an argument. Say what would change your mind. Let people push back.</p>
        <p>
          College students talking about markets under their real name and school. Stocks, macro,
          crypto, geopolitics, anything that moves things. Not a trading app.
        </p>
      </div>

      {user && profile ? (
        <Composer authorId={profile.id} authorAvatarUrl={profile.avatar_url} authorDisplayName={profile.display_name} />
      ) : user ? (
        <div className="sign-in-prompt">
          Almost there — <Link href="/onboarding">finish setting up your profile</Link> to post.
        </div>
      ) : (
        <div className="sign-in-prompt">
          Posting and replying require a verified school email address.{" "}
          <Link href="/signup">Sign up</Link> or <Link href="/login">sign in</Link> to join in.
        </div>
      )}

      {posts.length === 0 ? (
        <EmptyState
          headline="Nothing here yet."
          sub="Post an argument, not just a headline — say what you think and what would change your mind."
        />
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </>
  );
}
