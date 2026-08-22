"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isWithinEditWindow } from "@/lib/social/time";
import { useAutoGrowTextarea } from "@/lib/social/useAutoGrowTextarea";

// Author-only edit (within 12 hours, enforced for real by the
// enforce_post_edit_window trigger in 0006_social.sql — this component's
// canEdit check is just UI, not the actual guarantee) and soft-delete.
export function PostActions({
  postId,
  authorId,
  viewerId,
  body,
  createdAt,
  deletedAt,
}: {
  postId: string;
  authorId: string;
  viewerId: string | null | undefined;
  body: string;
  createdAt: string;
  deletedAt: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Called unconditionally, ahead of the early return below, per the Rules
  // of Hooks — harmless when this component ends up rendering null.
  const textareaRef = useAutoGrowTextarea(draft);

  if (viewerId !== authorId || deletedAt) return null;

  const canEdit = isWithinEditWindow(createdAt);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("posts").update({ body: trimmed }).eq("id", postId);
    setLoading(false);
    if (error) {
      // The trigger raises a plain exception past the 12-hour window —
      // surface it as-is, it's already a clear sentence.
      setError(error.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("posts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", postId);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} style={{ marginTop: 10 }}>
        <div className="composer-body">
          <textarea ref={textareaRef} value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
          {error && <div className="social-error">{error}</div>}
          <div className="composer-foot" style={{ gap: 8 }}>
            <button
              className="social-btn social-btn-primary social-btn-small"
              type="submit"
              disabled={loading || !draft.trim()}
            >
              {loading ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="social-btn social-btn-small"
              onClick={() => {
                setEditing(false);
                setDraft(body);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="post-actions" style={{ marginTop: 2 }}>
      {canEdit && (
        <button type="button" onClick={() => setEditing(true)}>
          Edit
        </button>
      )}
      <button type="button" onClick={handleDelete} disabled={loading}>
        {loading ? "Deleting…" : "Delete"}
      </button>
      {error && <div className="social-error">{error}</div>}
    </div>
  );
}
