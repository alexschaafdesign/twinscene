import { SCRAPERS } from "@/lib/scrapers";
import { PRESS_SCRAPERS } from "@/lib/scrapers/pressScrapers";
import { COMPLETE_LIST_SOURCES } from "@/lib/scrapers/reconcile";
import { fetchBands, type Band } from "@/lib/fetchBands";
import { fetchVenues } from "@/lib/fetchVenues";
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

  const [log, bands, nonLocalBands, dismissedBands, venues]: [
    ScraperLogRow[],
    Band[],
    NonLocalBand[],
    DismissedBand[],
    Awaited<ReturnType<typeof fetchVenues>>,
  ] = await Promise.all([
    fetchScraperLog(),
    fetchBands(),
    fetchNonLocalBands(),
    fetchDismissedBands(),
    fetchVenues(),
  ]);

  // Venues flagged "manual scrape required" — no auto-scraper, so their shows
  // must be entered by hand. Surfaced as a reminder section in the panel.
  const manualVenues = venues
    .filter((v) => v.manualScrape)
    .map((v) => ({ name: v.name, slug: v.slug, city: v.city }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Only pass serializable data to the client (scrape functions can't cross).
  const scrapers = Object.values(SCRAPERS).map((s) => ({
    id: s.id,
    name: s.name,
  }));
  const pressOutlets = PRESS_SCRAPERS.map((p) => ({ id: p.id, name: p.name }));
  const reconcileOutletIds = COMPLETE_LIST_SOURCES.map((s) => s.id);

  return (
    <AdminPanel
      scrapers={scrapers}
      pressOutlets={pressOutlets}
      reconcileOutletIds={reconcileOutletIds}
      log={log}
      bands={bands}
      nonLocalBands={nonLocalBands}
      dismissedBands={dismissedBands}
      manualVenues={manualVenues}
      secret={secret}
      logConfigured={SCRAPER_LOG_CONFIGURED}
    />
  );
}
