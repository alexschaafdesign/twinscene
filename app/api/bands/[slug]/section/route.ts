import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canEditBand } from "@/lib/auth";
import { getBandBySlug, updateBandCoreFields } from "@/lib/bands";
import { SECTION_EDIT } from "@/lib/bandProfileFields";
import type { SectionId } from "@/lib/bandProfileLayout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Save one profile section's editable fields, from the in-place inspector.
//
// Two-layer validation: SECTION_EDIT (lib/bandProfileFields.ts) declares which
// sections are editable and what keys they accept — anything not in the schema
// is ignored, and values are clamped to the declared maxLength. Then a small
// per-section dispatch decides how those keys are actually written, reusing the
// existing gated updaters (so bio still notifies followers, etc.). A section
// that's read-only (declared with no fields, e.g. shows) or absent is refused.
//
// Authorization is the same canEditBand gate as every other band edit: a
// hidden inspector is not a permission check, so it's enforced here.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) {
    return NextResponse.json({ success: false, error: "Band not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in to edit this band" }, { status: 401 });
  }
  if (!(await canEditBand(user, band.id))) {
    return NextResponse.json(
      { success: false, error: "You don't have edit access to this band" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const section = (body as { section?: unknown } | null)?.section as SectionId | undefined;
  const rawValues = (body as { values?: unknown } | null)?.values;
  const values = rawValues && typeof rawValues === "object" ? (rawValues as Record<string, unknown>) : {};

  const schema = section ? SECTION_EDIT[section] : undefined;
  if (!schema || schema.fields.length === 0) {
    return NextResponse.json(
      { success: false, error: "This section can't be edited here" },
      { status: 400 },
    );
  }

  // Accept only declared keys; coerce to string and clamp to the field's max.
  const clean: Record<string, string> = {};
  for (const field of schema.fields) {
    let v = typeof values[field.key] === "string" ? (values[field.key] as string) : "";
    if (field.maxLength) v = v.slice(0, field.maxLength);
    clean[field.key] = v;
  }

  // Per-section write dispatch. Each case maps the cleaned keys onto an
  // existing gated updater. New editable sections add a case here.
  switch (section) {
    case "bio":
      await updateBandCoreFields(band.id, { bio: clean.bio }, user.id);
      break;
    default:
      return NextResponse.json(
        { success: false, error: "This section can't be edited here" },
        { status: 400 },
      );
  }

  return NextResponse.json({ success: true });
}
