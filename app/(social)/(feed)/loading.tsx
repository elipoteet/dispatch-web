import { PostCardSkeletonList } from "@/components/social/PostCardSkeleton";

// Feed's loading state — a content-shaped placeholder, not a spinner
// (docs/phase-four.md Part 2). Same .social-content-card wrapper the real
// page uses, so nothing shifts when the real content swaps in.
export default function FeedLoading() {
  return (
    <div className="social-content-card">
      <PostCardSkeletonList count={5} />
    </div>
  );
}
