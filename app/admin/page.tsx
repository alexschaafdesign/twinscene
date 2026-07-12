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
import AdminPanel from "@/components/AdminPanel";
import AdminLogin from "@/components/AdminLogin";
import { isAdminAuthed } from "./auth";

// Reads the cookie/secret and no-store data at request time — never cache.
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const secret = process.env.SCRAPE_SECRET;
  const provided = typeof sp.secret === "string" ? sp.secret : "";

  if (!secret || !(await isAdminAuthed(provided))) {
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
