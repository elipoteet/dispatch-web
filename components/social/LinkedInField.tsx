"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Small "in" badge, same inline-SVG-function convention as PostCard's
// RepostIcon — no icon library in this app.
function LinkedInIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3.5 5.5h2.2V13H3.5V5.5Zm1.1-3.5a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6ZM7.3 5.5h2.1v1.02c.3-.55 1.03-1.13 2.12-1.13 2.27 0 2.69 1.5 2.69 3.44V13h-2.2V9.27c0-.89-.02-2.03-1.24-2.03-1.24 0-1.43.97-1.43 1.97V13H7.3V5.5Z" />
    </svg>
  );
}

// People paste "www.linkedin.com/in/you" or "linkedin.com/in/you" far
// more often than a full "https://…" — new URL() throws on those (no
// scheme), and the browser's own type="url" validation used to reject
// them outright before this even ran, with a confusing "Please enter a
// URL" for a string that plainly is one. Prepending https:// when a
// scheme is missing instead of rejecting is the actual fix.
function normalizeLinkedInUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function isLikelyLinkedInUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return /(^|\.)linkedin\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

// Self-service only — you paste your own LinkedIn link, nothing is
// fetched or verified. Not the deferred sign-in/alumni-verification path
// (see the migration's own comment). Only rendered editable on your own
// profile (app/(social)/u/[handle]/page.tsx's isOwnProfile check); a
// stranger sees the link if one is set, or nothing at all if not — same
// "no placeholder for what isn't there" spirit as the rest of this app.
export function LinkedInField({
  profileId,
  linkedinUrl,
  isOwnProfile,
}: {
  profileId: string;
  linkedinUrl: string | null;
  isOwnProfile: boolean;
}) {
  const [url, setUrl] = useState(linkedinUrl);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(linkedinUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOwnProfile) {
    if (!url) return null;
    return (
      <a href={url} target="_blank" rel="noreferrer noopener" className="profile-linkedin-chip">
        <LinkedInIcon />
        LinkedIn
      </a>
    );
  }

  if (editing) {
    async function handleSave(e: React.FormEvent) {
      e.preventDefault();
      const trimmed = draft.trim();
      const normalized = trimmed ? normalizeLinkedInUrl(trimmed) : "";
      if (normalized && !isLikelyLinkedInUrl(normalized)) {
        setError("That doesn't look like a linkedin.com link.");
        return;
      }
      setSaving(true);
      setError(null);
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ linkedin_url: normalized || null })
        .eq("id", profileId);
      setSaving(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setUrl(normalized || null);
      setEditing(false);
    }

    return (
      <form className="profile-linkedin-form" onSubmit={handleSave}>
        {/* type="text", not "url" — the browser's native url validation
            rejects a scheme-less paste like "www.linkedin.com/in/you"
            outright, before handleSave (which now fixes that itself) ever
            runs. */}
        <input
          type="text"
          placeholder="linkedin.com/in/you"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        <div className="profile-linkedin-form-actions">
          <button type="submit" className="social-btn social-btn-small social-btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="social-btn social-btn-small"
            onClick={() => {
              setDraft(url ?? "");
              setError(null);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
        {error && <div className="social-error">{error}</div>}
      </form>
    );
  }

  return url ? (
    <div className="profile-linkedin-row">
      <a href={url} target="_blank" rel="noreferrer noopener" className="profile-linkedin-chip">
        <LinkedInIcon />
        LinkedIn
      </a>
      <button type="button" className="profile-linkedin-edit" onClick={() => setEditing(true)}>
        Edit
      </button>
    </div>
  ) : (
    <button type="button" className="profile-linkedin-add" onClick={() => setEditing(true)}>
      + Add LinkedIn
    </button>
  );
}
