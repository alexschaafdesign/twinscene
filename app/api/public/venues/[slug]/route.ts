import { NextResponse } from "next/server";
import { authorize, CORS_HEADERS } from "@/lib/apiAuth";
import { getVenueBySlug } from "@/lib/venues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// GET — single venue by slug. 404 if no such venue.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const { slug } = await params;
  const venue = await getVenueBySlug(slug);
  if (!venue) {
    return NextResponse.json(
      { error: "Venue not found" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(venue, { headers: CORS_HEADERS });
}
