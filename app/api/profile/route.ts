import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  updateProfile,
  InvalidUsernameError,
  InvalidBioError,
  UsernameTakenError,
} from "@/lib/users";
import { geocodeAddress } from "@/lib/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Logged-in user editing their own name/username/bio (app/profile/edit).
// Avatar upload is the separate /api/profile/avatar route (multipart, needs
// sharp re-encoding rather than a JSON body).
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to edit your profile" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const update: {
    name?: string | null;
    username?: string | null;
    bio?: string | null;
    profile_public?: boolean;
    show_bio?: boolean;
    show_status?: boolean;
    show_followed_bands?: boolean;
    show_attended_shows?: boolean;
    home_address?: string | null;
    home_lat?: number | null;
    home_lng?: number | null;
  } = {};
  if ("name" in body) update.name = typeof body.name === "string" ? body.name : null;
  if ("username" in body) update.username = typeof body.username === "string" ? body.username : null;
  if ("bio" in body) update.bio = typeof body.bio === "string" ? body.bio : null;
  if (typeof body.profilePublic === "boolean") update.profile_public = body.profilePublic;
  if (typeof body.showBio === "boolean") update.show_bio = body.showBio;
  if (typeof body.showStatus === "boolean") update.show_status = body.showStatus;
  if (typeof body.showFollowedBands === "boolean") update.show_followed_bands = body.showFollowedBands;
  if (typeof body.showAttendedShows === "boolean") update.show_attended_shows = body.showAttendedShows;

  // Home address: geocode on save so shows can be sorted by distance. An empty
  // string clears the saved location (address + coords). A non-empty address
  // that we can't geocode is still stored, but with null coords — the sort just
  // stays unavailable and the UI can say we couldn't locate it.
  if ("homeAddress" in body) {
    const raw = typeof body.homeAddress === "string" ? body.homeAddress.trim() : "";
    if (!raw) {
      update.home_address = null;
      update.home_lat = null;
      update.home_lng = null;
    } else if (raw === user.home_address && user.home_lat != null) {
      // Unchanged and already located — skip the geocode call (and leave the
      // home_* fields out of the update) so saving an unrelated field is fast.
    } else {
      const point = await geocodeAddress(raw);
      update.home_address = raw;
      update.home_lat = point?.lat ?? null;
      update.home_lng = point?.lng ?? null;
    }
  }

  try {
    const updated = await updateProfile(user.id, update);
    return NextResponse.json({ success: true, user: updated });
  } catch (err) {
    if (err instanceof InvalidUsernameError || err instanceof InvalidBioError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    if (err instanceof UsernameTakenError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    throw err;
  }
}
