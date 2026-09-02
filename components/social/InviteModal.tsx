"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useModalA11y } from "@/lib/social/useModalA11y";
import { Avatar } from "./Avatar";
import { IdentityBadge } from "./IdentityBadge";
import type { PostAuthor } from "@/lib/social/queries";
import type { SpaceInvitePreview } from "@/lib/social/spaces";

// docs/invite-modal-build-brief.md. The whole point of this route, not a
// dismissable overlay over some other real page — there's nothing behind
// it to reveal, so Decline (and Escape/backdrop-click, which both act as
// Decline while a decision hasn't been made yet) is the only "cancel"
// concept here. Five states, matching docs/invite-modal-mock.html's own
// STATES object: expired, confirm (signed in or signed out), joined,
// declined.
//
// Deliberately no fetching in here — app/(social)/j/[token]/page.tsx
// resolves everything server-side (the preview via the security-definer
// RPC, the inviter via a plain public profiles query) and passes it down,
// same "Server Component fetches, Client Component only handles
// interactivity" split used everywhere else in this app.

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

type Props =
  | { state: "expired" }
  | { state: "confirm"; token: string; preview: SpaceInvitePreview; owner: PostAuthor; signedOut?: boolean };

type Phase = "confirm" | "joined" | "declined";

export function InviteModal(props: Props) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape/backdrop-click only mean something while a decision hasn't
  // been made yet (or the link was dead from the start) — the three
  // "done" phases each already have exactly one visible action, so
  // there's nothing to cancel out of.
  const handleClose = useCallback(() => {
    if (props.state === "confirm" && phase === "confirm") setPhase("declined");
  }, [props.state, phase]);
  const modalRef = useModalA11y(true, handleClose);

  async function handleJoin() {
    if (props.state !== "confirm") return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("join_space_via_token", { p_token: props.token });
    setLoading(false);
    if (error || !data || data.length === 0) {
      setError(error?.message || "That link isn't valid anymore.");
      return;
    }
    setPhase("joined");
  }

  function handleDecline() {
    // No RPC call — nothing written, nothing recorded, per the brief.
    setPhase("declined");
  }

  return (
    <div
      className="invite-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="invite-modal"
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inviteModalHeading"
      >
        {props.state === "expired" ? (
          <Expired />
        ) : phase === "joined" ? (
          <Joined preview={props.preview} />
        ) : phase === "declined" ? (
          <Declined />
        ) : (
          <Confirm
            preview={props.preview}
            owner={props.owner}
            token={props.token}
            signedOut={Boolean(props.signedOut)}
            loading={loading}
            error={error}
            onJoin={handleJoin}
            onDecline={handleDecline}
          />
        )}
      </div>
    </div>
  );
}

function Confirm({
  preview,
  owner,
  token,
  signedOut,
  loading,
  error,
  onJoin,
  onDecline,
}: {
  preview: SpaceInvitePreview;
  owner: PostAuthor;
  token: string;
  signedOut: boolean;
  loading: boolean;
  error: string | null;
  onJoin: () => void;
  onDecline: () => void;
}) {
  return (
    <>
      <div className="invite-h">
        <div className="invite-k">Invitation</div>
        <div className="invite-inviter">
          <Avatar
            avatarUrl={owner.avatarUrl}
            displayName={owner.displayName}
            verifiedRole={owner.verifiedRole}
            className="invite-av"
          />
          <div className="invite-inviter-t">
            <b>{owner.displayName}</b> invited you to a space
            <span className="invite-badge-row">
              <IdentityBadge subject={owner} size={13} />
            </span>
          </div>
        </div>
        <div className="invite-space">
          <h2 id="inviteModalHeading">{preview.name}</h2>
          {preview.description && <p>{preview.description}</p>}
          <div className="invite-meta">
            <span className="invite-lock">
              <LockIcon /> Private
            </span>
            <span className="invite-memb">
              {preview.memberCount} {preview.memberCount === 1 ? "member" : "members"}
            </span>
          </div>
        </div>
      </div>
      <p className="invite-note">
        {signedOut
          ? "You'll need a verified school email first. Confirm it and you land straight in this space — the invite is held for you."
          : "Posts here are visible to members only. Anything you write stays in the space unless you publish it to the feed yourself."}
      </p>
      {error && (
        <div className="social-error" style={{ margin: "0 24px" }}>
          {error}
        </div>
      )}
      <div className="invite-f">
        {signedOut && <span className="invite-fnote">Verify to join</span>}
        <button type="button" className="social-btn" onClick={onDecline}>
          Decline
        </button>
        {signedOut ? (
          <Link className="social-btn social-btn-primary" href={`/signup?invite=${encodeURIComponent(token)}&confirmed=1`}>
            Verify and join
          </Link>
        ) : (
          <button type="button" className="social-btn social-btn-primary" onClick={onJoin} disabled={loading}>
            {loading ? "Joining…" : "Join space"}
          </button>
        )}
      </div>
    </>
  );
}

function Joined({ preview }: { preview: SpaceInvitePreview }) {
  return (
    <div className="invite-done">
      <div className="invite-done-k">Joined</div>
      <h2 id="inviteModalHeading">You&rsquo;re in {preview.name}</h2>
      <p>It now appears in your left navigation.</p>
      <div className="invite-f">
        <Link className="social-btn social-btn-primary" href={`/s/${preview.slug}`}>
          Open the space
        </Link>
      </div>
    </div>
  );
}

function Declined() {
  return (
    <div className="invite-done">
      <div className="invite-done-k">Declined</div>
      <h2 id="inviteModalHeading">You didn&rsquo;t join</h2>
      <p>Nobody in the space is told. The link keeps working — open it again any time and you can still join.</p>
      <div className="invite-f">
        <Link className="social-btn" href="/">
          Back to the feed
        </Link>
      </div>
    </div>
  );
}

function Expired() {
  return (
    <div className="invite-done">
      <div className="invite-done-k">Invitation</div>
      <h2 id="inviteModalHeading">This link isn&rsquo;t valid anymore.</h2>
      <p>The owner may have regenerated it. Ask whoever shared it for a new one.</p>
      <div className="invite-f">
        <Link className="social-btn" href="/">
          Back to the feed
        </Link>
      </div>
    </div>
  );
}
