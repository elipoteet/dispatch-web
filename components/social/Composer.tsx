"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";
import { useAutoGrowTextarea } from "@/lib/social/useAutoGrowTextarea";
import { uppercaseCashtags } from "@/lib/social/cashtags";
import { useTickerAttach } from "@/lib/social/useTickerAttach";
import { TickerCard } from "./TickerCard";
import Link from "next/link";

type PostType = "take" | "question" | "thesis" | "link";

const TYPES: Record<PostType, { label: string; placeholder: string; minLength: number }> = {
  take: { label: "Take", placeholder: "What's on your mind, and why does it matter?", minLength: 0 },
  question: {
    label: "Question",
    placeholder: "What are you trying to work out? Say what you already know.",
    minLength: 0,
  },
  thesis: {
    label: "Thesis",
    placeholder: "Make the argument. What is happening, why it matters, and what you are watching.",
    minLength: 320,
  },
  link: { label: "Link", placeholder: "Paste the link, then say why it matters.", minLength: 0 },
};

// Inserted automatically on choosing Thesis, not behind an optional button
// — "almost nobody clicks an optional formatting button; almost everybody
// types into a structure that is already there." docs/phase-two.md.
const THESIS_SCAFFOLD = "What happened\n\n\nWhy it matters\n\n\nWhat I am watching from here\n";

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// Direct client-side insert (RLS: auth.uid() = author_id), same pattern as
// AccountModal's updateUser call — no dedicated API route needed since
// Postgres enforces the actual authorization (and the new
// posts_enforce_metadata_immutable/posts_thesis_min_length/etc constraints
// in 0007_composer.sql back this up regardless of what the UI allows).
export function Composer({
  authorId,
  authorAvatarUrl,
  authorDisplayName,
}: {
  authorId: string;
  authorAvatarUrl: string | null;
  authorDisplayName: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<PostType>("take");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [changeMyMind, setChangeMyMind] = useState("");
  const [position, setPosition] = useState<"owns" | "none" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useAutoGrowTextarea(body);
  const { snapshot, snapshotLoading, reset: resetTicker } = useTickerAttach(body);

  // Position is per-ticker, not per-draft — clear it whenever the resolved
  // symbol changes (including to/from no ticker at all), same as before
  // this logic moved into the shared useTickerAttach hook. Adjusted during
  // render (React's documented pattern for "reset state when a derived
  // value changes") rather than in a useEffect, which would trip
  // react-hooks/set-state-in-effect — the same lint rule already flagged
  // (pre-existing, not introduced here) in ResearchDesk.tsx and
  // lib/useTheme.ts.
  const [lastSymbol, setLastSymbol] = useState(snapshot?.symbol);
  if (snapshot?.symbol !== lastSymbol) {
    setLastSymbol(snapshot?.symbol);
    setPosition(null);
  }

  function handleTypeChange(next: PostType) {
    // Auto-insert the scaffold only into a genuinely empty box; clear it
    // back out only if it was never touched — never clobber real writing.
    if (next === "thesis" && !body.trim()) {
      setBody(THESIS_SCAFFOLD);
    } else if (type === "thesis" && next !== "thesis" && body === THESIS_SCAFFOLD) {
      setBody("");
    }
    setType(next);
  }

  const trimmedBody = body.trim();
  const tickerAttached = snapshot !== null;

  let validationHint: string | null = null;
  if (type === "thesis" && trimmedBody.length < TYPES.thesis.minLength) {
    validationHint = `${TYPES.thesis.minLength - trimmedBody.length} more characters for a thesis`;
  } else if (type === "link" && !linkUrl.trim()) {
    validationHint = "Add a link";
  } else if (type === "link" && !isValidUrl(linkUrl.trim())) {
    validationHint = "That doesn't look like a valid link";
  } else if (type === "link" && !trimmedBody) {
    validationHint = "Say why the link matters";
  } else if (!trimmedBody) {
    validationHint = null; // handled by the disabled state directly, no need to nag
  } else if (tickerAttached && position === null) {
    validationHint = `State whether you hold a position in $${snapshot!.symbol}`;
  }

  const canPublish = Boolean(trimmedBody) && !validationHint && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canPublish) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const payload: Record<string, unknown> = {
      author_id: authorId,
      body: trimmedBody,
      type,
    };
    if (type === "link") payload.link_url = linkUrl.trim();
    if (changeMyMind.trim()) payload.change_my_mind = changeMyMind.trim();
    if (snapshot) {
      payload.ticker = snapshot.symbol;
      payload.ticker_snapshot = snapshot;
      payload.position = position;
    }

    const { error } = await supabase.from("posts").insert(payload);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setBody("");
    setLinkUrl("");
    setChangeMyMind("");
    setPosition(null);
    resetTicker();
    setType("take");
    router.refresh();
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <Avatar avatarUrl={authorAvatarUrl} displayName={authorDisplayName} />
      <div className="composer-body">
        <div className="type-pills">
          {(Object.keys(TYPES) as PostType[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`type-pill${type === t ? " on" : ""}`}
              onClick={() => handleTypeChange(t)}
            >
              {TYPES[t].label}
            </button>
          ))}
        </div>

        {type === "link" && (
          <div className="social-field" style={{ marginTop: 0, marginBottom: 8 }}>
            <input
              type="url"
              placeholder="https://…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
          </div>
        )}

        <textarea
          ref={textareaRef}
          placeholder={TYPES[type].placeholder}
          value={body}
          onChange={(e) => setBody(uppercaseCashtags(e.target.value))}
          rows={type === "thesis" ? 6 : 3}
        />

        {snapshotLoading && !snapshot && <div className="ticker-card-loading">Looking up ticker…</div>}

        {snapshot && (
          <>
            <TickerCard snapshot={snapshot} />

            <div className="position-toggle">
              <span className="position-toggle-label">Position in ${snapshot.symbol}</span>
              <button
                type="button"
                className={`social-btn social-btn-small${position === "owns" ? " social-btn-primary" : ""}`}
                onClick={() => setPosition("owns")}
              >
                Own it
              </button>
              <button
                type="button"
                className={`social-btn social-btn-small${position === "none" ? " social-btn-primary" : ""}`}
                onClick={() => setPosition("none")}
              >
                No position
              </button>
            </div>

            <div className="social-field cmind-field">
              <label htmlFor="composerChangeMyMind">What would change your mind?</label>
              <input
                id="composerChangeMyMind"
                type="text"
                placeholder="Optional, and often the most useful line in the post."
                value={changeMyMind}
                onChange={(e) => setChangeMyMind(e.target.value)}
              />
            </div>
          </>
        )}

        {error && <div className="social-error">{error}</div>}

        <div className="composer-foot">
          <Link href="/guidelines" className="composer-guidelines-link">
            Guidelines
          </Link>
          {validationHint && <span className="hint">{validationHint}</span>}
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
