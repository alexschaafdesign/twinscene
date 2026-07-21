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
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import NotAdmin from "@/components/NotAdmin";

// Reads the session and no-store data at request time — never cache.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdmin(user)) return <NotAdmin />;

  // The scraper/show APIs the panel drives still authenticate with the
  // SCRAPE_SECRET machine token (cron and scrape:local use it too). This page
  // is is_admin-gated, so only admins ever receive it.
  const secret = process.env.SCRAPE_SECRET ?? "";

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
