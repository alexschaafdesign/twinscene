import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  updateProfile,
  InvalidUsernameError,
  InvalidBioError,
  UsernameTakenError,
} from "@/lib/users";

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
  } = {};
  if ("name" in body) update.name = typeof body.name === "string" ? body.name : null;
  if ("username" in body) update.username = typeof body.username === "string" ? body.username : null;
  if ("bio" in body) update.bio = typeof body.bio === "string" ? body.bio : null;
  if (typeof body.profilePublic === "boolean") update.profile_public = body.profilePublic;

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
