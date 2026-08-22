"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Logo } from "@/components/layout/Logo";
import { SchoolBadge } from "./SchoolBadge";

export type HeaderProfile = {
  handle: string;
  displayName: string;
  gradYear: number;
  schoolShortName: string;
};

export function SocialHeader({ profile }: { profile: HeaderProfile | null }) {
  const { user } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <header className="social-header">
      <div className="social-header-inner">
        <Link href="/" className="brand-link">
          <Logo size={26} />
          <span className="brand-word">Dispatch</span>
        </Link>
        <div className="social-header-auth">
          {user && profile ? (
            <>
              <SchoolBadge shortName={profile.schoolShortName} gradYear={profile.gradYear} />
              <Link href={`/@${profile.handle}`} className="header-handle">
                @{profile.handle}
              </Link>
              <button type="button" className="social-btn social-btn-small" onClick={handleSignOut}>
                Sign Out
              </button>
            </>
          ) : user ? (
            // Signed in but no profile row yet — mid-onboarding. Nothing to
            // badge yet, so just offer a way out rather than a blank badge.
            <button type="button" className="social-btn social-btn-small" onClick={handleSignOut}>
              Sign Out
            </button>
          ) : (
            <>
              <Link href="/login" className="social-btn social-btn-small">
                Sign In
              </Link>
              <Link href="/signup" className="social-btn social-btn-primary social-btn-small">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
