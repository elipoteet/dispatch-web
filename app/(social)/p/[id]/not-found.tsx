import type { Metadata } from "next";

// Set noindex explicitly rather than relying on Next's automatic
// injection for notFound() — verified empirically elsewhere in this repo
// that it doesn't reliably apply once a custom not-found.tsx exists in the
// segment (see docs/claude-project-context.md gotcha #2).
//
// title is also explicit, not omitted — found live: a not-found.tsx with
// no title of its own resolved to "Dispatch Social — The Dispatch" (both
// the (social) layout's title.default AND the root layout's older title
// template composing together), not the clean "Dispatch Social" a bare
// default should produce. Not fully root-caused, but every not-found.tsx
// in this route group gets an explicit title as the reliable fix.
export const metadata: Metadata = {
  title: "Post Not Found",
  robots: { index: false, follow: false },
};

export default function PostNotFound() {
  return (
    <div className="social-empty" style={{ padding: "60px 0" }}>
      That post doesn&rsquo;t exist.
    </div>
  );
}
