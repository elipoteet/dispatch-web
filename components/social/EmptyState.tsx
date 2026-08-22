// Shared empty-state treatment for the feed, a profile with no posts, and a
// post with no replies — deliberately editorial (Inter, real sentence)
// rather than a small monospace system-message line, which read as
// something broken rather than a genuine "nothing here yet."
export function EmptyState({ headline, sub }: { headline: string; sub?: string }) {
  return (
    <div className="social-empty">
      <p className="social-empty-headline">{headline}</p>
      {sub && <p className="social-empty-sub">{sub}</p>}
    </div>
  );
}
