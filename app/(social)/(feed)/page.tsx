import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFeedPosts, mapAuthor } from "@/lib/social/queries";
import type { PostAuthor } from "@/lib/social/queries";
import { FeedClient } from "@/components/social/FeedClient";

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

const AUTHOR_SELECT = "id, handle, display_name, grad_year, avatar_url, school:schools ( short_name, color_primary )";

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Full PostAuthor shape, not just id/display_name/avatar_url — the
  // optimistic post FeedClient renders needs the same author data a real
  // fetched post would carry (handle, school badge, grad year), or the
  // instant card would visibly downgrade and then upgrade once
  // router.refresh() catches up, which is its own kind of layout jump.
  let profile: PostAuthor | null = null;
  if (user) {
    const { data } = await supabase.from("profiles").select(AUTHOR_SELECT).eq("id", user.id).maybeSingle();
    if (data) profile = mapAuthor(data);
  }

  const posts = await getFeedPosts(supabase);

  return (
    <div className="social-content-card">
      <div className="social-orientation">
        <p>Make an argument. Say what would change your mind. Let people push back.</p>
        <p>
          College students talking about markets under their real name and school. Stocks, macro,
          crypto, geopolitics, anything that moves things. Not a trading app.
        </p>
      </div>

      {user && profile ? (
        <FeedClient initialPosts={posts} author={profile} />
      ) : user ? (
        <>
          <div className="sign-in-prompt">
            Almost there — <Link href="/onboarding">finish setting up your profile</Link> to post.
          </div>
          <FeedClient initialPosts={posts} author={null} />
        </>
      ) : (
        <>
          <div className="sign-in-prompt">
            Posting and replying require a verified school email address.{" "}
            <Link href="/signup">Sign up</Link> or <Link href="/login">sign in</Link> to join in.
          </div>
          <FeedClient initialPosts={posts} author={null} />
        </>
      )}
    </div>
  );
}
