import { PostCardSkeletonList } from "@/components/social/PostCardSkeleton";

export default function PostDetailLoading() {
  return (
    <div className="social-content-card">
      <PostCardSkeletonList count={1} />
      <PostCardSkeletonList count={3} />
    </div>
  );
}
