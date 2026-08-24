"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useModalA11y } from "@/lib/social/useModalA11y";
import type { FeedPost } from "@/lib/social/queries";

// Author-only, author-checked here too (defense in depth, same spirit as
// PostActions' own viewerId check) even though the call site only ever
// passes this to the post's own author. A scrim+modal client component —
// the social surface's first modal, though the pattern already exists for
// the research surface's sign-in (.auth-backdrop/.auth-modal in
// globals.css), reused here rather than invented fresh.
//
// Type choices are Take/Question/Thesis only, deliberately excluding
// Link: a Space post never carries a link_url (SpaceComposer doesn't
// collect one), and posts_link_requires_url (0007_composer.sql) would
// reject an insert with type 'link' and no URL. Thesis is disabled below
// the 320-character floor (posts_thesis_min_length) rather than letting a
// doomed submit fail silently.
const TYPE_LABELS = { take: "Take", question: "Question", thesis: "Thesis" } as const;
type PromoteType = keyof typeof TYPE_LABELS;
const THESIS_MIN_LENGTH = 320;

export function PromoteAction({ post, viewerId }: { post: FeedPost; viewerId: string | null | undefined }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PromoteType>("take");
  const [changeMyMind, setChangeMyMind] = useState(post.changeMyMind ?? "");
  const [position, setPosition] = useState<"owns" | "none" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Hooks called unconditionally, before the early return below — moving
  // this after it would call a different number of hooks depending on
  // whether the viewer is the post's author, which breaks React's Rules
  // of Hooks the moment that prop ever actually changes.
  const handleClose = useCallback(() => setOpen(false), []);
  const modalRef = useModalA11y(open, handleClose);

  if (viewerId !== post.author.id || post.deletedAt) return null;

  const bodyLength = post.body.trim().length;
  const thesisEligible = bodyLength >= THESIS_MIN_LENGTH;
  const tickerAttached = Boolean(post.ticker);
  const canPublish = !loading && (!tickerAttached || position !== null);

  async function handleConfirm() {
    if (!canPublish) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const payload: Record<string, unknown> = {
      author_id: post.author.id,
      body: post.body,
      type,
      promoted_from: post.id,
    };
    if (changeMyMind.trim()) payload.change_my_mind = changeMyMind.trim();
    if (post.ticker) {
      payload.ticker = post.ticker;
      payload.ticker_snapshot = post.tickerSnapshot;
      payload.position = position;
    }

    const { error } = await supabase.from("posts").insert(payload);
    setLoading(false);
    if (error) {
      // The posts_promoted_from_unique constraint is the DB-level backstop
      // against a double-submit race (two tabs) beating the disabled
      // button — surface whatever Postgres says rather than guessing.
      setError(error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="promote-btn" onClick={() => setOpen(true)}>
        Publish to the feed
      </button>
      {open && (
        <div
          className="promote-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="promote-modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="promoteModalHeading">
            <div className="promote-modal-head">
              <div className="promote-modal-kicker">Publish to the feed</div>
              <h2 id="promoteModalHeading">This becomes public, under your name and school.</h2>
              <p>
                It stays in the space too. The replies and pushback here do not travel with it, so the working
                discussion stays private.
              </p>
            </div>

            <div className="promote-modal-body">
              <div className="promote-modal-section">
                <label>What you wrote</label>
                <div className="promote-quoted">
                  {post.body.length > 220 ? `${post.body.slice(0, 220)}…` : post.body}
                </div>
              </div>

              <div className="promote-modal-section">
                <label>What kind of post is this?</label>
                <div className="type-pills">
                  {(Object.keys(TYPE_LABELS) as PromoteType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`type-pill${type === t ? " on" : ""}`}
                      onClick={() => setType(t)}
                      disabled={t === "thesis" && !thesisEligible}
                      title={t === "thesis" && !thesisEligible ? `Needs at least ${THESIS_MIN_LENGTH} characters` : undefined}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {tickerAttached && (
                <>
                  <div className="promote-modal-section">
                    <label htmlFor="promoteChangeMyMind">What would change your mind? — optional</label>
                    <input
                      id="promoteChangeMyMind"
                      value={changeMyMind}
                      onChange={(e) => setChangeMyMind(e.target.value)}
                      placeholder="The most useful line in most posts that have one."
                    />
                  </div>
                  <div className="promote-modal-section">
                    <label>Do you hold a position in ${post.ticker}? — required</label>
                    <div className="position-toggle">
                      <button
                        type="button"
                        className={`social-btn social-btn-small${position === "owns" ? " social-btn-primary" : ""}`}
                        onClick={() => setPosition("owns")}
                      >
                        I own this
                      </button>
                      <button
                        type="button"
                        className={`social-btn social-btn-small${position === "none" ? " social-btn-primary" : ""}`}
                        onClick={() => setPosition("none")}
                      >
                        No position
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="promote-modal-note">
                Structure gets chosen here rather than while you were writing, because this is the moment a working
                note becomes a public claim.
              </div>

              {error && <div className="social-error">{error}</div>}
            </div>

            <div className="promote-modal-foot">
              <button type="button" className="social-btn social-btn-small" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="social-btn social-btn-primary social-btn-small"
                onClick={handleConfirm}
                disabled={!canPublish}
              >
                {loading ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
