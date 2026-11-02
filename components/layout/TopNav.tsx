"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAuthModal } from "@/components/auth/AuthModalContext";
import { AccountModal } from "@/components/auth/AccountModal";
import { CompanySearch } from "@/components/company/CompanySearch";
import { ThemeToggle } from "./ThemeToggle";
import { AlertBell } from "./AlertBell";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/research", label: "Research" },
  { href: "/about", label: "About" },
  { href: "/give", label: "Give Back" },
];

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Logo left; on a company's pages a compact company search; then the links,
// the theme toggle and Sign in (phase ten, docs/design/phase-ten). On a phone
// the search and the links each open from a button instead.
export function TopNav() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { user } = useAuth();
  const { open } = useAuthModal();
  const [accountOpen, setAccountOpen] = useState(false);
  // Which page a phone's menu or search was opened on. Moving to another page
  // closes it, with no effect needed to reset it.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [searchFor, setSearchFor] = useState<string | null>(null);
  const menuOpen = menuFor === pathname;
  const searchOpen = searchFor === pathname;
  const companyPage = pathname.startsWith("/research/");

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  function toggleSearch() {
    setMenuFor(null);
    if (searchOpen) return setSearchFor(null);
    setSearchFor(pathname);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#nav-search input")?.focus());
  }

  const displayName = (user?.user_metadata?.username as string | undefined) || user?.email;

  return (
    <nav
      className={`topnav${menuOpen ? " is-menu-open" : ""}${searchOpen ? " is-search-open" : ""}`}
      aria-label="Main"
      onKeyDown={(e) => {
        if (e.key === "Escape" && (menuOpen || searchOpen)) {
          setMenuFor(null);
          setSearchFor(null);
        }
      }}
    >
      <Link href="/" className="logo" style={{ textDecoration: "none" }}>
        <Logo size={32} />
        <span>
          DISPATCH
          <span className="tag">Research on every U.S. company</span>
        </span>
      </Link>

      <div className="nav-mobile">
        {companyPage && (
          <button type="button" className="nav-icon-btn" aria-label="Search companies" aria-expanded={searchOpen} aria-controls="nav-search" onClick={toggleSearch}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="nav-icon-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="nav-menu"
          onClick={() => {
            setSearchFor(null);
            setMenuFor(menuOpen ? null : pathname);
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      <div className="nav-right">
        {companyPage && (
          <div className="nav-search" id="nav-search">
            <CompanySearch compact placeholder="Search a company" />
          </div>
        )}
        <div className="nav-links" id="nav-menu">
          {LINKS.map((link) => {
            const active = isActive(link.href, pathname);
            return (
              <Link key={link.href} href={link.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                {link.label}
              </Link>
            );
          })}
          <div className="nav-actions">
            <ThemeToggle />
            {user && <AlertBell />}
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
              <button className="auth-btn" type="button" onClick={() => open("sign-in")}>
                Sign in
              </button>
            )}
          </div>
        </div>
      </div>
      <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    </nav>
  );
}
