import { NextResponse, type NextRequest } from "next/server";
import { buildLineupEntries, insertManualShow } from "@/lib/shows";
import { findOrCreateBandByName } from "@/lib/bands";
import { processShowFlyer, uploadShowFlyer } from "@/lib/r2";
import { getCurrentUser } from "@/lib/auth";
import { revalidateShows } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kept comfortably under Vercel Functions' ~4.5MB request-body cap — same
// rationale as the avatar/media-pro upload routes.
const MAX_FLYER_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function str(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

// "Add a show" submission — requires login. Multipart (rather than JSON)
// since an optional flyer image rides along with the other fields.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to submit a show." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ success: false, error: "Malformed submission" }, { status: 400 });
  }

  const venue = str(form.get("venue")).trim();
  const date = str(form.get("date")).trim();
  const notes = str(form.get("notes"));
  const link = str(form.get("link"));
  const newBandName = str(form.get("newBandName")).trim();

  if (!date || !venue) {
    return NextResponse.json(
      { success: false, error: "Missing date or venue" },
      { status: 400 },
    );
  }

  let linkedBands: { name: string; slug: string }[] = [];
  try {
    const parsed = JSON.parse(str(form.get("linkedBands")) || "[]");
    if (Array.isArray(parsed)) linkedBands = parsed;
  } catch {
    // Malformed JSON from the client falls back to no linked bands.
  }

  const flyer = form.get("flyer");
  const flyerFile = flyer instanceof File && flyer.size > 0 ? flyer : null;
  if (flyerFile) {
    if (!ALLOWED_TYPES.has(flyerFile.type)) {
      return NextResponse.json({ success: false, error: "Unsupported image type" }, { status: 400 });
    }
    if (flyerFile.size > MAX_FLYER_BYTES) {
      return NextResponse.json({ success: false, error: "Flyer must be 4MB or smaller" }, { status: 400 });
    }
  }

  try {
    // A band typed into the "This band isn't listed yet" form is added to the
    // canonical `bands` table here (name-only, de-duped by name) so its lineup
    // slug resolves to a real directory row instead of dangling. Done before
    // the lineup is built so the show links the slug the DB actually assigned.
    if (newBandName) {
      const { band } = await findOrCreateBandByName(newBandName);
      linkedBands.push({ name: band.name, slug: band.slug });
    }

    const names = linkedBands.map((b) => b.name);
    const title = names[0] || venue;
    const lineup = names.join(", ");

    let flyerUrl: string | undefined;
    if (flyerFile) {
      const bytes = new Uint8Array(await flyerFile.arrayBuffer());
      const processed = await processShowFlyer(bytes);
      flyerUrl = await uploadShowFlyer(processed);
    }

    const { id } = await insertManualShow(
      {
        venue,
        title,
        date,
        lineup: buildLineupEntries(lineup, linkedBands),
        notes: notes || "",
        link: link || "",
        flyerUrl,
      },
      "public_submission",
      { name: user.name ?? user.email, email: user.email },
    );
    revalidateShows();
    return NextResponse.json({ success: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submission failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
