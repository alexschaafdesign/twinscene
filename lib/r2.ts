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

// --- Venues ------------------------------------------------------------
// Profile photo for a venue directory listing. Keyed by slug like band
// photos (one object per venue, overwritten in place on re-upload), reusing
// the same generateThumbnail() pipeline bands use for their 400px grid
// variant.

/** Upload a venue photo, keyed by slug (overwrites any existing photo for
 * that slug), and return its public URL. */
export async function uploadVenuePhoto(
  slug: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error("lib/r2: R2_BUCKET_NAME/R2_PUBLIC_URL are not set");
  }
  const key = `venues/${slug}.${extensionFromMime(mimeType)}`;

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

/** Upload a venue thumbnail to R2 under venues/thumb/<slug>.jpg and return
 * its public URL. Overwrites any existing thumbnail for that slug. */
export async function uploadVenueThumbnail(
  slug: string,
  thumbBytes: Uint8Array | Buffer,
): Promise<string> {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error("lib/r2: R2_BUCKET_NAME/R2_PUBLIC_URL are not set");
  }
  const key = `venues/thumb/${slug}.jpg`;

  await client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: thumbBytes,
      ContentType: "image/jpeg",
    }),
  );

  return `${R2_PUBLIC_URL}/${key}`;
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

// --- Media pros (photographers/videographers) ------------------------------
// Profile photo for a media-pro directory listing. Keyed by slug like band
// photos (one object per listing, overwritten in place on re-upload), reusing
// the same generateThumbnail() pipeline bands use for their 400px grid variant.

/** Upload a media pro's profile photo, keyed by slug, and return its public
 * URL. */
export async function uploadMediaProPhoto(
  slug: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error("lib/r2: R2_BUCKET_NAME/R2_PUBLIC_URL are not set");
  }
  const key = `media-pros/${slug}.${extensionFromMime(mimeType)}`;

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

/** Upload a media pro's thumbnail to R2 under media-pros/thumb/<slug>.jpg and
 * return its public URL. Overwrites any existing thumbnail for that slug. */
export async function uploadMediaProThumbnail(
  slug: string,
  thumbBytes: Uint8Array | Buffer,
): Promise<string> {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error("lib/r2: R2_BUCKET_NAME/R2_PUBLIC_URL are not set");
  }
  const key = `media-pros/thumb/${slug}.jpg`;

  await client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: thumbBytes,
      ContentType: "image/jpeg",
    }),
  );

  return `${R2_PUBLIC_URL}/${key}`;
}

// --- Media pro gallery images ----------------------------------------------
// Up to 5 portfolio images per listing (media_pros.gallery, migration 0032),
// separate from the single profile `photo`. Each gets its own random key
// under media-pros/gallery/<slug>/ — unlike `photo`/thumbnail (one object per
// slug, overwritten in place) multiple images coexist and are added/removed
// independently, so a shared slug-only key would collide.

const GALLERY_MAX_DIMENSION = 2400;

/** Re-encode a gallery upload: honor EXIF rotation then strip it, and cap the
 * long edge at GALLERY_MAX_DIMENSION without upscaling. Quality stays high
 * (92) since these are meant to showcase the work, not thumbnail it. */
export async function processGalleryImage(bytes: Uint8Array): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize(GALLERY_MAX_DIMENSION, GALLERY_MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

/** Upload one processed gallery image under media-pros/gallery/<slug>/<random>.jpg
 * and return its public URL. */
export async function uploadMediaProGalleryImage(
  slug: string,
  bytes: Uint8Array | Buffer,
): Promise<string> {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error("lib/r2: R2_BUCKET_NAME/R2_PUBLIC_URL are not set");
  }
  const key = `media-pros/gallery/${slug}/${crypto.randomUUID()}.jpg`;

  await client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: bytes,
      ContentType: "image/jpeg",
    }),
  );

  return `${R2_PUBLIC_URL}/${key}`;
}

/** Best-effort delete of a gallery image removed on edit, given its public
 * URL. Silently no-ops on anything that isn't a gallery object under this
 * public base — replacing a listing's gallery should never fail because
 * cleanup of a dropped image did. */
export async function deleteMediaProGalleryImage(publicUrl: string): Promise<void> {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) return;
  if (!publicUrl.startsWith(`${R2_PUBLIC_URL}/media-pros/gallery/`)) return;
  const key = publicUrl.slice(`${R2_PUBLIC_URL}/`.length);

  try {
    await client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  } catch (err) {
    console.error("lib/r2: failed to delete removed gallery image", err);
  }
}

// Musician avatars (Musicians Slice 3) reuse generateAvatar above — same
// sharp resize/re-encode pipeline — but live under their own musicians/<id>/
// prefix (rather than avatars/<userId>/) since a musician's avatar and its
// linked user's avatar (if any) are independent uploads.

/** Upload a processed musician avatar under musicians/<musicianId>/<random>.webp
 * and return its public URL. */
export async function uploadMusicianAvatar(musicianId: number, bytes: Buffer): Promise<string> {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error("lib/r2: R2_BUCKET_NAME/R2_PUBLIC_URL are not set");
  }
  const key = `musicians/${musicianId}/${crypto.randomUUID()}.webp`;

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

/** Best-effort delete of a previous musician avatar, given its public URL. */
export async function deleteMusicianAvatar(publicUrl: string): Promise<void> {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) return;
  if (!publicUrl.startsWith(`${R2_PUBLIC_URL}/musicians/`)) return;
  const key = publicUrl.slice(`${R2_PUBLIC_URL}/`.length);

  try {
    await client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  } catch (err) {
    console.error("lib/r2: failed to delete previous musician avatar", err);
  }
}

// --- Show flyers -------------------------------------------------------
// Flyer art for a manually-submitted show (app/api/shows/submit). Scraped
// shows populate flyer_url directly with an already-external URL and never
// touch this pipeline — see upsertScrapedShow in lib/shows.ts. A
// user-submitted flyer gets a random key (shows have no stable slug at
// upload time, unlike bands), long edge capped like media-pro gallery
// images since flyer art is meant to display at close to full size.

const FLYER_MAX_DIMENSION = 2000;

/** Re-encode a submitted flyer: honor EXIF rotation then strip it, and cap
 * the long edge without upscaling. */
export async function processShowFlyer(bytes: Uint8Array): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize(FLYER_MAX_DIMENSION, FLYER_MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

/** Upload a processed show flyer under shows/flyer/<random>.jpg and return
 * its public URL. */
export async function uploadShowFlyer(bytes: Uint8Array | Buffer): Promise<string> {
  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error("lib/r2: R2_BUCKET_NAME/R2_PUBLIC_URL are not set");
  }
  const key = `shows/flyer/${crypto.randomUUID()}.jpg`;

  await client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: bytes,
      ContentType: "image/jpeg",
    }),
  );

  return `${R2_PUBLIC_URL}/${key}`;
}
