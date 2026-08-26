"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { nextDisplayNameChangeDate } from "@/lib/social/time";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Onboarding pre-fills display name from the email's local part, and
// nothing let anyone fix it afterward — the gap that surfaced when a
// mentor signed up with a personal Gmail address and got stuck as
// "eli.poteet." Rate-limited to once every 14 days (Eli's call), enforced
// for real at the DB layer (supabase/migrations/0015_display_name_cooldown.sql)
// — this component's own cooldown check is only so the edit affordance
// doesn't show when it would just fail, not the actual enforcement.
// Only rendered editable on your own profile, same convention as
// AvatarUpload/LinkedInField (see app/(social)/u/[handle]/page.tsx's
// isOwnProfile check); a stranger just sees plain text, no controls.
export function DisplayNameField({
  profileId,
  displayName,
  displayNameChangedAt,
  isOwnProfile,
}: {
  profileId: string;
  displayName: string;
  displayNameChangedAt: string | null;
  isOwnProfile: boolean;
}) {
  const [name, setName] = useState(displayName);
  const [changedAt, setChangedAt] = useState(displayNameChangedAt);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOwnProfile) {
    return <div className="profile-name">{name}</div>;
  }

  const nextEligible = nextDisplayNameChangeDate(changedAt);

  if (editing) {
    async function handleSave(e: React.FormEvent) {
      e.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed) {
        setError("Enter a display name.");
        return;
      }
      setSaving(true);
      setError(null);
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", profileId);
      setSaving(false);
      if (updateError) {
        // The DB trigger's own message ("You can change your display name
        // once every 14 days. Try again on...") is already the right
        // thing to show verbatim — same pattern as every other DB-raised
        // error surfaced as-is elsewhere in this app.
        setError(updateError.message);
        return;
      }
      setName(trimmed);
      setChangedAt(new Date().toISOString());
      setEditing(false);
    }

    return (
      <form className="profile-name-form" onSubmit={handleSave}>
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
        <div className="profile-name-form-actions">
          <button type="submit" className="social-btn social-btn-small social-btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="social-btn social-btn-small"
            onClick={() => {
              setDraft(name);
              setError(null);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
        <div className="hint">You can change your display name once every 14 days.</div>
        {error && <div className="social-error">{error}</div>}
      </form>
    );
  }

  return (
    <div className="profile-name-row">
      <div className="profile-name">{name}</div>
      {nextEligible ? (
        <span className="profile-name-cooldown">Next change available {formatDate(nextEligible)}</span>
      ) : (
        <button
          type="button"
          className="profile-name-edit"
          onClick={() => setEditing(true)}
          title="You can change your display name once every 14 days."
        >
          Edit
        </button>
      )}
    </div>
  );
}
