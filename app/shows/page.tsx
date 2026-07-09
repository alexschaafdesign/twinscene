import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchShows } from "@/lib/fetchShows";
import { fetchVenues } from "@/lib/fetchVenues";
import { fetchPress } from "@/lib/fetchPress";
import { SHOWS_ENABLED } from "@/lib/features";
import ShowsList from "@/components/ShowsList";

export const metadata: Metadata = {
  title: "Upcoming Shows — Twin Scene",
  description: "This list is mostly created automatically by pulling info from venue websites. Still in beta!",
};

export default async function ShowsPage() {
  if (!SHOWS_ENABLED) notFound();
  const [shows, venues, press] = await Promise.all([
    fetchShows(),
    fetchVenues(),
    fetchPress(),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-8 border-b border-[#E8E0D0]/20 pb-6">
        <nav className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-[#E8E0D0]/60 transition hover:text-[#E8E0D0]"
            >
              <span aria-hidden>←</span> Directory
            </Link>
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

      <ShowsList shows={shows} venues={venues} press={press} />
    </main>
  );
}
