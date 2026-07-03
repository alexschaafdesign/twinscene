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
import AdminPanel from "@/components/AdminPanel";

// Reads the secret and no-store data at request time — never cache.
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const secret = process.env.SCRAPE_SECRET;
  const provided = typeof sp.secret === "string" ? sp.secret : "";

  // Gate on SCRAPE_SECRET. Return a plain Unauthorized response, not a redirect.
  if (!secret || provided !== secret) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-20 text-center text-[#E8E0D0] sm:px-8">
        <h1 className="text-xl font-medium">Unauthorized</h1>
        <p className="mt-3 text-sm text-[#E8E0D0]/60">
          Append <code>?secret=…</code> to access the admin tools.
        </p>
      </main>
    );
  }

  const [log, bands, nonLocalBands]: [
    ScraperLogRow[],
    Band[],
    NonLocalBand[],
  ] = await Promise.all([
    fetchScraperLog(),
    fetchBands(),
    fetchNonLocalBands(),
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
      secret={provided}
      logConfigured={SCRAPER_LOG_CONFIGURED}
    />
  );
}
