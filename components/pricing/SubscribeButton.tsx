"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAuthModal } from "@/components/auth/AuthModalContext";
import { createClient } from "@/lib/supabase/client";

export function SubscribeButton() {
  const { user } = useAuth();
  const { open } = useAuthModal();
  const [isSubscriber, setIsSubscriber] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setIsSubscriber(false);
      return;
    }
    // Reads the user's own row directly — the subscriptions table's RLS
    // policy allows a signed-in user to select only their own row, so no
    // API route is needed just to check status.
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
  }, [user]);

  async function handleClick() {
    if (!user) {
      open("sign-up");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(isSubscriber ? "/api/stripe/portal" : "/api/stripe/checkout", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error || "Something went wrong. Try again in a moment.");
        setLoading(false);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Something went wrong. Try again in a moment.");
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={handleClick} disabled={loading}>
        {loading ? "Redirecting…" : isSubscriber ? "Manage Subscription" : "Subscribe"}
      </button>
      {error && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--accent)" }} role="alert">
          {error}
        </div>
      )}
    </>
  );
}
