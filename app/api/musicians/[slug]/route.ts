import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getMusicianBySlug,
  updateMusicianProfile,
  canEditMusician,
  ForbiddenMusicianEditError,
  InvalidMusicianNameError,
  InvalidMusicianBioError,
} from "@/lib/musicians";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logged-in-and-authorized edit of a musician's name/bio (app/m/[slug]/edit).
// Slug is never accepted here — it's the URL and stays immutable regardless
// of name edits (see lib/musicians.ts#updateMusicianProfile).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const musician = await getMusicianBySlug(slug);
  if (!musician) {
    return NextResponse.json({ success: false, error: "Musician not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to edit this musician" }, { status: 401 });
  }
  if (!(await canEditMusician(user, musician.id))) {
    return NextResponse.json(
      { success: false, error: "You don't have edit access to this musician" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const update: { name?: string; bio?: string | null } = {};
  if (typeof body.name === "string") update.name = body.name;
  if ("bio" in body) update.bio = typeof body.bio === "string" ? body.bio : null;

  try {
    const updated = await updateMusicianProfile(musician.id, update, user);
    return NextResponse.json({ success: true, musician: updated });
  } catch (err) {
    if (err instanceof InvalidMusicianNameError || err instanceof InvalidMusicianBioError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    if (err instanceof ForbiddenMusicianEditError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 });
    }
    throw err;
  }
}
