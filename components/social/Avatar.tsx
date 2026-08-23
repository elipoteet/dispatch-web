import { initials } from "@/lib/social/avatar";

// Shared display component — renders the uploaded photo when avatar_url is
// set, falling back to the existing initials circle otherwise, so nothing
// breaks for a user who never set one. Plain <img>, not next/image: these
// are small (400x400, resized client-side before upload — see
// AvatarUpload.tsx) and served from Supabase Storage's public CDN, not
// worth configuring images.remotePatterns for.
export function Avatar({
  avatarUrl,
  displayName,
  className = "",
}: {
  avatarUrl: string | null | undefined;
  displayName: string;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt="" className={`avatar avatar-photo ${className}`.trim()} />
    );
  }
  return <div className={`avatar ${className}`.trim()}>{initials(displayName)}</div>;
}
