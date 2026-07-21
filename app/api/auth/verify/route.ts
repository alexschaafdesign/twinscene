import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { consumeToken, markEmailVerified, createSession, sanitizeNextPath } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Password signup, step 2: the emailed verification link lands here. Consumes
// the single-use 'verify' token, stamps email_verified_at, and — since clicking
// the link proves the address is theirs — starts a session immediately so the
// new account is logged in. Brand-new accounts go to /welcome (onboarding),
// carrying `next` so its continue button still lands where they were headed.
// A missing/expired/wrong-type token bounces to /login with a message.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));

  const email = token ? await consumeToken(token, "verify") : null;
  if (!email) {
    redirect("/login?verify=expired");
  }

  const user = await markEmailVerified(email);
  if (!user) {
    // Token was valid but the account is gone (deleted between mint and click).
    redirect("/login?verify=expired");
  }

  await createSession(user.id);
  redirect(next ? `/welcome?next=${encodeURIComponent(next)}` : "/welcome");
}
