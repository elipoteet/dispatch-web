"use client";

import { useOptimistic } from "react";
import { PostCard } from "./PostCard";
import { PostActions } from "./PostActions";
import { PromoteAction } from "./PromoteAction";
import { PromotedMarker } from "./PromotionMarker";
import type { FeedPost } from "@/lib/social/queries";

// Wraps the single post on /p/[id] in its own useOptimistic instance —
// edit/delete (PostActions) only ever happens here, one post at a time,
// never inside a list, which is why this patches a single object rather
// than dispatching into a shared list the way FeedClient/SpaceFeedClient
// do for their composers.
export function PostDetailClient({
  initialPost,
  viewerId,
}: {
  initialPost: FeedPost;
  viewerId: string | null | undefined;
}) {
  const [post, patchPost] = useOptimistic(initialPost, (state: FeedPost, patch: Partial<FeedPost>) => ({
    ...state,
    ...patch,
  }));

  return (
    <PostCard
      post={post}
      actions={
        <>
          {post.spaceId && post.promotedToId && <PromotedMarker publicPostId={post.promotedToId} />}
          {post.spaceId && !post.promotedToId && <PromoteAction post={post} viewerId={viewerId} />}
          <PostActions
            postId={post.id}
            authorId={post.author.id}
            viewerId={viewerId}
            body={post.body}
            createdAt={post.createdAt}
            deletedAt={post.deletedAt}
            onOptimisticUpdate={patchPost}
          />
        </>
      }
    />
  );
}
