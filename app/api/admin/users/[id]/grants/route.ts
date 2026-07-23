import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  listUserGrants,
  grantIdentity,
  revokeIdentity,
  isGrantType,
  GrantNotFound,
  MusicianLinkConflict,
  type GrantTarget,
} from "@/lib/userGrants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only, user-centric management of editing rights: list / grant / revoke
// the bands, writers, comrades, and musician a given user may edit. Every
// branch re-checks is_admin server-side (a missing button is never the gate).
// Mirrors the account-side editor routes (e.g. api/admin/writers/[slug]/editors),
// only keyed by user id instead of by identity slug.

// Loads the target user's id + email (the join-table grant primitives are keyed
// by email; the musician link needs the id). 404 if no such user.
async function loadTarget(idParam: string): Promise<GrantTarget | null> {
  const id = Number(idParam);
  if (!Number.isInteger(id)) return null;
  const [row] = await sql<{ id: number; email: string }[]>`
    select id, email from users where id = ${id} limit 1
  `;
  return row ?? null;
}

async function requireAdmin() {
  const user = await getCurrentUser();
  return isAdmin(user);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireAdmin())) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  const target = await loadTarget(id);
  if (!target) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }
  const grants = await listUserGrants(target.id);
  return NextResponse.json({ success: true, grants });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireAdmin())) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  const target = await loadTarget(id);
  if (!target) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const type = body?.type;
  const targetId = typeof body?.target_id === "number" ? body.target_id : Number(body?.target_id);
  const role = body?.role === "owner" ? "owner" : "editor";
  if (!isGrantType(type)) {
    return NextResponse.json({ success: false, error: "Unknown access type" }, { status: 400 });
  }
  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ success: false, error: "Choose something to grant" }, { status: 400 });
  }

  try {
    const grants = await grantIdentity(type, targetId, target, role);
    return NextResponse.json({ success: true, grants });
  } catch (err) {
    if (err instanceof MusicianLinkConflict) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    if (err instanceof GrantNotFound) {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireAdmin())) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  const target = await loadTarget(id);
  if (!target) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const type = body?.type;
  const targetId = typeof body?.target_id === "number" ? body.target_id : Number(body?.target_id);
  if (!isGrantType(type)) {
    return NextResponse.json({ success: false, error: "Unknown access type" }, { status: 400 });
  }
  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ success: false, error: "Missing target_id" }, { status: 400 });
  }

  const grants = await revokeIdentity(type, targetId, target);
  return NextResponse.json({ success: true, grants });
}
