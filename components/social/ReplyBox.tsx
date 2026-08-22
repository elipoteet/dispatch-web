"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/social/avatar";
import { useAutoGrowTextarea } from "@/lib/social/useAutoGrowTextarea";

export function ReplyBox({
  postId,
  authorId,
  authorDisplayName,
}: {
  postId: string;
  authorId: string;
  authorDisplayName: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useAutoGrowTextarea(body);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("replies")
      .insert({ post_id: postId, author_id: authorId, body: trimmed });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <form className="reply-box" onSubmit={handleSubmit}>
      <div className="avatar avatar--sm">{initials(authorDisplayName)}</div>
      <div className="composer-body">
        <textarea
          ref={textareaRef}
          placeholder="Push back."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />
        {error && <div className="social-error">{error}</div>}
        <div className="composer-foot">
          <button
            className="social-btn social-btn-primary"
            type="submit"
            disabled={loading || !body.trim()}
          >
            {loading ? "Replying…" : "Reply"}
          </button>
        </div>
      </div>
    </form>
  );
}
