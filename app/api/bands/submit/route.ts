import { NextResponse, type NextRequest } from "next/server";
import { upsertBand, type BandSubmissionInput } from "@/lib/bands";
import { addVideo, removeVideos } from "@/lib/videos";
import { uploadBandPhoto, generateThumbnail, uploadBandThumbnail } from "@/lib/r2";
import { buildLineupEntries, insertManualShow } from "@/lib/shows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public "Add your band" / "Edit this band" submission — replaces the legacy
// Apps Script webhook (apps-script/Code.js), which wrote into a Google Sheet
// that nothing reads anymore now that fetchBands() reads this DB directly.
// No secret gate, matching the old public /submit form and the Shows
// feature's equivalent /api/shows/submit route.

function splitList(raw: FormDataEntryValue | null): string[] {
  const s = typeof raw === "string" ? raw : "";
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function str(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

function parseJson<T>(raw: FormDataEntryValue | null, fallback: T): T {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData();

  const bandName = str(form.get("bandName")).trim();
  if (!bandName) {
    return NextResponse.json({ success: false, error: "Missing band name" }, { status: 400 });
  }

  const mode = str(form.get("mode")) === "correct" ? "correct" : "add";
  const existingSlug = str(form.get("existingSlug")) || undefined;
  const bandSlug = str(form.get("bandSlug"));

  const featuredLinks = parseJson<{ url: string; label: string }[]>(
    form.get("featuredLinks"),
    [],
  );
  const newVideos = parseJson<{ url: string; label: string }[]>(form.get("newVideos"), []);
  const removeVideoIds = parseJson<number[]>(form.get("removeVideoIds"), []);
  const shows = parseJson<{ date: string; venue: string; notes: string; link: string }[]>(
    form.get("shows"),
    [],
  );

  try {
    // Resolve the target slug for the photo key before uploading — a
    // correction uploads under the band's existing slug, an add under the
    // freshly-typed one (upsertBand may still de-dupe it further, but a
    // photo keyed to "the slug this submission intends" is good enough; a
    // collision just means the new band's photo overwrites nothing live).
    let photoUrl: string | undefined;
    let thumbnailUrl: string | undefined;
    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) {
      const slugForPhoto = mode === "correct" && existingSlug ? existingSlug : bandSlug;
      const bytes = new Uint8Array(await photo.arrayBuffer());
      photoUrl = await uploadBandPhoto(slugForPhoto, bytes, photo.type || "image/jpeg");
      // Generate the grid/list thumbnail from the same bytes. Best-effort: a
      // failure here shouldn't sink the whole submission — the band still saves
      // with its full-res photo, and BandImage falls back to it when there's no
      // thumbnail. (A later edit, or the backfill script, can fill it in.)
      try {
        const thumb = await generateThumbnail(bytes);
        thumbnailUrl = await uploadBandThumbnail(slugForPhoto, thumb);
      } catch (err) {
        console.error("submit: thumbnail generation failed", err);
      }
    }

    const input: BandSubmissionInput = {
      name: bandName,
      genres: splitList(form.get("genres")),
      city: str(form.get("location")).trim(),
      neighborhoods: splitList(form.get("neighborhoods")),
      members: splitList(form.get("members")),
      contactEmail: str(form.get("contactEmail")).trim(),
      contactMethod: str(form.get("contactMethod")).trim(),
      website: str(form.get("website")).trim(),
      instagram: str(form.get("instagram")).trim(),
      bandcamp: str(form.get("bandcamp")).trim(),
      bandcampLink: str(form.get("bandcampLink")).trim(),
      bio: str(form.get("bio")).trim(),
      featuredLinks,
      photoUrl,
      thumbnailUrl,
      removePhoto: str(form.get("removeImage")) === "true",
    };

    const { band, action } = await upsertBand(input, mode, existingSlug);

    if (removeVideoIds.length > 0) {
      await removeVideos(band.id, removeVideoIds.filter((id) => Number.isInteger(id)));
    }
    for (const v of newVideos) {
      if (typeof v.url === "string" && v.url.trim()) {
        await addVideo(band.id, v.url, typeof v.label === "string" ? v.label : "");
      }
    }

    // Upcoming shows attached from the band form — feature-flagged client-side
    // (SHOWS_ENABLED), goes through the same write path /api/shows/submit
    // uses so it lands in the DB rather than the legacy Apps Script Shows
    // sheet nothing reads.
    for (const show of shows) {
      if (!show.date?.trim() && !show.venue?.trim()) continue;
      await insertManualShow(
        {
          venue: show.venue || "",
          title: band.name,
          date: show.date || "",
          lineup: buildLineupEntries(band.name, [{ name: band.name, slug: band.slug }]),
          notes: show.notes || "",
          link: show.link || "",
        },
        "public_submission",
      );
    }

    return NextResponse.json({ success: true, slug: band.slug, action });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submission failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
