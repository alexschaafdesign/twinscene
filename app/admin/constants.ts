// Name of the admin login cookie. Its value is the SCRAPE_SECRET itself, so the
// page can validate it against the env var without a separate session store.
// Kept out of actions.ts because a "use server" file may only export async
// functions.
export const ADMIN_COOKIE = "admin_auth";
