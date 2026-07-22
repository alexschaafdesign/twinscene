import { NextResponse, type NextRequest } from "next/server";
import { buildLineupEntries, insertManualShow } from "@/lib/shows";
import { upsertBand, type BandSubmissionInput } from "@/lib/bands";
import { processShowFlyer, uploadShowFlyer } from "@/lib/r2";
import { getCurrentUser } from "@/lib/auth";
import { revalidateBands, revalidateShows } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kept comfortably under Vercel Functions' ~4.5MB request-body cap — same
// rationale as the avatar/media-pro upload routes.
const MAX_FLYER_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function str(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw : "";
}

function splitList(raw: FormDataEntryValue | null): string[] {
  return str(raw)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
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
  // Optional editorial event name ("New Band Night"), shown as a subtitle. The
  // marquee is the lineup; when no event name is given, title falls back to the
  // band list so title-only readers (feeds, profiles) still have a label.
  const eventTitle = str(form.get("title")).trim();

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
    // canonical `bands` table here (with the details the form collected) so its
    // lineup slug resolves to a real directory row instead of dangling. Same
    // add path /api/bands/submit uses (upsertBand). Done before the lineup is
    // built so the show links the slug the DB actually assigned.
    let bandCreated = false;
    if (newBandName) {
      const input: BandSubmissionInput = {
        name: newBandName,
        genres: splitList(form.get("newBandGenres")),
        similarTo: [],
        city: str(form.get("newBandLocation")).trim(),
        neighborhoods: [],
        members: [],
        contactEmail: str(form.get("newBandContactEmail")).trim(),
        contactMethod: "",
        website: "",
        instagram: str(form.get("newBandInstagram")).trim(),
        bandcamp: "",
        bandcampLink: "",
        bio: "",
        featuredLinks: [],
      };
      const { band } = await upsertBand(input, "add");
      linkedBands.push({ name: band.name, slug: band.slug });
      bandCreated = true;
    }

    const names = linkedBands.map((b) => b.name);
    const lineup = names.join(", ");
    const title = eventTitle || lineup || venue;

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
        // Optional structured details, same set a scraped show carries. Times
        // arrive as 24-hour "HH:MM" from the form's <input type="time">.
        musicTime: str(form.get("musicTime")),
        doorsTime: str(form.get("doorsTime")),
        genres: splitList(form.get("genres")),
        ageRestriction: str(form.get("ageRestriction")).trim(),
      },
      "public_submission",
      { name: user.name ?? user.email, email: user.email },
    );
    revalidateShows();
    if (bandCreated) revalidateBands();
    return NextResponse.json({ success: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submission failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
