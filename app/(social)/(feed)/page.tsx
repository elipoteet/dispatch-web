import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFeedPosts, mapAuthor } from "@/lib/social/queries";
import type { PostAuthor } from "@/lib/social/queries";
import { FeedClient } from "@/components/social/FeedClient";
import { LandingScreen } from "@/components/social/LandingScreen";
import { TICKER_PATTERN } from "@/lib/analysis/loadReport";

const TITLE = "The Dispatch";
const DESCRIPTION =
  "College students talking about markets under their real name and school. Not a trading app.";

// Dynamic now, not a static const — docs/phase-six.md section A: the
// landing screen a signed-out visitor sees here must be indexable (it's
// the page a club officer will Google), while the signed-in feed behind
// it stays noindexed, exactly as it always has (see the TODO this
// replaces). Same auth check the page component below makes; cheap and
// already cached per-request by Next, not a second round trip.
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    robots: user ? { index: false, follow: false } : { index: true },
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
}

const AUTHOR_SELECT = "id, handle, display_name, grad_year, avatar_url, school:schools ( short_name, color_primary )";

export default async function FeedPage({
  searchParams,
}: {
  // The ticker page's "Post about $SYM" button (docs/phase-five.md
  // section A) links here as /?ticker=SYM rather than duplicating the
  // composer on a second page.
  searchParams: Promise<{ ticker?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // docs/phase-six.md section A: a signed-out visitor at the site root
  // sees a sign-in screen instead of the feed. Deliberately scoped to
  // exactly this — !user, on this one page — rather than a layout- or
  // middleware-level rule, which is exactly how this becomes a blanket
  // redirect that breaks /j/[token] and every other signed-out-reachable
  // route (the brief's own explicit warning). A user mid-onboarding
  // (signed in, no profile row yet) is NOT signed out, so they still fall
  // through to the normal feed below, same as today.
  if (!user) {
    return <LandingScreen />;
  }

  const { ticker } = await searchParams;
  const initialTicker = ticker && TICKER_PATTERN.test(ticker.toUpperCase()) ? ticker.toUpperCase() : null;
  const initialComposerBody = initialTicker ? `$${initialTicker} ` : undefined;

  // Full PostAuthor shape, not just id/display_name/avatar_url — the
  // optimistic post FeedClient renders needs the same author data a real
  // fetched post would carry (handle, school badge, grad year), or the
  // instant card would visibly downgrade and then upgrade once
  // router.refresh() catches up, which is its own kind of layout jump.
  let profile: PostAuthor | null = null;
  const { data } = await supabase.from("profiles").select(AUTHOR_SELECT).eq("id", user.id).maybeSingle();
  if (data) profile = mapAuthor(data);

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

      {profile ? (
        <FeedClient initialPosts={posts} author={profile} initialComposerBody={initialComposerBody} />
      ) : (
        <>
          <div className="sign-in-prompt">
            Almost there — <Link href="/onboarding">finish setting up your profile</Link> to post.
          </div>
          <FeedClient initialPosts={posts} author={null} />
        </>
      )}
    </div>
  );
}
