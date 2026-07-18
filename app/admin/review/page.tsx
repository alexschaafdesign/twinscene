import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import NotAdmin from "@/components/NotAdmin";
import {
  fetchFlaggedShows,
  fetchShowsForReview,
  reviewWindow,
  type Show,
} from "@/lib/fetchShows";
import ReviewPanel from "@/components/ReviewPanel";

// Admin-only: reads no-store data at request time — never cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review Shows — Twin Scene",
  robots: { index: false, follow: false },
};

const REVIEW_WINDOW_DAYS = 7;

export default async function AdminReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/review");
  if (!isAdmin(user)) return <NotAdmin />;

  // Still handed to ReviewPanel for its calls to the SCRAPE_SECRET-gated show
  // APIs; this page is is_admin-gated, so only admins receive it.
  const secret = process.env.SCRAPE_SECRET ?? "";

  const { end: windowEnd } = reviewWindow(REVIEW_WINDOW_DAYS);
  const [windowShows, flaggedShows] = await Promise.all([
    fetchShowsForReview(REVIEW_WINDOW_DAYS),
    fetchFlaggedShows(),
  ]);

  // Union by id: flaggedShows brings in flagged rows dated beyond the 7-day
  // window (scrapers pull months out), so those aren't otherwise reachable.
  const byId = new Map<string, Show>(windowShows.map((s) => [s.id, s]));
  for (const show of flaggedShows) {
    if (!byId.has(show.id)) byId.set(show.id, show);
  }

  return (
    <ReviewPanel
      shows={Array.from(byId.values())}
      secret={secret}
      windowDays={REVIEW_WINDOW_DAYS}
      windowEnd={windowEnd}
    />
  );
}
