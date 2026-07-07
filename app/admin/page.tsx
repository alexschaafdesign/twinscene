import { SCRAPERS } from "@/lib/scrapers";
import { fetchBands, type Band } from "@/lib/fetchBands";
import {
  fetchScraperLog,
  SCRAPER_LOG_CONFIGURED,
  type ScraperLogRow,
} from "@/lib/fetchScraperLog";
import {
  fetchNonLocalBands,
  type NonLocalBand,
} from "@/lib/fetchNonLocalBands";
import {
  fetchDismissedBands,
  type DismissedBand,
} from "@/lib/fetchDismissedBands";
import { cookies } from "next/headers";
import AdminPanel from "@/components/AdminPanel";
import { loginAdmin } from "./actions";
import { ADMIN_COOKIE } from "./constants";

// Reads the cookie/secret and no-store data at request time — never cache.
export const dynamic = "force-dynamic";

/** Password prompt shown when the visitor isn't logged in. */
function AdminLogin({ error }: { error: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-5 py-24 text-[#E8E0D0] sm:px-8">
      <h1 className="text-xl font-medium">TCMS Admin</h1>
      <p className="mt-2 text-sm text-[#E8E0D0]/60">
        Enter the admin password to continue.
      </p>
      <form action={loginAdmin} className="mt-6 flex flex-col gap-3">
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          className="w-full rounded-md border border-[#E8E0D0]/25 bg-transparent px-3.5 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/40 focus:border-[#E8E0D0]/60 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md border border-[#E8E0D0]/40 px-4 py-2 text-sm transition hover:bg-[#E8E0D0]/10"
        >
          Enter
        </button>
        {error && (
          <p className="text-sm text-[#F5A3A3]">Incorrect password.</p>
        )}
      </form>
    </main>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const secret = process.env.SCRAPE_SECRET;
  const provided = typeof sp.secret === "string" ? sp.secret : "";
  const cookieVal = (await cookies()).get(ADMIN_COOKIE)?.value;

  // Authenticated via the login cookie or a matching ?secret= (kept for
  // bookmarks/back-compat). Otherwise show the password form.
  const authed = !!secret && (cookieVal === secret || provided === secret);
  if (!authed) {
    return <AdminLogin error={sp.error === "1"} />;
  }

  const [log, bands, nonLocalBands, dismissedBands]: [
    ScraperLogRow[],
    Band[],
    NonLocalBand[],
    DismissedBand[],
  ] = await Promise.all([
    fetchScraperLog(),
    fetchBands(),
    fetchNonLocalBands(),
    fetchDismissedBands(),
  ]);

  // Only pass serializable data to the client (scrape functions can't cross).
  const scrapers = Object.values(SCRAPERS).map((s) => ({
    id: s.id,
    name: s.name,
  }));

  return (
    <AdminPanel
      scrapers={scrapers}
      log={log}
      bands={bands}
      nonLocalBands={nonLocalBands}
      dismissedBands={dismissedBands}
      secret={secret}
      logConfigured={SCRAPER_LOG_CONFIGURED}
    />
  );
}
