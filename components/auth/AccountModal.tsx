"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "./AuthProvider";

export function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refreshUser } = useAuth();
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername((user?.user_metadata?.username as string | undefined) ?? "");
      setError(null);
    }
  }, [open, user]);

  useEffect(() => {
    if (!open || !user) {
      setIsSubscriber(false);
      return;
    }
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsSubscriber(data?.status === "active" || data?.status === "trialing");
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
      else setPortalLoading(false);
    } catch {
      setPortalLoading(false);
    }
  }

  if (!open) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    if (trimmed.length < 2 || trimmed.length > 24) {
      setError("Username must be 2–24 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ data: { username: trimmed } });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await refreshUser();
    onClose();
  }

  return (
    <div
      className="auth-backdrop open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="accountModalTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="auth-modal">
        <button className="close-x" aria-label="Close" onClick={onClose} type="button">
          &times;
        </button>
        <div className="label">Account</div>
        <h2 id="accountModalTitle">Set your display name.</h2>
        <p className="sub">Shown in the nav instead of your email. Only visible to you.</p>

        <form onSubmit={handleSave}>
          <div className="auth-field">
            <label htmlFor="usernameInput">Username</label>
            <input
              id="usernameInput"
              type="text"
              autoComplete="off"
              maxLength={24}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          {error && <div className="error">{error}</div>}

          <button className="auth-submit" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>

        {isSubscriber && (
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--rule)" }}>
            <div className="sub" style={{ marginBottom: 10 }}>
              Billing
            </div>
            <button
              className="auth-submit"
              type="button"
              onClick={handleManageBilling}
              disabled={portalLoading}
            >
              {portalLoading ? "Redirecting…" : "Manage Subscription"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
