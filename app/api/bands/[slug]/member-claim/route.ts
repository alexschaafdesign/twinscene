import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBandBySlug } from "@/lib/bands";
import {
  createMemberClaim,
  DuplicateClaimError,
  MusicianAlreadyLinkedError,
  MusicianNotFoundError,
  UserAlreadyLinkedError,
} from "@/lib/bandMemberClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logged-in user requests to be linked as a member of this band — either an
// existing listed musician ({ musicianId }) or a brand-new one under a name
// they type ({ name }). Opens a 'pending' band_member_claims row for the
// band's owner (or an admin, for ownerless bands) to review — see
// /api/bands/[slug]/member-claims/[id].
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) {
    return NextResponse.json({ success: false, error: "Band not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to request to join this band" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  // musicians.id is a bigint — postgres.js (and thus the client, which just
  // echoes back whatever a server component handed it) carries it as a
  // string, not a JS number, so accept either and coerce.
  const rawMusicianId = body?.musicianId;
  const musicianId =
    (typeof rawMusicianId === "number" || typeof rawMusicianId === "string") && Number.isInteger(Number(rawMusicianId))
      ? Number(rawMusicianId)
      : null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!musicianId && !name) {
    return NextResponse.json(
      { success: false, error: "musicianId or name is required" },
      { status: 400 },
    );
  }

  try {
    const claim = await createMemberClaim(
      user,
      band.id,
      musicianId ? { musicianId } : { newName: name },
    );
    return NextResponse.json({ success: true, claim });
  } catch (err) {
    if (err instanceof DuplicateClaimError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    if (
      err instanceof MusicianAlreadyLinkedError ||
      err instanceof UserAlreadyLinkedError ||
      err instanceof MusicianNotFoundError
    ) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    throw err;
  }
}
