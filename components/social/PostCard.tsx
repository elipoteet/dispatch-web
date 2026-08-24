import type { ReactNode } from "react";
import Link from "next/link";
import { SchoolBadge } from "./SchoolBadge";
import { TickerCard } from "./TickerCard";
import { Avatar } from "./Avatar";
import { formatRelativeTime } from "@/lib/social/time";
import { renderCashtags } from "@/lib/social/cashtags";
import type { FeedPost } from "@/lib/social/queries";

// Small repost-style icon for the "from a space" kicker — two curved
// arrows, the same shorthand Twitter/LinkedIn use for "this showed up
// here from somewhere else," so it reads instantly rather than needing
// the label alone to carry it.
function RepostIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 5h6a2 2 0 0 1 2 2v1M12 11H6a2 2 0 0 1-2-2V8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M6.5 3 4 5l2.5 2M9.5 13 12 11l-2.5-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  // A public post that started life in a Space — rendered as a kicker
  // above the header (matching how Twitter/LinkedIn mark a repost: a
  // small line above the post, not mixed into the action row below,
  // where it read as just another link next to Reply). Handled here,
  // inside PostCard itself, rather than threaded through every call
  // site's actions prop — the first version of this missed the feed and
  // profile pages entirely because it depended on each page remembering
  // to pass it.
  const fromSpace = Boolean(post.promotedFrom) && !post.spaceId;

  return (
    <article className={`post-card${isDeleted ? " tombstone" : ""}`}>
      <Avatar avatarUrl={post.author.avatarUrl} displayName={post.author.displayName} />
      <div className="post-card-body">
        {fromSpace && (
          <div className="from-space-kicker">
            <RepostIcon />
            From a space
          </div>
        )}
        <div className="post-head">
          <span className="post-name">
            <Link href={`/@${post.author.handle}`}>{post.author.displayName}</Link>
          </span>
          <SchoolBadge
            shortName={post.author.schoolShortName}
            gradYear={post.author.gradYear}
            colorPrimary={post.author.schoolColorPrimary}
          />
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
            {post.replyCount === 0
              ? "Reply"
              : `${post.replyCount} ${post.replyCount === 1 ? "reply" : "replies"}`}
          </Link>
          {post.pushbackCount > 0 && (
            <Link href={`/p/${post.id}`}>
              {post.pushbackCount} pushback{post.pushbackCount === 1 ? "" : "s"}
            </Link>
          )}
        </div>

        {actions}
      </div>
    </article>
  );
}
