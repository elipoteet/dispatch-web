"use client";

import { Composer } from "./Composer";
import { PostCard } from "./PostCard";
import { PostActions } from "./PostActions";
import { EmptyState } from "./EmptyState";
import { useOptimisticFeed } from "@/lib/social/useOptimisticFeed";
import type { FeedPost, PostAuthor } from "@/lib/social/queries";

// Owns the feed's optimistic post list — the composer and the list have
// to share this one useOptimistic instance (a post the composer adds
// optimistically needs to render in the same list right below it), which
// is why this exists as its own client component rather than the two
// living as separate children of the server-rendered feed page the way
// they did before phase four.
export function FeedClient({
  initialPosts,
  author,
  initialComposerBody,
}: {
  initialPosts: FeedPost[];
  author: PostAuthor | null;
  initialComposerBody?: string;
}) {
  const [posts, dispatch] = useOptimisticFeed(initialPosts);
  const viewerId = author?.id ?? null;

  return (
    <>
      {author && (
        <Composer
          author={author}
          onOptimisticPost={(post) => dispatch({ type: "add", post })}
          initialBody={initialComposerBody}
        />
      )}
      {posts.length === 0 ? (
        <EmptyState
          headline="Nothing here yet."
          sub="Post an argument, not just a headline — say what you think and what would change your mind."
        />
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            actions={
              // An optimistic post has no real id yet — nothing to edit/
              // delete until router.refresh() lands the real row.
              post.id.startsWith("optimistic-") ? undefined : (
                <PostActions
                  postId={post.id}
                  authorId={post.author.id}
                  viewerId={viewerId}
                  body={post.body}
                  createdAt={post.createdAt}
                  deletedAt={post.deletedAt}
                  onOptimisticUpdate={(patch) => dispatch({ type: "update", id: post.id, patch })}
                />
              )
            }
          />
        ))
      )}
    </>
  );
}
