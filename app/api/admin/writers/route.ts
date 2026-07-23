import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { upsertWriter, type WriterSubmissionInput } from "@/lib/writers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WriterBody extends Partial<WriterSubmissionInput> {
  name?: string;
}

function normalize(body: WriterBody): WriterSubmissionInput {
  return {
    name: (body.name ?? "").trim(),
    bio: body.bio ?? "",
    city: body.city ?? "",
    publication: body.publication ?? "",
    website: body.website ?? "",
    substackUrl: body.substackUrl ?? "",
    instagram: body.instagram ?? "",
    twitter: body.twitter ?? "",
    contact: body.contact ?? "",
    photoUrl: body.photoUrl,
    thumbnailUrl: body.thumbnailUrl,
  };
}

// Admin creates a writer profile (v1: writers are seeded by admins; the public
// self-add form is a later slice). Mirrors /api/media-pros/submit but
// admin-gated.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
  }

  const body = normalize((await request.json()) as WriterBody);
  if (!body.name) {
    return NextResponse.json({ success: false, error: "A name is required" }, { status: 400 });
  }

  const { writer } = await upsertWriter(body, "add");
  return NextResponse.json({ success: true, writer });
}
