"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAuthModal } from "@/components/auth/AuthModalContext";
import { AccountModal } from "@/components/auth/AccountModal";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/research", label: "Research" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { open } = useAuthModal();
  const [accountOpen, setAccountOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  const displayName = (user?.user_metadata?.username as string | undefined) || user?.email;

  return (
    <nav className="topnav">
      <Link href="/" className="logo" style={{ textDecoration: "none" }}>
        <Logo size={30} />
        <span>
          DISPATCH
          <span className="tag">Equity Research &amp; Analytics</span>
        </span>
      </Link>
      <div className="nav-links">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={pathname === link.href ? "active" : ""}
          >
            {link.label}
          </Link>
        ))}
        <ThemeToggle />
        {user ? (
          <div className="auth-user-chip">
            <button
              type="button"
              className="email"
              title="Edit display name"
              onClick={() => setAccountOpen(true)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", color: "inherit" }}
            >
              {displayName}
            </button>
            <button type="button" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        ) : (
          <button
            className="auth-btn"
            type="button"
            onClick={() => open("sign-in")}
          >
            Sign In
          </button>
        )}
      </div>
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </nav>
  );
}
