import { NextResponse, type NextRequest } from "next/server";
import { upsertComrade, getComradeBySlug, type ComradeSubmissionInput } from "@/lib/comrades";
import {
  uploadComradePhoto,
  generateThumbnail,
  uploadComradeThumbnail,
  processGalleryImage,
  uploadComradeGalleryImage,
  deleteComradeGalleryImage,
} from "@/lib/r2";
import { getCurrentUser, canEditComrade } from "@/lib/auth";
import { COMRADE_CATEGORIES, type ComradeCategory } from "@/lib/comradeUtils";

const MAX_GALLERY_IMAGES = 5;
// Combined budget for photo + gallery files in one request — kept comfortably
// under Vercel Functions' ~4.5MB request-body cap. This route bundles every new
// image into a single multipart POST, so the limit applies to their sum. Same
// rationale as the old media-pros submit route this absorbed.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public "Add a comrade" / "Edit this listing" submission for the studios /
// labels / photo-video / etc directory — mirrors app/api/bands/submit's shape.
// `mode: "add"` needs no auth (anyone can list an org, same as adding a band
// or venue); `mode: "correct"` is gated by canEditComrade, the real
// self-editing write path once a claim has been approved.
//
// Galleries + portfolio_url only ever apply to the `photo_video` category
// (folded in from the retired media_pros directory), but the route accepts them
// generically — the form only sends them for that category.

function str(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

function parseCategory(raw: FormDataEntryValue | null): ComradeCategory {
  const s = str(raw);
  return (COMRADE_CATEGORIES as string[]).includes(s) ? (s as ComradeCategory) : "other";
}

/** The gallery URLs the client wants to keep, sent as a JSON string array
 * alongside any newly uploaded files — see ComradeSubmitForm.tsx. */
function parseGalleryUrls(raw: FormDataEntryValue | null): string[] {
  const s = str(raw);
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData();

  const name = str(form.get("name")).trim();
  if (!name) {
    return NextResponse.json({ success: false, error: "Missing name" }, { status: 400 });
  }

  const mode = str(form.get("mode")) === "correct" ? "correct" : "add";
  const existingSlug = str(form.get("existingSlug")) || undefined;
  const slugForPhoto = str(form.get("slug"));

  let previousGallery: string[] = [];
  if (mode === "correct") {
    const target = existingSlug ? await getComradeBySlug(existingSlug) : null;
    if (!target) {
      return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
    }
    const user = await getCurrentUser();
    if (!(await canEditComrade(user, target.id))) {
      return NextResponse.json(
        {
          success: false,
          error: user
            ? "You don't have edit access to this listing."
            : "Log in to edit this listing.",
        },
        { status: user ? 403 : 401 },
      );
    }
    previousGallery = target.gallery;
  }

  const existingGalleryUrls = parseGalleryUrls(form.get("existingGallery"));
  const galleryFiles = form
    .getAll("galleryPhotos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (existingGalleryUrls.length + galleryFiles.length > MAX_GALLERY_IMAGES) {
    return NextResponse.json(
      { success: false, error: `Up to ${MAX_GALLERY_IMAGES} gallery images allowed` },
      { status: 400 },
    );
  }

  const photoField = form.get("photo");
  const photoFile = photoField instanceof File && photoField.size > 0 ? photoField : null;

  for (const file of photoFile ? [photoFile, ...galleryFiles] : galleryFiles) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: "Unsupported image type" }, { status: 400 });
    }
  }

  const totalUploadBytes = (photoFile?.size ?? 0) + galleryFiles.reduce((sum, f) => sum + f.size, 0);
  if (totalUploadBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { success: false, error: "That upload is too large — try smaller images or fewer gallery photos" },
      { status: 400 },
    );
  }

  try {
    let photoUrl: string | undefined;
    let thumbnailUrl: string | undefined;
    if (photoFile) {
      const key = mode === "correct" && existingSlug ? existingSlug : slugForPhoto;
      const bytes = new Uint8Array(await photoFile.arrayBuffer());
      photoUrl = await uploadComradePhoto(key, bytes, photoFile.type || "image/jpeg");
      try {
        const thumb = await generateThumbnail(bytes);
        thumbnailUrl = await uploadComradeThumbnail(key, thumb);
      } catch (err) {
        console.error("comrades/submit: thumbnail generation failed", err);
      }
    }

    const gallerySlug = mode === "correct" && existingSlug ? existingSlug : slugForPhoto;
    const newGalleryUrls: string[] = [];
    for (const file of galleryFiles) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const processed = await processGalleryImage(bytes);
      newGalleryUrls.push(await uploadComradeGalleryImage(gallerySlug, processed));
    }
    const galleryUrls = [...existingGalleryUrls, ...newGalleryUrls];

    const removedGalleryUrls = previousGallery.filter((url) => !existingGalleryUrls.includes(url));
    await Promise.all(removedGalleryUrls.map((url) => deleteComradeGalleryImage(url)));

    const input: ComradeSubmissionInput = {
      name,
      category: parseCategory(form.get("category")),
      tagline: str(form.get("tagline")).trim(),
      bio: str(form.get("bio")).trim(),
      city: str(form.get("city")).trim(),
      website: str(form.get("website")).trim(),
      instagram: str(form.get("instagram")).trim(),
      contact: str(form.get("contact")).trim(),
      portfolioUrl: str(form.get("portfolioUrl")).trim(),
      photoUrl,
      thumbnailUrl,
      removePhoto: str(form.get("removePhoto")) === "true",
      galleryUrls,
    };

    const { comrade, action } = await upsertComrade(input, mode, existingSlug);
    return NextResponse.json({ success: true, slug: comrade.slug, action });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submission failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
