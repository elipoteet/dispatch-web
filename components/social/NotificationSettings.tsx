"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Prefs = { notifyReplies: boolean; notifyPushback: boolean; notifyDigest: boolean };

const TOGGLES: { key: keyof Prefs; column: string; label: string }[] = [
  { key: "notifyReplies", column: "notify_replies", label: "Email when someone replies to you" },
  { key: "notifyPushback", column: "notify_pushback", label: "Email when someone pushes back on you" },
  { key: "notifyDigest", column: "notify_digest", label: "Weekly activity recap" },
];

// Only rendered on your own profile (see app/(social)/u/[handle]/page.tsx's
// isOwnProfile check) — direct client-side update, same pattern as
// AccountModal, since profiles_update_own (0006_social.sql) already covers
// these columns and nothing downstream needs to react to a toggle flip.
export function NotificationSettings({ profileId, initial }: { profileId: string; initial: Prefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);

  async function toggle(key: keyof Prefs, column: string) {
    const next = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: next }));
    setSaving(key);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ [column]: next })
      .eq("id", profileId);
    setSaving(null);
    if (error) {
      setPrefs((p) => ({ ...p, [key]: !next }));
    }
  }

  return (
    <div className="notify-settings">
      <div className="notify-settings-title">Email notifications</div>
      {TOGGLES.map((t) => (
        <label key={t.key} className="notify-toggle-row">
          <input
            type="checkbox"
            checked={prefs[t.key]}
            onChange={() => toggle(t.key, t.column)}
            disabled={saving === t.key}
          />
          <span>{t.label}</span>
        </label>
      ))}
    </div>
  );
}
