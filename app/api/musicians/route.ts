import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createMusicianForUser, UserAlreadyHasMusicianError } from "@/lib/musicians";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Self-serve: create a brand-new musician identity for the current user (no
// admin review, no bands attached — claiming an existing musician is the
// path that grants band_editors access). If an existing musician's name
// matches exactly, no duplicate is created; the response signals `matched`
// so the UI can nudge toward claiming that one instead.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to create a musician profile" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
  }

  try {
    const result = await createMusicianForUser(user.id, name);
    if ("matched" in result) {
      return NextResponse.json({
        success: false,
        matched: true,
        musician: result.musician,
        error: "An existing musician matches this name — claim it instead?",
      });
    }
    return NextResponse.json({ success: true, musician: result });
  } catch (err) {
    if (err instanceof UserAlreadyHasMusicianError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    throw err;
  }
}
