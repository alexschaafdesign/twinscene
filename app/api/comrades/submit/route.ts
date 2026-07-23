import { NextResponse, type NextRequest } from "next/server";
import { upsertComrade, getComradeBySlug, type ComradeSubmissionInput } from "@/lib/comrades";
import { uploadComradePhoto, generateThumbnail, uploadComradeThumbnail } from "@/lib/r2";
import { getCurrentUser, canEditComrade } from "@/lib/auth";
import { COMRADE_CATEGORIES, type ComradeCategory } from "@/lib/comradeUtils";

// Kept under Vercel Functions' ~4.5MB request-body cap, same rationale as
// MediaProSubmitForm.tsx's MAX_MEDIA_UPLOAD_BYTES and the avatar routes'
// MAX_UPLOAD_BYTES.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public "Add a comrade" / "Edit this listing" submission for the studios /
// labels / etc directory — mirrors app/api/media-pros/submit's shape.
// `mode: "add"` needs no auth (anyone can list an org, same as adding a band
// or venue); `mode: "correct"` is gated by canEditComrade, the real
// self-editing write path once a claim has been approved.

function str(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

function parseCategory(raw: FormDataEntryValue | null): ComradeCategory {
  const s = str(raw);
  return (COMRADE_CATEGORIES as string[]).includes(s) ? (s as ComradeCategory) : "other";
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
  }

  const photoField = form.get("photo");
  const photoFile = photoField instanceof File && photoField.size > 0 ? photoField : null;

  if (photoFile) {
    if (!ALLOWED_TYPES.has(photoFile.type)) {
      return NextResponse.json({ success: false, error: "Unsupported image type" }, { status: 400 });
    }
    if (photoFile.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: "That photo is too large — try a smaller file" },
        { status: 400 },
      );
    }
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

    const input: ComradeSubmissionInput = {
      name,
      category: parseCategory(form.get("category")),
      tagline: str(form.get("tagline")).trim(),
      bio: str(form.get("bio")).trim(),
      city: str(form.get("city")).trim(),
      website: str(form.get("website")).trim(),
      instagram: str(form.get("instagram")).trim(),
      contact: str(form.get("contact")).trim(),
      photoUrl,
      thumbnailUrl,
      removePhoto: str(form.get("removePhoto")) === "true",
    };

    const { comrade, action } = await upsertComrade(input, mode, existingSlug);
    return NextResponse.json({ success: true, slug: comrade.slug, action });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submission failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
