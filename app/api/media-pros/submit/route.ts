import { NextResponse, type NextRequest } from "next/server";
import { upsertMediaPro, getMediaProBySlug, type MediaProSubmissionInput } from "@/lib/mediaPros";
import { uploadMediaProPhoto, generateThumbnail, uploadMediaProThumbnail } from "@/lib/r2";
import { getCurrentUser, canEditMediaPro } from "@/lib/auth";
import type { MediaProRole } from "@/lib/mediaProUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public "Add yourself" / "Edit this listing" submission for the
// photographer/videographer directory — mirrors app/api/bands/submit's
// shape. `mode: "add"` needs no auth (anyone can list themselves, same as
// adding a band or venue); `mode: "correct"` is gated by canEditMediaPro,
// the real self-editing write path once a claim has been approved.

function str(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

function parseRole(raw: FormDataEntryValue | null): MediaProRole {
  const s = str(raw);
  return s === "videographer" || s === "both" ? s : "photographer";
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
    const target = existingSlug ? await getMediaProBySlug(existingSlug) : null;
    if (!target) {
      return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
    }
    const user = await getCurrentUser();
    if (!(await canEditMediaPro(user, target.id))) {
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

  try {
    let photoUrl: string | undefined;
    let thumbnailUrl: string | undefined;
    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) {
      const key = mode === "correct" && existingSlug ? existingSlug : slugForPhoto;
      const bytes = new Uint8Array(await photo.arrayBuffer());
      photoUrl = await uploadMediaProPhoto(key, bytes, photo.type || "image/jpeg");
      try {
        const thumb = await generateThumbnail(bytes);
        thumbnailUrl = await uploadMediaProThumbnail(key, thumb);
      } catch (err) {
        console.error("media-pros/submit: thumbnail generation failed", err);
      }
    }

    const input: MediaProSubmissionInput = {
      name,
      role: parseRole(form.get("role")),
      bio: str(form.get("bio")).trim(),
      city: str(form.get("city")).trim(),
      website: str(form.get("website")).trim(),
      instagram: str(form.get("instagram")).trim(),
      contact: str(form.get("contact")).trim(),
      portfolioUrl: str(form.get("portfolioUrl")).trim(),
      photoUrl,
      thumbnailUrl,
      removePhoto: str(form.get("removePhoto")) === "true",
    };

    const { mediaPro, action } = await upsertMediaPro(input, mode, existingSlug);
    return NextResponse.json({ success: true, slug: mediaPro.slug, action });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submission failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
