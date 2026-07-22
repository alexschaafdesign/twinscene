import Link from "next/link";
import type { Metadata } from "next";
import { todayInChicago } from "@/lib/fetchShows";
import { getCachedShows, getCachedPastShows, getCachedVenues } from "@/lib/cachedReads";
import { fetchPress } from "@/lib/fetchPress";
import { getCurrentUser } from "@/lib/auth";
import { listShowStatuses } from "@/lib/showSaves";
import ShowsList from "@/components/ShowsList";

export const metadata: Metadata = {
  title: "Upcoming Shows — Twin Scene",
  description: "This list is mostly created automatically by pulling info from venue websites. Still in beta!",
};

// How far back the "Recent" tab looks — just enough to make a just-happened
// show reachable for marking "I went to this", not a full history browser.
const PAST_SHOWS_DAYS = 30;

export default async function ShowsPage() {
  const today = todayInChicago();
  const [shows, pastShows, venues, press, user] = await Promise.all([
    getCachedShows(today),
    getCachedPastShows(PAST_SHOWS_DAYS, today),
    getCachedVenues(),
    fetchPress(),
    getCurrentUser(),
  ]);
  const statuses = user
    ? await listShowStatuses(user.id, [...shows, ...pastShows].map((s) => s.id))
    : {};

  // The viewer's saved home location, if any, enables sorting shows by how
  // close each venue is (never leaves the server as an address — only coords).
  const home =
    user && user.home_lat != null && user.home_lng != null
      ? { lat: user.home_lat, lng: user.home_lng }
      : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      {/* Visually hidden — every page needs an h1 for accessibility/SEO, but
          the header row (search/filters + CTA) carries the visual identity
          now, same as the home page. */}
      <h1 className="sr-only">Upcoming Shows — Twin Scene</h1>

      <ShowsList
        shows={shows}
        pastShows={pastShows}
        venues={venues}
        press={press}
        today={today}
        statuses={statuses}
        loggedIn={!!user}
        home={home}
        intro={
          <Link
            href="/shows/submit"
            className="inline-flex items-center gap-1 rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] shadow-sm transition hover:bg-white"
          >
            + Add a show
          </Link>
        }
      />
    </main>
  );
}
