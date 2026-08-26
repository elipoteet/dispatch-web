import type { ReactNode } from "react";
import Link from "next/link";
import { IdentityBadge } from "./IdentityBadge";
import { TickerCard } from "./TickerCard";
import { Avatar } from "./Avatar";
import { formatRelativeTime } from "@/lib/social/time";
import { renderCashtags } from "@/lib/social/cashtags";
import type { FeedPost, GeneratedTemplate } from "@/lib/social/queries";

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

// docs/phase-seven.md / docs/dispatch-ai-design.html. A generated post
// always uses type "take" (no TYPE_LABELS pill of its own — see below),
// so this label pill takes its place, driven by which of the five
// templates produced it instead.
const TEMPLATE_LABELS: Record<GeneratedTemplate, string> = {
  ticker_moved: "Ticker moved",
  unanswered: "Unanswered",
  first_mention: "First mention",
  promotion_flow: "Where it went",
  busiest_beat: "Busiest",
};

// The footer link each template gets, per the design doc — templates 4
// and 5 (promotion_flow, busiest_beat) never link anywhere, matching
// "never names a space" and the weekly recaps having no single target.
// generatedRefPostId can be null even for "unanswered" if the question it
// pointed at was later deleted (on delete set null,
// supabase/migrations/0016_dispatch_ai.sql) — degrades to no link rather
// than a dead/404 link, per that migration's own comment.
function generatedFooterLink(post: FeedPost): { href: string; label: string } | null {
  switch (post.generatedTemplate) {
    case "ticker_moved":
      return post.ticker ? { href: `/research/${post.ticker.toLowerCase()}`, label: "Read the posts" } : null;
    case "first_mention":
      return post.ticker ? { href: `/research/${post.ticker.toLowerCase()}`, label: "Read it" } : null;
    case "unanswered":
      return post.generatedRefPostId ? { href: `/p/${post.generatedRefPostId}`, label: "Answer it" } : null;
    default:
      return null;
  }
}

// Renders both a normal post and its deleted tombstone (deletedAt set) —
// a tombstone still shows the author/badge/time, just not the body, and
// still shows the reply count/link, per docs/phase-one.md: "A deleted
// post renders as a tombstone that still shows its replies."
export function PostCard({ post, actions }: { post: FeedPost; actions?: ReactNode }) {
  const isDeleted = Boolean(post.deletedAt);
  // "take" is the default/plain type and doesn't get a badge — only the
  // other three are worth calling out, same as the prototype reference.
  // Every generated post is also type "take" (never thesis/question/link),
  // so this naturally stays undefined for them too — no collision with
  // TEMPLATE_LABELS below, which takes over that same slot instead.
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
  const footerLink = post.generated ? generatedFooterLink(post) : null;

  return (
    <article className={`post-card${isDeleted ? " tombstone" : ""}${post.generated ? " post--bot" : ""}`}>
      <Avatar
        avatarUrl={post.author.avatarUrl}
        displayName={post.author.displayName}
        verifiedRole={post.author.verifiedRole}
      />
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
          <IdentityBadge subject={post.author} />
          {post.generated && post.generatedTemplate && !isDeleted && (
            <span className="post-type post-type--generated">{TEMPLATE_LABELS[post.generatedTemplate]}</span>
          )}
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

            {/* Only "ticker moved" uses this — a small row of frozen stat
                tiles, same "frozen to the post" idea as ticker_snapshot,
                distinct component since the shape doesn't match TickerCard. */}
            {post.generated && post.generatedStats && post.generatedStats.length > 0 && (
              <div className="gen-stats">
                {post.generatedStats.map((s) => (
                  <div key={s.label} className="gen-stat">
                    <b className={s.value.startsWith("+") ? "up" : s.value.startsWith("-") ? "down" : undefined}>
                      {s.value}
                    </b>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="post-actions">
          {footerLink && <Link href={footerLink.href}>{footerLink.label}</Link>}
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
          {/* docs/dispatch-ai-design.html's exact copy — replies are still
              allowed (the count/link above stays), pushback never is (see
              disablePushback in ReplyBox/ReplyListClient and the
              server-side check in app/api/replies/route.ts). */}
          {post.generated && !isDeleted && <span className="genlab">Generated · no analysis</span>}
        </div>

        {actions}
      </div>
    </article>
  );
}
