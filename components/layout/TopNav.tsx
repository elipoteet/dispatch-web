"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAuthModal } from "@/components/auth/AuthModalContext";
import { ThemeToggle } from "./ThemeToggle";

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

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <nav className="topnav">
      <Link href="/" className="logo" style={{ textDecoration: "none" }}>
        DISPATCH
        <span className="tag">Equity Research &amp; Analytics</span>
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
            <span className="email">{user.email}</span>
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
    </nav>
  );
}
