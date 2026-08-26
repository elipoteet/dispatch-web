import { initials } from "@/lib/social/avatar";
import type { VerifiedRole } from "@/lib/social/queries";

// Shared display component — renders the uploaded photo when avatar_url is
// set, falling back to the existing initials circle otherwise, so nothing
// breaks for a user who never set one. Plain <img>, not next/image: these
// are small (400x400, resized client-side before upload — see
// AvatarUpload.tsx) and served from Supabase Storage's public CDN, not
// worth configuring images.remotePatterns for.
//
// verifiedRole is optional and only ever matters for "system" (the one
// Dispatch AI account, docs/phase-seven.md) — squares its shape instead
// of the usual circle, matching VerifiedBadge's own square/rosette split.
// Decided here, once, rather than pushing a conditional out to every call
// site — same reasoning IdentityBadge exists for.
export function Avatar({
  avatarUrl,
  displayName,
  verifiedRole,
  className = "",
}: {
  avatarUrl: string | null | undefined;
  displayName: string;
  verifiedRole?: VerifiedRole;
  className?: string;
}) {
  const shapeClass = verifiedRole === "system" ? "avatar--square" : "";
  const fullClassName = `avatar ${shapeClass} ${className}`.replace(/\s+/g, " ").trim();

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt="" className={`${fullClassName} avatar-photo`.trim()} />
    );
  }
  return <div className={fullClassName}>{initials(displayName)}</div>;
}
