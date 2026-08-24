"use client";

import { ReplyBox } from "./ReplyBox";
import { ReplyItem } from "./ReplyItem";
import { ReplyActions } from "./ReplyActions";
import { EmptyState } from "./EmptyState";
import { useOptimisticReplies } from "@/lib/social/useOptimisticFeed";
import type { PostAuthor, Reply } from "@/lib/social/queries";

// Reply-thread equivalent of FeedClient/SpaceFeedClient — same
// useOptimistic-sharing reasoning: ReplyBox and the reply list need one
// shared instance so a reply the box adds optimistically renders in the
// same list right below it.
export function ReplyListClient({
  postId,
  initialReplies,
  author,
  viewerId,
}: {
  postId: string;
  initialReplies: Reply[];
  author: PostAuthor | null;
  viewerId: string | null | undefined;
}) {
  const [replies, dispatch] = useOptimisticReplies(initialReplies);

  return (
    <>
      {author && (
        <ReplyBox postId={postId} author={author} onOptimisticReply={(reply) => dispatch({ type: "add", reply })} />
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
                reply.id.startsWith("optimistic-") ? undefined : (
                  <ReplyActions
                    replyId={reply.id}
                    authorId={reply.author.id}
                    viewerId={viewerId}
                    deletedAt={reply.deletedAt}
                  />
                )
              }
            />
          ))
        )}
      </div>
    </>
  );
}
