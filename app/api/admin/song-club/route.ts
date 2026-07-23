import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { createEvent, buildEventInput, type SongClubEventBody } from "@/lib/songClub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a new Song Club event (admin only).
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
  }

  const body = (await request.json()) as SongClubEventBody;
  const input = buildEventInput(body);
  if ("error" in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }

  const event = await createEvent(input);
  return NextResponse.json({ success: true, event });
}
