"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./Avatar";
import { resizeImageToSquareWebp, ImageTooLargeError } from "@/lib/social/resizeImage";

// Only rendered on your own profile (see app/(social)/u/[handle]/page.tsx's
// isOwnProfile check). A plain <input type="file" accept="image/*"> is
// deliberate — that single attribute is what makes mobile offer both the
// camera roll and the camera, no special mobile handling needed.
export function AvatarUpload({
  profileId,
  displayName,
  avatarUrl,
}: {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentUrl, setCurrentUrl] = useState(avatarUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be re-selected later if needed
    if (!file) return;

    setError(null);
    setLoading(true);
    const previousUrl = currentUrl;
    // Resize/upload/update-row is a real multi-second round trip (client
    // resize, then a network upload, then a DB write) — without a local
    // preview, "Uploading…" was the only feedback for the whole span. A
    // blob URL of the already-resized image shows the real, final-shaped
    // result immediately; only the CDN URL underneath it is still
    // catching up. Reverted to the previous avatar (or cleared) on any
    // failure, same as every other optimistic update in this app.
    let previewUrl: string | null = null;
    try {
      const blob = await resizeImageToSquareWebp(file);
      previewUrl = URL.createObjectURL(blob);
      setCurrentUrl(previewUrl);

      const supabase = createClient();
      // Same path every time — overwritten in place, per the brief, so old
      // versions never accumulate in the bucket.
      const path = `${profileId}/avatar.webp`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/webp", cacheControl: "3600" });
      if (uploadError) {
        setError(uploadError.message);
        setCurrentUrl(previousUrl);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      // The storage path never changes on overwrite, so the URL wouldn't
      // either — a cache-busting query param is what actually makes the
      // browser fetch the new file instead of a stale cached copy.
      const bustedUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: bustedUrl })
        .eq("id", profileId);
      if (updateError) {
        setError(updateError.message);
        setCurrentUrl(previousUrl);
        return;
      }
      setCurrentUrl(bustedUrl);
      router.refresh();
    } catch (err) {
      setCurrentUrl(previousUrl);
      setError(
        err instanceof ImageTooLargeError
          ? err.message
          : "Something went wrong processing that image. Try a different one.",
      );
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setLoading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setLoading(true);
    const previousUrl = currentUrl;
    setCurrentUrl(null);
    const supabase = createClient();
    await supabase.storage.from("avatars").remove([`${profileId}/avatar.webp`]);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", profileId);
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      setCurrentUrl(previousUrl);
      return;
    }
    router.refresh();
  }

  return (
    <div className="avatar-upload">
      <Avatar avatarUrl={currentUrl} displayName={displayName} className="profile-avatar" />
      <div className="avatar-upload-actions">
        <button
          type="button"
          className="social-btn social-btn-small"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          {loading ? "Uploading…" : currentUrl ? "Change photo" : "Add photo"}
        </button>
        {currentUrl && (
          <button
            type="button"
            className="social-btn social-btn-small"
            onClick={handleRemove}
            disabled={loading}
          >
            Remove photo
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
      </div>
      {error && <div className="social-error">{error}</div>}
    </div>
  );
}
