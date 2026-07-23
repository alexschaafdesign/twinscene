import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getComradeBySlug } from "@/lib/comrades";
import { listComradeEditors, addComradeEditor, removeComradeEditor } from "@/lib/comradeEditors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only management of a comrade listing's editors. Every branch here
// re-checks is_admin server-side — the admin UI is just a convenience, not
// the gate. Mirrors app/api/admin/media-pros/[slug]/editors/route.ts.

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comrade = await getComradeBySlug(slug);
  if (!comrade) {
    return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const editors = await listComradeEditors(comrade.id);
  return NextResponse.json({ success: true, editors });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comrade = await getComradeBySlug(slug);
  if (!comrade) {
    return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const role = typeof body?.role === "string" && body.role.trim() ? body.role.trim() : "editor";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ success: false, error: "Enter a valid email" }, { status: 400 });
  }

  const editor = await addComradeEditor(comrade.id, email, role);
  return NextResponse.json({ success: true, editor });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comrade = await getComradeBySlug(slug);
  if (!comrade) {
    return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.user_id === "number" ? body.user_id : Number(body?.user_id);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ success: false, error: "Missing user_id" }, { status: 400 });
  }

  await removeComradeEditor(comrade.id, userId);
  return NextResponse.json({ success: true });
}
