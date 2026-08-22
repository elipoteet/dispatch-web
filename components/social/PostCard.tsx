import type { ReactNode } from "react";
import Link from "next/link";
import { SchoolBadge } from "./SchoolBadge";
import { TickerCard } from "./TickerCard";
import { formatRelativeTime } from "@/lib/social/time";
import { initials } from "@/lib/social/avatar";
import { renderCashtags } from "@/lib/social/cashtags";
import type { FeedPost } from "@/lib/social/queries";

const TYPE_LABELS: Record<string, string> = {
  question: "Question",
  thesis: "Thesis",
  link: "Link",
};

// Renders both a normal post and its deleted tombstone (deletedAt set) —
// a tombstone still shows the author/badge/time, just not the body, and
// still shows the reply count/link, per docs/phase-one.md: "A deleted
// post renders as a tombstone that still shows its replies."
export function PostCard({ post, actions }: { post: FeedPost; actions?: ReactNode }) {
  const isDeleted = Boolean(post.deletedAt);
  // "take" is the default/plain type and doesn't get a badge — only the
  // other three are worth calling out, same as the prototype reference.
  const typeLabel = TYPE_LABELS[post.type];

  return (
    <article className={`post-card${isDeleted ? " tombstone" : ""}`}>
      <div className="avatar">{initials(post.author.displayName)}</div>
      <div className="post-card-body">
        <div className="post-head">
          <span className="post-name">
            <Link href={`/@${post.author.handle}`}>{post.author.displayName}</Link>
          </span>
          <SchoolBadge shortName={post.author.schoolShortName} gradYear={post.author.gradYear} />
          {typeLabel && !isDeleted && <span className={`post-type post-type--${post.type}`}>{typeLabel}</span>}
          {post.editedAt && !isDeleted && <span className="post-edited">edited</span>}
          <span className="post-time">{formatRelativeTime(post.createdAt)}</span>
        </div>

        {isDeleted ? (
          <div className="post-body">This post was deleted.</div>
        ) : (
          <>
            <div className="post-body">{renderCashtags(post.body)}</div>

            {post.type === "link" && post.linkUrl && (
              <a className="post-link-url" href={post.linkUrl} target="_blank" rel="noreferrer noopener">
                {post.linkUrl}
              </a>
            )}

            {post.changeMyMind && (
              <div className="cmind">
                <span className="cmind-label">What would change my mind</span>
                <p>{post.changeMyMind}</p>
              </div>
            )}

            {post.tickerSnapshot && (
              <>
                <TickerCard snapshot={post.tickerSnapshot} />
                {post.position && (
                  <div className="position-line">
                    {post.position === "owns" ? `Owns $${post.ticker}` : `No position in $${post.ticker}`}
                  </div>
                )}
              </>
            )}
          </>
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
