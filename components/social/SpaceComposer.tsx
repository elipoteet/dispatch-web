"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";
import { useAutoGrowTextarea } from "@/lib/social/useAutoGrowTextarea";
import { uppercaseCashtags } from "@/lib/social/cashtags";
import { useTickerAttach } from "@/lib/social/useTickerAttach";
import { TickerCard } from "./TickerCard";
import type { FeedPost, PostAuthor } from "@/lib/social/queries";

// The Space composer, deliberately not the public Composer with a mode
// flag — docs/phase-three.md is emphatic on this point: "No post types.
// No length floor. No scaffold. No change-my-mind field. No position
// disclosure… the composer inside a space is a text box plus ticker
// attachment, and nothing else." (The reference prototype's Space view
// actually reuses the full public composer, type pills and all — read as
// the prototype cutting a corner for demo expediency, not a reversal of
// the brief's explicit text.) Ticker attach itself still works exactly as
// it does publicly — same debounce, same one-fetch-per-draft, same frozen
// snapshot — via the shared useTickerAttach hook.
//
// onOptimisticPost — see Composer.tsx's comment on the same prop; same
// pattern, just always type "take" with no position, matching this
// composer's own insert payload.
export function SpaceComposer({
  spaceId,
  author,
  onOptimisticPost,
}: {
  spaceId: string;
  author: PostAuthor;
  onOptimisticPost?: (post: FeedPost) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useAutoGrowTextarea(body);
  const { snapshot, snapshotLoading, reset: resetTicker } = useTickerAttach(body);

  const trimmedBody = body.trim();
  const canPublish = Boolean(trimmedBody) && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canPublish) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const payload: Record<string, unknown> = {
      author_id: author.id,
      space_id: spaceId,
      body: trimmedBody,
      type: "take",
    };
    if (snapshot) {
      payload.ticker = snapshot.symbol;
      payload.ticker_snapshot = snapshot;
      // No position field here, deliberately — a Space post has no
      // position-disclosure UI at all (see the file comment above), and
      // 0011_spaces.sql relaxes posts_ticker_requires_position for Space
      // posts specifically so this doesn't need a silent default. Setting
      // one anyway would forge a disclosure the author never made. Position
      // becomes required for real at promotion time.
    }

    const optimisticPost: FeedPost = {
      id: `optimistic-${crypto.randomUUID()}`,
      body: trimmedBody,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      author,
      replyCount: 0,
      pushbackCount: 0,
      type: "take",
      ticker: snapshot?.symbol ?? null,
      tickerSnapshot: snapshot,
      position: null,
      changeMyMind: null,
      linkUrl: null,
      spaceId,
      promotedFrom: null,
      promotedToId: null,
      // A human composing a post is never Dispatch AI, and it never posts
      // inside a Space anyway — see docs/phase-seven.md.
      generated: false,
      generatedTemplate: null,
      generatedRefPostId: null,
      generatedStats: null,
    };

    setBody("");
    resetTicker();

    startTransition(async () => {
      onOptimisticPost?.(optimisticPost);
      const { error } = await supabase.from("posts").insert(payload);
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <Avatar avatarUrl={author.avatarUrl} displayName={author.displayName} />
      <div className="composer-body">
        <textarea
          ref={textareaRef}
          placeholder="What are you seeing? Type $GPRO to pull the numbers in."
          value={body}
          onChange={(e) => setBody(uppercaseCashtags(e.target.value))}
          rows={3}
        />

        {!trimmedBody && !snapshot && (
          <div className="composer-ticker-hint">
            Type a $TICKER, like $AAPL, and its data attaches to the post automatically.
          </div>
        )}

        {snapshotLoading && !snapshot && <div className="ticker-card-loading">Looking up ticker…</div>}
        {snapshot && <TickerCard snapshot={snapshot} />}

        {error && <div className="social-error">{error}</div>}

        <div className="composer-foot">
          <button
            className="social-btn social-btn-primary"
            type="submit"
            disabled={!canPublish}
            style={{ marginLeft: "auto" }}
          >
            {loading ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </form>
  );
}
