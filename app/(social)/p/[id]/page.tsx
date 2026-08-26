import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPostById, getReplies, mapAuthor } from "@/lib/social/queries";
import type { PostAuthor } from "@/lib/social/queries";
import { PostDetailClient } from "@/components/social/PostDetailClient";
import { ReplyListClient } from "@/components/social/ReplyListClient";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params;
  const supabase = await createClient();
  const post = await getPostById(supabase, id);

  if (!post) {
    // Set noindex explicitly rather than relying on notFound()'s automatic
    // injection — see not-found.tsx's comment and gotcha #2 in
    // docs/claude-project-context.md.
    return { robots: { index: false, follow: false } };
  }

  const snippet = post.deletedAt ? "Deleted post" : post.body.slice(0, 60);
  return {
    title: snippet,
    robots: { index: false, follow: false },
    alternates: { canonical: `/p/${id}` },
  };
}

const AUTHOR_SELECT =
  "id, handle, display_name, grad_year, avatar_url, role, affiliation, school:schools ( short_name, color_primary )";

export default async function PostDetailPage(props: Props) {
  const { id } = await props.params;
  const supabase = await createClient();

  const post = await getPostById(supabase, id);
  if (!post) notFound();

  const [
    {
      data: { user },
    },
    replies,
  ] = await Promise.all([supabase.auth.getUser(), getReplies(supabase, id)]);

  // Full PostAuthor shape — see app/(social)/page.tsx's identical comment;
  // ReplyListClient's optimistic reply needs the same complete author data
  // a real fetched reply carries.
  let profile: PostAuthor | null = null;
  if (user) {
    const { data } = await supabase.from("profiles").select(AUTHOR_SELECT).eq("id", user.id).maybeSingle();
    if (data) profile = mapAuthor(data);
  }

  return (
    <div className="social-content-card">
      <PostDetailClient initialPost={post} viewerId={user?.id} />

      {user && !profile && (
        <div className="sign-in-prompt">
          Almost there — <Link href="/onboarding">finish setting up your profile</Link> to reply.
        </div>
      )}
      {!user && (
        <div className="sign-in-prompt">
          Replying and pushing back require a verified school email address.{" "}
          <Link href="/signup">Sign up</Link> or <Link href="/login">sign in</Link> to join in.
        </div>
      )}

      <ReplyListClient postId={post.id} initialReplies={replies} author={profile} viewerId={user?.id} />
    </div>
  );
}
