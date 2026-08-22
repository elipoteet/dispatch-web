"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Delete only, on purpose — see enforce_reply_immutable_body in
// 0006_social.sql. No edit path exists for replies at all.
export function ReplyActions({
  replyId,
  authorId,
  viewerId,
  deletedAt,
}: {
  replyId: string;
  authorId: string;
  viewerId: string | null | undefined;
  deletedAt: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (viewerId !== authorId || deletedAt) return null;

  async function handleDelete() {
    if (!window.confirm("Delete this reply? This can't be undone.")) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("replies")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", replyId);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="post-actions" style={{ marginTop: 2 }}>
      <button type="button" onClick={handleDelete} disabled={loading}>
        {loading ? "Deleting…" : "Delete"}
      </button>
      {error && <div className="social-error">{error}</div>}
    </div>
  );
}
