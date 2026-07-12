import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "./constants";

/**
 * Whether the current request is authenticated as admin: a matching login
 * cookie, or a `?secret=` query param (kept for bookmarks/back-compat).
 * Shared by every /admin/* page so they all honor the same login.
 */
export async function isAdminAuthed(providedSecret: string): Promise<boolean> {
  const secret = process.env.SCRAPE_SECRET;
  const cookieVal = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!secret && (cookieVal === secret || providedSecret === secret);
}
