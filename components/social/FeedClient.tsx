"use client";

import { Composer } from "./Composer";
import { PostCard } from "./PostCard";
import { EmptyState } from "./EmptyState";
import { useOptimisticFeed } from "@/lib/social/useOptimisticFeed";
import type { FeedPost, PostAuthor } from "@/lib/social/queries";

// Owns the feed's optimistic post list — the composer and the list have
// to share this one useOptimistic instance (a post the composer adds
// optimistically needs to render in the same list right below it), which
// is why this exists as its own client component rather than the two
// living as separate children of the server-rendered feed page the way
// they did before phase four.
export function FeedClient({ initialPosts, author }: { initialPosts: FeedPost[]; author: PostAuthor | null }) {
  const [posts, dispatch] = useOptimisticFeed(initialPosts);

  return (
    <>
      {author && (
        <Composer author={author} onOptimisticPost={(post) => dispatch({ type: "add", post })} />
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
