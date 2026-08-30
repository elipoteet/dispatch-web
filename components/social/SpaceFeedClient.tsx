"use client";

import { SpaceComposer } from "./SpaceComposer";
import { PostCard } from "./PostCard";
import { PostActions } from "./PostActions";
import { PromoteAction } from "./PromoteAction";
import { PromotedMarker } from "./PromotionMarker";
import { EmptyState } from "./EmptyState";
import { useOptimisticFeed } from "@/lib/social/useOptimisticFeed";
import type { FeedPost, PostAuthor } from "@/lib/social/queries";

// Space-page equivalent of FeedClient — same useOptimisticFeed sharing
// reasoning, just SpaceComposer instead of Composer and each post's
// actions slot carries its promote state (PromoteAction/PromotedMarker)
// instead of nothing.
export function SpaceFeedClient({
  spaceId,
  initialPosts,
  author,
  viewerId,
}: {
  spaceId: string;
  initialPosts: FeedPost[];
  author: PostAuthor | null;
  viewerId: string;
}) {
  const [posts, dispatch] = useOptimisticFeed(initialPosts);

  return (
    <>
      {author && (
        <SpaceComposer
          spaceId={spaceId}
          author={author}
          onOptimisticPost={(post) => dispatch({ type: "add", post })}
        />
      )}
      {posts.length === 0 ? (
        <EmptyState headline="Nothing here yet." sub="Post a working note — no types, no scaffold, just the argument." />
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            actions={
              // An optimistic post has no real id yet — nothing to
              // promote or edit/delete until router.refresh() lands the
              // real row.
              post.id.startsWith("optimistic-") ? undefined : (
                <>
                  {post.promotedToId ? (
                    <PromotedMarker publicPostId={post.promotedToId} />
                  ) : (
                    <PromoteAction post={post} viewerId={viewerId} />
                  )}
                  <PostActions
                    postId={post.id}
                    authorId={post.author.id}
                    viewerId={viewerId}
                    body={post.body}
                    createdAt={post.createdAt}
                    deletedAt={post.deletedAt}
                    onOptimisticUpdate={(patch) => dispatch({ type: "update", id: post.id, patch })}
                  />
                </>
              )
            }
          />
        ))
      )}
    </>
  );
}
