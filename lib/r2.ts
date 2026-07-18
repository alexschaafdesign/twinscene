// Uploads a band photo to Cloudflare R2 — the same bucket/domain
// apps-script/Code.js's saveImageToR2_ has always written band photos to
// (bands/<slug>.<ext>, served from R2_PUBLIC_URL), now called directly from
// the Next.js app instead of through the Apps Script webhook.

import crypto from "node:crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

function client(): S3Client {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("lib/r2: R2 credentials are not set");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

/** Bare extension (no dot) for a handful of common image MIME types. */
function extensionFromMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/jpeg":
    default:
      return "jpg";
  }
}

/** Upload a band photo, keyed by slug (overwrites any existing photo for that
 * slug), and return its public URL. */
export async function uploadBandPhoto(
  slug: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error("lib/r2: R2_BUCKET_NAME/R2_PUBLIC_URL are not set");
  }
  const key = `bands/${slug}.${extensionFromMime(mimeType)}`;

  await client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: bytes,
      ContentType: mimeType,
    }),
  );

  return `${R2_PUBLIC_URL}/${key}`;
}

// --- Thumbnails -----------------------------------------------------------
// Band photos are stored full-resolution (958–1080px, 60–220 KB) but the
// directory renders them at 44px (mobile compact list) and 180px (gallery). A
// single 400px square variant covers both — including ~2x DPR gallery cards
// without upscaling — at ~20–35 KB. Both the backfill
// (scripts/migrate/backfill-thumbnails.ts) and new uploads (the submit route)
// go through generateThumbnail() so existing and future thumbnails are
// byte-identical.

export const THUMB_SIZE = 400;
// Flatten any alpha onto the same color as the card's image container so a
// transparent PNG source blends in rather than going black.
const THUMB_BG = "#3A332D";

/** Resize arbitrary image bytes to the standard 400px square band thumbnail
 * (JPEG). `cover` fills the square and center-crops, so non-square sources are
 * cropped rather than letterboxed. `rotate()` first honors EXIF orientation. */
export async function generateThumbnail(bytes: Uint8Array): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "centre" })
    .flatten({ background: THUMB_BG })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

/** Upload a band thumbnail to R2 under bands/thumb/<slug>.jpg and return its
 * public URL. Overwrites any existing thumbnail for that slug (idempotent).
 * `publicBase` defaults to R2_PUBLIC_URL (the live upload path); the backfill
 * passes the origin derived from each band's own photo URL, since R2_PUBLIC_URL
 * isn't present in local dev where the backfill runs. */
export async function uploadBandThumbnail(
  slug: string,
  thumbBytes: Uint8Array | Buffer,
  publicBase: string | undefined = R2_PUBLIC_URL,
): Promise<string> {
  if (!R2_BUCKET_NAME) throw new Error("lib/r2: R2_BUCKET_NAME is not set");
  if (!publicBase) {
    throw new Error("lib/r2: no R2 public base (set R2_PUBLIC_URL or pass publicBase)");
  }
  const key = `bands/thumb/${slug}.jpg`;

  await client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: thumbBytes,
      ContentType: "image/jpeg",
    }),
  );

  return `${publicBase.replace(/\/$/, "")}/${key}`;
}

// --- Avatars ---------------------------------------------------------------
// Unlike band photos (keyed by slug, one object per band, overwritten in
// place), avatars use a random filename under a per-user prefix — the user
// doesn't control the key, and a random name means a freshly uploaded avatar
// never collides with (or needs to explicitly bust a cache for) the previous
// one. deleteAvatar() cleans up the old object on replace.

export const AVATAR_SIZE = 400;

/** Resize arbitrary image bytes to a 400px square avatar (WebP). `cover` +
 * center crop like band thumbnails; re-encoding (not just resizing) also
 * strips any EXIF/metadata from the original upload. `rotate()` first honors
 * EXIF orientation before it's stripped. */
export async function generateAvatar(bytes: Uint8Array): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" })
    .webp({ quality: 82 })
    .toBuffer();
}

/** Upload a processed avatar under avatars/<userId>/<random>.webp and return
 * its public URL. */
export async function uploadAvatar(userId: number, bytes: Buffer): Promise<string> {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error("lib/r2: R2_BUCKET_NAME/R2_PUBLIC_URL are not set");
  }
  const key = `avatars/${userId}/${crypto.randomUUID()}.webp`;

  await client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: bytes,
      ContentType: "image/webp",
    }),
  );

  return `${R2_PUBLIC_URL}/${key}`;
}

/** Best-effort delete of a previous avatar, given its public URL. Silently
 * no-ops on anything that doesn't look like an R2_PUBLIC_URL object (e.g. a
 * user's image_url predating this feature, or already-deleted) — replacing
 * an avatar should never fail because cleanup of the old one did. */
export async function deleteAvatar(publicUrl: string): Promise<void> {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) return;
  if (!publicUrl.startsWith(`${R2_PUBLIC_URL}/avatars/`)) return;
  const key = publicUrl.slice(`${R2_PUBLIC_URL}/`.length);

  try {
    await client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  } catch (err) {
    console.error("lib/r2: failed to delete previous avatar", err);
  }
}
