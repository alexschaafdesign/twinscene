import Link from "next/link";
import type { Metadata } from "next";
import { listEvents, getTodayCentral, type SongClubEvent } from "@/lib/songClub";

export const metadata: Metadata = {
  title: "Song Club — Twin Scene",
  description: "Songwriter meetups hosted by Twin Scene. RSVP to join us.",
};

// Reads the DB directly, so opt out of caching to keep the list fresh after
// edits (same note as /comrades).
export const dynamic = "force-dynamic";

// "2026-08-15" -> "Sat, Aug 15, 2026"
function formatDate(isoDate: string): string {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function EventCard({ event }: { event: SongClubEvent }) {
  const timeLine =
    event.start_time && event.end_time
      ? `${event.start_time}–${event.end_time}`
      : event.start_time || event.end_time || null;
  return (
    <Link
      href={`/song-club/${event.slug}`}
      className="block rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 transition hover:border-[#E8E0D0]/35 hover:bg-[#E8E0D0]/[0.06]"
    >
      <div className="text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/50">
        {formatDate(event.event_date)}
        {timeLine ? ` · ${timeLine}` : ""}
      </div>
      <div className="mt-1 text-lg font-medium text-[#E8E0D0]">{event.title}</div>
      {event.venue_name && (
        <div className="mt-0.5 text-sm text-[#E8E0D0]/60">{event.venue_name}</div>
      )}
    </Link>
  );
}

export default async function SongClubPage() {
  const events = await listEvents({ publishedOnly: true });
  const today = getTodayCentral();
  const upcoming = events.filter((e) => e.event_date >= today).reverse(); // soonest first
  const past = events.filter((e) => e.event_date < today); // most recent first

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8 sm:py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-[#E8E0D0] sm:text-4xl">Song Club</h1>
        <p className="mt-1 max-w-xl text-[15px] text-[#E8E0D0]/60">
          Songwriter meetups hosted by Twin Scene. RSVP to get the address and details.
        </p>
      </header>

      {events.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">No meetups scheduled yet — check back soon.</p>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
                Upcoming
              </h2>
              <div className="space-y-3">
                {upcoming.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
                Past
              </h2>
              <div className="space-y-3">
                {past.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
