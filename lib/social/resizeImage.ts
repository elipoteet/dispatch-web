export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

export class ImageTooLargeError extends Error {}

// Center-crops to a square and resizes to a fixed size, client-side, then
// encodes as WebP — keeps files tiny, avoids any server-side image
// processing, and normalizes whatever a phone camera hands over (arbitrary
// aspect ratio, huge dimensions) into one small, predictable format before
// it ever reaches Supabase Storage.
export async function resizeImageToSquareWebp(
  file: File,
  size = 400,
  quality = 0.85,
): Promise<Blob> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageTooLargeError("That image is too large — please use one under 5MB.");
  }

  const bitmap = await createImageBitmap(file);
  const cropSize = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - cropSize) / 2;
  const sy = (bitmap.height - cropSize) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Your browser can't process images here. Try a different browser.");
  }
  ctx.drawImage(bitmap, sx, sy, cropSize, cropSize, 0, 0, size, size);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not process that image. Try a different one."));
      },
      "image/webp",
      quality,
    );
  });
}
