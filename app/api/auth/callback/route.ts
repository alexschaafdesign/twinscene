import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { consumeLoginToken, createSession, sanitizeNextPath } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Magic-link login, step 2: verifies the token from the emailed link (hash
// match, unexpired, unused), consumes it, upserts the user by email, and
// starts a session. First-time accounts land on /welcome (carrying `next`
// along so its "continue" still lands where they were headed); returning
// users go straight to `next` (falling back to home). /login?error=1 on
// failure.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));

  const result = token ? await consumeLoginToken(token) : null;
  if (!result) {
    redirect("/login?error=1");
  }

  await createSession(result.user.id);

  if (result.isNew) {
    redirect(next ? `/welcome?next=${encodeURIComponent(next)}` : "/welcome");
  }
  redirect(next || "/");
}
