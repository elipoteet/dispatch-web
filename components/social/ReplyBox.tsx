"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { useAutoGrowTextarea } from "@/lib/social/useAutoGrowTextarea";

const PUSHBACK_MIN_LENGTH = 80;

// Posts through app/api/replies/route.ts rather than a direct client
// insert (unlike the main Composer) — sending the pushback/reply
// notification email needs a secret API key that can't reach the browser,
// so this needs a real server hop. See docs/phase-two.md.
export function ReplyBox({
  postId,
  authorAvatarUrl,
  authorDisplayName,
}: {
  postId: string;
  authorAvatarUrl: string | null;
  authorDisplayName: string;
}) {
  const router = useRouter();
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
    try {
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
      setBody("");
      setIsPushback(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="reply-box" onSubmit={handleSubmit}>
      <Avatar avatarUrl={authorAvatarUrl} displayName={authorDisplayName} className="avatar--sm" />
      <div className="composer-body">
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
