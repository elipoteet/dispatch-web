"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Random url-safe hex token, generated client-side via the Web Crypto API
// — same 32-char hex shape spaces.invite_token defaults to server-side
// (0011_spaces.sql), just generated here since "regenerate" is a plain
// owner-scoped UPDATE (spaces_update_own), not one of the three RPC
// functions. The authorization is enforced by RLS regardless of where the
// random value comes from; this only needs to be unguessable, not secret
// from the client that's setting it.
function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function SpaceInvitePanel({ spaceId, inviteUrl: initialUrl }: { spaceId: string; inviteUrl: string }) {
  const router = useRouter();
  const [inviteUrl, setInviteUrl] = useState(initialUrl);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1700);
    } catch {
      setError("Couldn't copy automatically — select and copy the link above.");
    }
  }

  async function handleRegenerate() {
    if (!window.confirm("Regenerate the invite link? The old link stops working immediately.")) return;
    setError(null);
    setRegenerating(true);
    const supabase = createClient();
    const token = randomToken();
    const { error } = await supabase.from("spaces").update({ invite_token: token }).eq("id", spaceId);
    setRegenerating(false);
    if (error) {
      setError(error.message);
      return;
    }
    const base = inviteUrl.slice(0, inviteUrl.lastIndexOf("/j/") + 3);
    setInviteUrl(base + token);
    router.refresh();
  }

  return (
    <div className="space-invite">
      <span className="space-invite-label">Invite link</span>
      <span className="space-invite-url">{inviteUrl}</span>
      <button type="button" className="social-btn social-btn-small" onClick={handleCopy}>
        {copied ? "Copied" : "Copy"}
      </button>
      <button type="button" className="social-btn social-btn-small" onClick={handleRegenerate} disabled={regenerating}>
        {regenerating ? "Regenerating…" : "Regenerate"}
      </button>
      {error && <div className="social-error">{error}</div>}
      <span className="space-invite-hint">
        Anyone with a verified school email who opens this link joins the space. Regenerate it if it ends up
        somewhere it shouldn&rsquo;t.
      </span>
    </div>
  );
}
