import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { consumeLoginToken, createSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Magic-link login, step 2: verifies the token from the emailed link (hash
// match, unexpired, unused), consumes it, upserts the user by email, and
// starts a session. Redirects home either way — /login?error=1 on failure.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";

  const user = token ? await consumeLoginToken(token) : null;
  if (!user) {
    redirect("/login?error=1");
  }

  await createSession(user.id);
  redirect("/");
}
