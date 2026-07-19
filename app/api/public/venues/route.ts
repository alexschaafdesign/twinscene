import { NextResponse } from "next/server";
import { authorize, CORS_HEADERS } from "@/lib/apiAuth";
import { getAllVenues } from "@/lib/venues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// GET — all venues. Every column is public (unlike bands, there's no
// restricted field to allowlist away), so this returns full rows. Any
// authenticated client (read or write) may call it — no POST, since nothing
// external creates venues.
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const venues = await getAllVenues();
  return NextResponse.json(venues, { headers: CORS_HEADERS });
}
