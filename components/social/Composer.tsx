"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/social/avatar";

// Direct client-side insert (RLS: auth.uid() = author_id), same pattern as
// AccountModal's updateUser call — no dedicated API route needed since
// Postgres enforces the actual authorization.
export function Composer({
  authorId,
  authorDisplayName,
}: {
  authorId: string;
  authorDisplayName: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("posts").insert({ author_id: authorId, body: trimmed });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="avatar">{initials(authorDisplayName)}</div>
      <div className="composer-body">
        <textarea
          placeholder="Make an argument. Say what would change your mind."
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
            {loading ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </form>
  );
}
