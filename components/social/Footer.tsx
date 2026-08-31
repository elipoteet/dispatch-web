import Link from "next/link";

// Terms and privacy aren't built yet (docs/legal-and-guidelines.md's terms/
// privacy sections are drafts pending an attorney review) — this array is
// deliberately where those two would slot in once they exist, per the
// original ask to "leave the footer able to take two more links."
const FOOTER_LINKS = [
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/guidelines", label: "Guidelines" },
];

// Mirrors .social-shell's own nav-column/content-column grid (empty
// spacer div standing in for the nav) rather than being independently
// centered at its own width, which is what left it misaligned with the
// feed above it — that old max-width: 640px was this surface's width
// before phase three widened it into a sidebar+content layout; the
// footer never got updated to match.
export function Footer() {
  return (
    <footer className="social-footer">
      <div aria-hidden="true" />
      <div className="social-footer-content">
        <p className="social-footer-disclaimer">
          Dispatch Social is a place for students to discuss markets. Nothing here is investment
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
      </div>
    </footer>
  );
}
