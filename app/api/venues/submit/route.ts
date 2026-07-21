import { NextResponse, type NextRequest } from "next/server";
import { upsertVenue, getVenueBySlug, type VenueSubmissionInput } from "@/lib/venues";
import { uploadVenuePhoto, generateThumbnail, uploadVenueThumbnail } from "@/lib/r2";
import { getCurrentUser, canEditVenue } from "@/lib/auth";
import { revalidateVenues } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Add a venue" / "Edit this venue" submission — replaces the legacy Apps
// Script webhook (apps-script/Code.js's handleVenueSubmission_), which wrote
// into a Google Sheet that nothing reads anymore now that fetchVenues()
// reads this DB directly. Both modes require login: "add" just needs any
// account (no venue exists yet to authorize against — same as adding a band
// or media-pro listing doesn't grant standing edit rights on its own);
// "correct" additionally needs canEditVenue, via venue_editors (migration
// 0035) — mirrors app/api/bands/submit/route.ts and
// app/api/media-pros/submit/route.ts.

function str(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

function parseCapacity(raw: FormDataEntryValue | null): number | null {
  const s = str(raw).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();

  const venueName = str(form.get("venueName")).trim();
  if (!venueName) {
    return NextResponse.json({ success: false, error: "Missing venue name" }, { status: 400 });
  }

  const mode = str(form.get("mode")) === "correct" ? "correct" : "add";
  const existingSlug = str(form.get("existingSlug")) || undefined;
  const venueSlug = str(form.get("venueSlug"));

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to submit a venue." }, { status: 401 });
  }
  if (mode === "correct") {
    const targetVenue = existingSlug ? await getVenueBySlug(existingSlug) : null;
    if (!targetVenue) {
      return NextResponse.json({ success: false, error: "Venue not found" }, { status: 404 });
    }
    if (!(await canEditVenue(user, targetVenue.id))) {
      return NextResponse.json(
        { success: false, error: "You don't have edit access to this venue." },
        { status: 403 },
      );
    }
  }

  try {
    // Resolve the target slug for the photo key before uploading — a
    // correction uploads under the venue's existing slug, an add under the
    // freshly-typed one (upsertVenue may still de-dupe it further, but a
    // photo keyed to "the slug this submission intends" is good enough).
    // Mirrors app/api/bands/submit/route.ts.
    let photoUrl: string | undefined;
    let thumbnailUrl: string | undefined;
    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) {
      const slugForPhoto = mode === "correct" && existingSlug ? existingSlug : venueSlug;
      const bytes = new Uint8Array(await photo.arrayBuffer());
      photoUrl = await uploadVenuePhoto(slugForPhoto, bytes, photo.type || "image/jpeg");
      try {
        const thumb = await generateThumbnail(bytes);
        thumbnailUrl = await uploadVenueThumbnail(slugForPhoto, thumb);
      } catch (err) {
        console.error("venues/submit: thumbnail generation failed", err);
      }
    }

    const input: VenueSubmissionInput = {
      name: venueName,
      address: str(form.get("address")).trim(),
      addressPrivate: str(form.get("addressPrivate")) === "true",
      city: str(form.get("location")).trim(),
      neighborhood: str(form.get("neighborhood")).trim(),
      capacity: parseCapacity(form.get("capacity")),
      contact: str(form.get("contact")).trim(),
      notes: str(form.get("notes")).trim(),
      parking: str(form.get("parking")).trim(),
      accessibility: str(form.get("accessibility")).trim(),
      owner: str(form.get("owner")).trim(),
      type: str(form.get("type")).trim(),
      photoUrl,
      thumbnailUrl,
      removePhoto: str(form.get("removeImage")) === "true",
    };

    const { venue, action } = await upsertVenue(input, mode, existingSlug);
    revalidateVenues();
    return NextResponse.json({ success: true, slug: venue.slug, action });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submission failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
