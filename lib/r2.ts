// Uploads a band photo to Cloudflare R2 — the same bucket/domain
// apps-script/Code.js's saveImageToR2_ has always written band photos to
// (bands/<slug>.<ext>, served from R2_PUBLIC_URL), now called directly from
// the Next.js app instead of through the Apps Script webhook.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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
