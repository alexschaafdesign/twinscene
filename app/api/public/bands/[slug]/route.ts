import { NextResponse } from "next/server";
import { authorize, CORS_HEADERS } from "@/lib/apiAuth";
import { getBandBySlug, toPublicBand } from "@/lib/bands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// GET — single band by slug, allowlisted fields only. 404 if no such band.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const { slug } = await params;
  const band = await getBandBySlug(slug);
  if (!band) {
    return NextResponse.json(
      { error: "Band not found" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(toPublicBand(band), { headers: CORS_HEADERS });
}
