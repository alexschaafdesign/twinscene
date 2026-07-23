import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { searchIdentities, isGrantType } from "@/lib/userGrants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only typeahead behind the Users page grant picker: given ?type= and
// ?q=, returns up to 10 {id, name, slug} matches of that identity type. Read
// path, so is_admin is the only gate.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const type = request.nextUrl.searchParams.get("type");
  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (!isGrantType(type)) {
    return NextResponse.json({ success: false, error: "Unknown type" }, { status: 400 });
  }

  const results = await searchIdentities(type, q);
  return NextResponse.json({ success: true, results });
}
