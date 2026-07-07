"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE } from "./constants";

// The password the login form accepts. Prefer a memorable ADMIN_PASSWORD; fall
// back to SCRAPE_SECRET so login works even before ADMIN_PASSWORD is set.
function expectedPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD || process.env.SCRAPE_SECRET;
}

/** Form action: check the password, set a 30-day login cookie, land on /admin. */
export async function loginAdmin(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const secret = process.env.SCRAPE_SECRET;
  const expected = expectedPassword();

  if (secret && expected && password === expected) {
    (await cookies()).set(ADMIN_COOKIE, secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/admin",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    redirect("/admin");
  }

  redirect("/admin?error=1");
}

/** Form action: clear the login cookie. */
export async function logoutAdmin() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin");
}
