import Link from "next/link";

// The Space-side marker, once a post has been promoted — links to the
// public copy. Rendered instead of PromoteAction once promotedToId is set
// (see PostCard's caller for that wiring).
export function PromotedMarker({ publicPostId }: { publicPostId: string }) {
  return (
    <Link href={`/p/${publicPostId}`} className="promotion-marker promotion-marker-published">
      Published to the feed →
    </Link>
  );
}

// The public-side marker — deliberately not a link and deliberately not
// naming the space: docs/phase-three.md is explicit that a promoted post
// must not name the space it came from, since a club's existence is
// information its owner hasn't agreed to publish.
export function FromSpaceMarker() {
  return <div className="promotion-marker promotion-marker-from-space">From a space</div>;
}
