import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPostById, getReplies } from "@/lib/social/queries";
import { PostCard } from "@/components/social/PostCard";
import { PostActions } from "@/components/social/PostActions";
import { PromoteAction } from "@/components/social/PromoteAction";
import { PromotedMarker } from "@/components/social/PromotionMarker";
import { ReplyItem } from "@/components/social/ReplyItem";
import { ReplyActions } from "@/components/social/ReplyActions";
import { ReplyBox } from "@/components/social/ReplyBox";
import { EmptyState } from "@/components/social/EmptyState";

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

  let profile: { id: string; display_name: string; avatar_url: string | null } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    profile = data;
  }

  return (
    <>
      <PostCard
        post={post}
        actions={
          <>
            {post.spaceId && post.promotedToId && <PromotedMarker publicPostId={post.promotedToId} />}
            {post.spaceId && !post.promotedToId && <PromoteAction post={post} viewerId={user?.id} />}
            <PostActions
              postId={post.id}
              authorId={post.author.id}
              viewerId={user?.id}
              body={post.body}
              createdAt={post.createdAt}
              deletedAt={post.deletedAt}
            />
          </>
        }
      />

      {user && profile ? (
        <ReplyBox postId={post.id} authorAvatarUrl={profile.avatar_url} authorDisplayName={profile.display_name} />
      ) : user ? (
        <div className="sign-in-prompt">
          Almost there — <Link href="/onboarding">finish setting up your profile</Link> to reply.
        </div>
      ) : (
        <div className="sign-in-prompt">
          Replying and pushing back require a verified school email address.{" "}
          <Link href="/signup">Sign up</Link> or <Link href="/login">sign in</Link> to join in.
        </div>
      )}

      <div className="reply-list">
        {replies.length === 0 ? (
          <EmptyState headline="No replies yet." sub="Be the first to push back." />
        ) : (
          replies.map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              actions={
                <ReplyActions
                  replyId={reply.id}
                  authorId={reply.author.id}
                  viewerId={user?.id}
                  deletedAt={reply.deletedAt}
                />
              }
            />
          ))
        )}
      </div>
    </>
  );
}
