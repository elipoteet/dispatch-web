import type { ReactNode } from "react";
import Link from "next/link";
import { SchoolBadge } from "./SchoolBadge";
import { formatRelativeTime } from "@/lib/social/time";
import { initials } from "@/lib/social/avatar";
import type { FeedPost } from "@/lib/social/queries";

// Renders both a normal post and its deleted tombstone (deletedAt set) —
// a tombstone still shows the author/badge/time, just not the body, and
// still shows the reply count/link, per docs/phase-one.md: "A deleted
// post renders as a tombstone that still shows its replies."
export function PostCard({ post, actions }: { post: FeedPost; actions?: ReactNode }) {
  const isDeleted = Boolean(post.deletedAt);

  return (
    <article className={`post-card${isDeleted ? " tombstone" : ""}`}>
      <div className="avatar">{initials(post.author.displayName)}</div>
      <div className="post-card-body">
        <div className="post-head">
          <span className="post-name">
            <Link href={`/@${post.author.handle}`}>{post.author.displayName}</Link>
          </span>
          <SchoolBadge shortName={post.author.schoolShortName} gradYear={post.author.gradYear} />
          {post.editedAt && !isDeleted && <span className="post-edited">edited</span>}
          <span className="post-time">{formatRelativeTime(post.createdAt)}</span>
        </div>

        {isDeleted ? (
          <div className="post-body">This post was deleted.</div>
        ) : (
          <div className="post-body">{post.body}</div>
        )}

        <div className="post-actions">
          <Link href={`/p/${post.id}`}>
            {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}
          </Link>
        </div>

        {actions}
      </div>
    </article>
  );
}
