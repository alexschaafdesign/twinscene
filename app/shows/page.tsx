import Link from "next/link";
import type { Metadata } from "next";
import { fetchShows, fetchPastShows, todayInChicago } from "@/lib/fetchShows";
import { fetchVenues } from "@/lib/fetchVenues";
import { fetchPress } from "@/lib/fetchPress";
import { getCurrentUser } from "@/lib/auth";
import { listShowStatuses } from "@/lib/showSaves";
import ShowsList from "@/components/ShowsList";
import BackLink from "@/components/BackLink";

export const metadata: Metadata = {
  title: "Upcoming Shows — Twin Scene",
  description: "This list is mostly created automatically by pulling info from venue websites. Still in beta!",
};

// How far back the "Recent" tab looks — just enough to make a just-happened
// show reachable for marking "I went to this", not a full history browser.
const PAST_SHOWS_DAYS = 30;

export default async function ShowsPage() {
  const [shows, pastShows, venues, press, user] = await Promise.all([
    fetchShows(),
    fetchPastShows(PAST_SHOWS_DAYS),
    fetchVenues(),
    fetchPress(),
    getCurrentUser(),
  ]);
  const statuses = user
    ? await listShowStatuses(user.id, [...shows, ...pastShows].map((s) => s.id))
    : {};

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <nav className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <BackLink href="/" label="Directory" />
            <Link
              href="/admin"
              className="text-sm text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
            >
              Admin
            </Link>
          </div>
          <Link
            href="/shows/submit"
            className="shrink-0 rounded-md border border-[#E8E0D0] px-4 py-2 text-sm font-medium text-[#E8E0D0] transition hover:bg-[#E8E0D0] hover:text-[#2A2420]"
          >
            Add a show →
          </Link>
        </nav>
        <h1 className="mt-6 text-2xl font-medium tracking-tight sm:text-3xl">
          Upcoming Shows
        </h1>
        <p className="mt-2 text-sm text-[#E8E0D0]/70">
          This list is mostly created automatically by pulling info from venue websites. Still in beta!
        </p>
      </header>

      <ShowsList
        shows={shows}
        pastShows={pastShows}
        venues={venues}
        press={press}
        today={todayInChicago()}
        statuses={statuses}
        loggedIn={!!user}
      />
    </main>
  );
}
