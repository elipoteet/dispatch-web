import { PostCardSkeletonList } from "@/components/social/PostCardSkeleton";

export default function SpaceLoading() {
  return (
    <div className="social-content-card">
      <PostCardSkeletonList count={4} />
    </div>
  );
}
