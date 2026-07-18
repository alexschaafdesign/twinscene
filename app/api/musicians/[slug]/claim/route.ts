import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMusicianBySlug } from "@/lib/musicians";
import {
  createMusicianClaim,
  DuplicateClaimError,
  MusicianAlreadyLinkedError,
  UserAlreadyLinkedError,
} from "@/lib/musicianClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logged-in user requests to be linked to an existing musician. Opens a
// 'pending' musician_claims row for an admin to review — see
// /api/admin/musician-claims.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const musician = await getMusicianBySlug(slug);
  if (!musician) {
    return NextResponse.json({ success: false, error: "Musician not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to claim a musician" }, { status: 401 });
  }

  try {
    const claim = await createMusicianClaim(user.id, musician.id);
    return NextResponse.json({ success: true, claim });
  } catch (err) {
    if (err instanceof DuplicateClaimError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    if (err instanceof MusicianAlreadyLinkedError || err instanceof UserAlreadyLinkedError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    throw err;
  }
}
