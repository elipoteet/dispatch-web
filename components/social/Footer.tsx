import Link from "next/link";

// Terms and privacy aren't built yet (docs/legal-and-guidelines.md's terms/
// privacy sections are drafts pending an attorney review) — this array is
// deliberately where those two would slot in once they exist, per the
// original ask to "leave the footer able to take two more links."
const FOOTER_LINKS = [
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/guidelines", label: "Guidelines" },
];

export function Footer() {
  return (
    <footer className="social-footer">
      <p className="social-footer-disclaimer">
        The Dispatch is a place for students to discuss markets. Nothing here is investment
        advice. Posts are written by users, not by professionals, and are not checked for
        accuracy.
      </p>
      <nav className="social-footer-links">
        {FOOTER_LINKS.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
