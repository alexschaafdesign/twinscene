import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditWriter } from "@/lib/auth";
import { getWriterBySlug, upsertWriter, type WriterSubmissionInput } from "@/lib/writers";

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
    removePhoto: body.removePhoto,
  };
}

// Update a writer profile. Gated on canEditWriter (admin OR an assigned
// writer_editor), so a claimed writer can edit their own page via the same
// endpoint — mirrors the media-pro self-editing model.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const writer = await getWriterBySlug(slug);
  if (!writer) {
    return NextResponse.json({ success: false, error: "Writer not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!(await canEditWriter(user, writer.id))) {
    return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
  }

  const body = normalize((await request.json()) as WriterBody);
  if (!body.name) {
    return NextResponse.json({ success: false, error: "A name is required" }, { status: 400 });
  }

  const { writer: updated } = await upsertWriter(body, "correct", slug);
  return NextResponse.json({ success: true, writer: updated });
}
