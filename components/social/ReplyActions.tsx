"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Delete only, on purpose — see enforce_reply_immutable_body in
// 0006_social.sql. No edit path exists for replies at all.
//
// onOptimisticDelete — same pattern as the composers' onOptimisticPost:
// called inside a transition before the update resolves, so the reply
// tombstones immediately rather than waiting on router.refresh(). Passed
// down from ReplyListClient, which owns the shared useOptimisticReplies
// instance this reply's own entry lives in. Patches deletedAt in place
// rather than removing the entry from the list — a deleted reply still
// renders as a tombstone (soft delete, same as a real one), so removing
// it optimistically would mean it visibly reappears once
// router.refresh() brings back the real, still-present tombstoned row.
export function ReplyActions({
  replyId,
  authorId,
  viewerId,
  deletedAt,
  onOptimisticDelete,
}: {
  replyId: string;
  authorId: string;
  viewerId: string | null | undefined;
  deletedAt: string | null;
  onOptimisticDelete?: (id: string, deletedAt: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (viewerId !== authorId || deletedAt) return null;

  async function handleDelete() {
    if (!window.confirm("Delete this reply? This can't be undone.")) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const deletedAtValue = new Date().toISOString();
    startTransition(async () => {
      onOptimisticDelete?.(replyId, deletedAtValue);
      const { error } = await supabase.from("replies").update({ deleted_at: deletedAtValue }).eq("id", replyId);
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.refresh();
    });
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
