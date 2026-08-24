// Content-shaped placeholder for a post card, not a spinner — "a spinner
// in the middle of an empty page reads as broken; a skeleton reads as
// fast" (docs/phase-four.md Part 2). Reuses the shimmer animation/colors
// already built for the research surface's own skeleton loader (.skeleton,
// --skeleton-bg/--skeleton-shine, app/globals.css) rather than building a
// second shimmer effect — same visual language, just shaped like a post.
export function PostCardSkeleton() {
  return (
    <div className="post-card">
      <div className="skeleton skeleton-avatar" />
      <div className="post-card-body">
        <div className="skeleton skeleton-line skeleton-line-name" />
        <div className="skeleton skeleton-line skeleton-line-body" />
        <div className="skeleton skeleton-line skeleton-line-body skeleton-line-short" />
      </div>
    </div>
  );
}

export function PostCardSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </>
  );
}
