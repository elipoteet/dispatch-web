"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SchoolBadge } from "./SchoolBadge";
import { Avatar } from "./Avatar";
import { TickerSearchBar } from "./TickerSearchBar";

export type HeaderProfile = {
  handle: string;
  displayName: string;
  gradYear: number;
  schoolShortName: string;
  schoolColorPrimary: string | null;
  avatarUrl: string | null;
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
        <TickerSearchBar />
        <div className="social-header-auth">
          <ThemeToggle />
          {user && profile ? (
            <>
              <SchoolBadge
                shortName={profile.schoolShortName}
                gradYear={profile.gradYear}
                colorPrimary={profile.schoolColorPrimary}
              />
              <Link href={`/@${profile.handle}`} className="header-handle">
                <Avatar avatarUrl={profile.avatarUrl} displayName={profile.displayName} className="avatar--sm" />
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
