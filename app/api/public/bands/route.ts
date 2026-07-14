import { NextResponse } from "next/server";
import { authorize, CORS_HEADERS } from "@/lib/apiAuth";
import { getAllBands, findOrCreateBandByName, toPublicBand } from "@/lib/bands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// GET — all bands, allowlisted fields only. Any authenticated client (read or
// write) may call it.
export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const bands = await getAllBands();
  return NextResponse.json(bands.map(toPublicBand), { headers: CORS_HEADERS });
}

// POST — case-insensitive find-or-create by name. Requires a write-capable
// client (else 403). Returns the allowlisted band plus `matched`: true when an
// existing row matched, false when a new unreviewed band was created (201).
export async function POST(request: Request) {
  const auth = await authorize(request, { requireWrite: true });
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { band, matched } = await findOrCreateBandByName(name);
  return NextResponse.json(
    { ...toPublicBand(band), matched },
    { status: matched ? 200 : 201, headers: CORS_HEADERS },
  );
}
