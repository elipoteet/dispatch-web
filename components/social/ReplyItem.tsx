import type { ReactNode } from "react";
import Link from "next/link";
import { SchoolBadge } from "./SchoolBadge";
import { formatRelativeTime } from "@/lib/social/time";
import { initials } from "@/lib/social/avatar";
import type { Reply } from "@/lib/social/queries";

// Flat, one level, no edit path — see docs/phase-one.md and
// enforce_reply_immutable_body in 0006_social.sql. Soft-deleted replies
// still render (as a small tombstone), same spirit as posts, just to
// preserve the thread's shape rather than leaving a gap.
export function ReplyItem({ reply, actions }: { reply: Reply; actions?: ReactNode }) {
  const isDeleted = Boolean(reply.deletedAt);

  return (
    <div className={`reply${isDeleted ? " tombstone" : ""}`}>
      <div className="avatar avatar--sm">{initials(reply.author.displayName)}</div>
      <div className="post-card-body">
        <div className="post-head">
          <span className="post-name">
            <Link href={`/@${reply.author.handle}`}>{reply.author.displayName}</Link>
          </span>
          <SchoolBadge shortName={reply.author.schoolShortName} gradYear={reply.author.gradYear} />
          <span className="post-time">{formatRelativeTime(reply.createdAt)}</span>
        </div>
        <div className="post-body">{isDeleted ? "This reply was deleted." : reply.body}</div>
        {actions}
      </div>
    </div>
  );
}
