import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SHOWS_ENABLED } from "@/lib/features";
import { fetchShowsForReview } from "@/lib/fetchShows";
import ReviewPanel from "@/components/ReviewPanel";

// Admin-only: reads no-store data at request time — never cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review Shows — Crawlspace",
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

  const shows = await fetchShowsForReview(REVIEW_WINDOW_DAYS);

  return (
    <ReviewPanel
      shows={shows}
      secret={secret ?? ""}
      windowDays={REVIEW_WINDOW_DAYS}
    />
  );
}
