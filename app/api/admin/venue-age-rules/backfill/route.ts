import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import {
  getVenueAgeRuleMap,
  backfillVenueAgeRule,
} from "@/lib/scrapers/venueAgeRules";
import { revalidateShows } from "@/lib/cachedReads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: apply a venue's saved rule to shows ALREADY in the DB (the
// "apply to existing shows" button). Fill-only — never overwrites a show that
// already has an age restriction — so it's safe to click repeatedly. POST
// { venueName }; the rule itself comes from the DB, so the client can't push an
// arbitrary restriction through this path.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const venueName = typeof body?.venueName === "string" ? body.venueName.trim() : "";
  if (!venueName) {
    return NextResponse.json({ success: false, error: "Missing venueName" }, { status: 400 });
  }

  const rule = (await getVenueAgeRuleMap()).get(venueName);
  if (!rule) {
    return NextResponse.json(
      { success: false, error: "No saved rule for this venue" },
      { status: 404 },
    );
  }

  const { updated } = await backfillVenueAgeRule(rule);
  if (updated > 0) revalidateShows();
  return NextResponse.json({ success: true, updated });
}
