import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMusicianBySlug, canEditMusician, setMusicianAvatar } from "@/lib/musicians";
import { generateAvatar, uploadMusicianAvatar, deleteMusicianAvatar } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kept comfortably under Vercel Functions' ~4.5MB request-body cap (see the
// matching client-side check in MusicianEditForm.tsx) — a larger file gets
// rejected by the platform itself before this route ever runs, as a
// non-JSON response the client can't turn into a useful message.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Logged-in-and-authorized upload of a musician's avatar — mirrors
// /api/profile/avatar. Re-encoded via sharp (strips EXIF, fixes size) and
// stored under a server-chosen musicians/<musicianId>/<random>.webp key,
// never a path the client supplies.
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const musician = await getMusicianBySlug(slug);
  if (!musician) {
    return NextResponse.json({ success: false, error: "Musician not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Log in to update this musician's avatar" },
      { status: 401 },
    );
  }
  if (!(await canEditMusician(user, musician.id))) {
    return NextResponse.json(
      { success: false, error: "You don't have edit access to this musician" },
      { status: 403 },
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ success: false, error: "No image provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ success: false, error: "Unsupported image type" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ success: false, error: "Image must be 4MB or smaller" }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const resized = await generateAvatar(bytes);
    const imageUrl = await uploadMusicianAvatar(musician.id, resized);

    await setMusicianAvatar(musician.id, imageUrl);

    if (musician.image_url) {
      await deleteMusicianAvatar(musician.image_url);
    }

    return NextResponse.json({ success: true, image_url: imageUrl });
  } catch (err) {
    console.error("musicians/avatar: upload failed", err);
    return NextResponse.json({ success: false, error: "Couldn't process that image" }, { status: 500 });
  }
}
