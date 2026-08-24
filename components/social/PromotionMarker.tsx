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

// The public-side "came from a space" marker moved into PostCard itself
// (the .from-space-kicker treatment above the header, not down here in
// the actions row) — see PostCard.tsx's RepostIcon/fromSpace logic. Kept
// out of this file since it's no longer a standalone action-slot
// component; still deliberately not a link and deliberately not naming
// the space, per docs/phase-three.md.
