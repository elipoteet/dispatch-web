import { PostCardSkeletonList } from "@/components/social/PostCardSkeleton";

export default function ProfileLoading() {
  return (
    <div className="social-content-card">
      <PostCardSkeletonList count={4} />
    </div>
  );
}
