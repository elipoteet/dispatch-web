"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { useAutoGrowTextarea } from "@/lib/social/useAutoGrowTextarea";
import type { PostAuthor, Reply } from "@/lib/social/queries";

const PUSHBACK_MIN_LENGTH = 80;

// Posts through app/api/replies/route.ts rather than a direct client
// insert (unlike the main Composer) — sending the pushback/reply
// notification email needs a secret API key that can't reach the browser,
// so this needs a real server hop. See docs/phase-two.md.
//
// onOptimisticReply — see Composer.tsx's comment on the equivalent prop.
// "A reply appears under its post immediately" (docs/phase-four.md Part
// 2) is the literal scenario this satisfies.
export function ReplyBox({
  postId,
  author,
  onOptimisticReply,
  disablePushback = false,
}: {
  postId: string;
  author: PostAuthor;
  onOptimisticReply?: (reply: Reply) => void;
  // docs/phase-seven.md — true for a generated Dispatch AI post. Hiding
  // the toggle is UI only; app/api/replies/route.ts enforces the same
  // rule server-side, since a hidden button doesn't stop a direct fetch.
  disablePushback?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isPushback, setIsPushback] = useState(false);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useAutoGrowTextarea(body);

  const trimmed = body.trim();
  const tooShortForPushback = isPushback && trimmed.length < PUSHBACK_MIN_LENGTH;
  const canSubmit = Boolean(trimmed) && !tooShortForPushback && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);

    const optimisticReply: Reply = {
      id: `optimistic-${crypto.randomUUID()}`,
      body: trimmed,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      author,
      isPushback,
    };

    setBody("");
    setIsPushback(false);

    startTransition(async () => {
      try {
        onOptimisticReply?.(optimisticReply);
        const res = await fetch("/api/replies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId, body: trimmed, isPushback }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Something went wrong. Try again.");
          return;
        }
        router.refresh();
      } finally {
        setLoading(false);
      }
    });
  }

  return (
    <form className="reply-box" onSubmit={handleSubmit}>
      <Avatar avatarUrl={author.avatarUrl} displayName={author.displayName} className="avatar--sm" />
      <div className="composer-body">
        {!disablePushback && (
          <div className="type-pills">
            <button
              type="button"
              className={`type-pill${!isPushback ? " on" : ""}`}
              onClick={() => setIsPushback(false)}
            >
              Reply
            </button>
            <button
              type="button"
              className={`type-pill${isPushback ? " on" : ""}`}
              onClick={() => setIsPushback(true)}
            >
              Push back
            </button>
          </div>
        )}
        <textarea
          ref={textareaRef}
          placeholder={isPushback ? "Push back — say why." : "Reply."}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />
        {error && <div className="social-error">{error}</div>}
        <div className="composer-foot">
          {tooShortForPushback && (
            <span className="hint">{PUSHBACK_MIN_LENGTH - trimmed.length} more characters for pushback</span>
          )}
          <button
            className="social-btn social-btn-primary"
            type="submit"
            disabled={!canSubmit}
            style={{ marginLeft: "auto" }}
          >
            {loading ? "Posting…" : isPushback ? "Push back" : "Reply"}
          </button>
        </div>
      </div>
    </form>
  );
}
