import type { Metadata } from "next";

// Set noindex explicitly rather than relying on Next's automatic
// injection for notFound() — verified empirically elsewhere in this repo
// that it doesn't reliably apply once a custom not-found.tsx exists in the
// segment (see docs/claude-project-context.md gotcha #2).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PostNotFound() {
  return (
    <div className="social-empty" style={{ padding: "60px 0" }}>
      That post doesn&rsquo;t exist.
    </div>
  );
}
