import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import {
  upsertVenueAgeRule,
  deleteVenueAgeRule,
} from "@/lib/scrapers/venueAgeRules";
import { sqlTimeOrNull } from "@/lib/showTime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The restriction labels the UI offers. Kept in sync with VenueAgeRulesPanel's
// dropdown; normalizeAge (showGenres.ts) would tidy freeform input, but here we
// control the source so an allowlist is simpler and safer.
const RESTRICTIONS = new Set(["21+", "18+", "All Ages"]);

// Admin-only: set or clear a venue's blanket age rule (venue_age_rules, 0056).
// PUT { venueName, restriction, appliesAfter }:
//   - restriction one of RESTRICTIONS -> upsert the rule
//   - restriction "" / "none" -> clear it (delete the row)
//   - appliesAfter "HH:MM" or null/"" -> time gate; null = applies to every show
// Gated on is_admin server-side (never on hidden UI, per docs/auth-and-db.md).
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const venueName = typeof body?.venueName === "string" ? body.venueName.trim() : "";
  if (!venueName) {
    return NextResponse.json({ success: false, error: "Missing venueName" }, { status: 400 });
  }

  const restriction = typeof body?.restriction === "string" ? body.restriction.trim() : "";

  // Empty / "none" -> the venue has no rule; remove any existing row.
  if (!restriction || restriction.toLowerCase() === "none") {
    await deleteVenueAgeRule(venueName);
    return NextResponse.json({ success: true, rule: null });
  }

  if (!RESTRICTIONS.has(restriction)) {
    return NextResponse.json({ success: false, error: "Invalid restriction" }, { status: 400 });
  }

  // sqlTimeOrNull validates "HH:MM"; anything empty/garbage becomes null = blanket.
  const appliesAfter = sqlTimeOrNull(body?.appliesAfter);

  await upsertVenueAgeRule(venueName, restriction, appliesAfter);
  return NextResponse.json({
    success: true,
    rule: { venueName, restriction, appliesAfter },
  });
}
