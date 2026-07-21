import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { geocodeAddress } from "@/lib/geocode";
import { findNeighborhood } from "@/lib/geo/neighborhoods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Best-effort "which neighborhood is this address in?" for the venue form's
// "Detect" button. Geocodes the address (free Census geocoder), then matches
// the point against bundled Minneapolis/St. Paul boundaries. Login-gated like
// the other venue write actions — it's only reachable from the submit form and
// leans on an external service, so no anonymous access. Returns the detected
// city too, since matching a polygon tells us which city it's in.

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Log in first." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const city = typeof body?.city === "string" ? body.city.trim() : "";
  if (!address) {
    return NextResponse.json(
      { success: false, error: "Enter an address first." },
      { status: 400 },
    );
  }

  const point = await geocodeAddress(address, city);
  if (!point) {
    return NextResponse.json({
      success: true,
      neighborhood: null,
      reason: "We couldn't locate that address.",
    });
  }

  const match = findNeighborhood(point.lng, point.lat);
  if (!match) {
    return NextResponse.json({
      success: true,
      neighborhood: null,
      reason: "That address isn't in a Minneapolis or St. Paul neighborhood we have boundaries for.",
    });
  }

  return NextResponse.json({
    success: true,
    neighborhood: match.neighborhood,
    city: match.city,
  });
}
