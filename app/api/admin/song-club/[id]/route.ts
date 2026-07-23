import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import {
  updateEvent,
  deleteEvent,
  getEventById,
  buildEventInput,
  type SongClubEventBody,
} from "@/lib/songClub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || !(await getEventById(id))) {
    return NextResponse.json({ success: false, error: "Event not found" }, { status: 404 });
  }

  const body = (await request.json()) as SongClubEventBody;
  const input = buildEventInput(body);
  if ("error" in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }

  const event = await updateEvent(id, input);
  return NextResponse.json({ success: true, event });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ success: false, error: "Bad id" }, { status: 400 });
  }

  await deleteEvent(id);
  return NextResponse.json({ success: true });
}
