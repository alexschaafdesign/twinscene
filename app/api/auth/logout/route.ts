import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deletes the current session row (if any) and clears the cookie.
export async function POST() {
  await destroySession();
  return NextResponse.json({ success: true });
}
