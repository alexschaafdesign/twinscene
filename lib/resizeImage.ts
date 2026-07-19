/**
 * Downscales an image file in the browser (via canvas) before upload, so a
 * large phone photo doesn't have to be rejected for size — the server
 * re-encodes avatars/gallery images again anyway (lib/r2.ts's
 * generateAvatar / generateThumbnail / processGalleryImage), so this only
 * needs to get the file comfortably under the request-body limit, not
 * produce a final asset. Animated GIFs are left untouched (canvas would
 * flatten them to one frame); non-image files pass through unchanged.
 *
 * Never makes a file bigger: if the re-encoded blob isn't smaller than the
 * original, the original file is returned as-is.
 */
export async function resizeImageFile(
  file: File,
  { maxDimension = 1600, quality = 0.85 }: { maxDimension?: number; quality?: number } = {},
): Promise<File> {
  if (file.type === "image/gif" || !file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob || blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^./]+$/, "") + ".webp";
  return new File([blob], name, { type: "image/webp" });
}
