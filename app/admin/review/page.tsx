import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SHOWS_ENABLED } from "@/lib/features";
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

export default async function AdminReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!SHOWS_ENABLED) notFound();

  const sp = await searchParams;
  const secret = process.env.SCRAPE_SECRET;
  const provided = typeof sp.secret === "string" ? sp.secret : "";

  if (secret && provided !== secret) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-8">
        <h1 className="text-xl font-medium">Not authorized</h1>
        <p className="mt-3 text-sm text-[#E8E0D0]/60">
          Append <code>?secret=…</code> to access the review tool.
        </p>
      </main>
    );
  }

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
      secret={secret ?? ""}
      windowDays={REVIEW_WINDOW_DAYS}
      windowEnd={windowEnd}
    />
  );
}
