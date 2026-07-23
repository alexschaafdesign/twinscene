import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventBySlug, getTodayCentral } from "@/lib/songClub";
import { pageMetadata } from "@/lib/metadata";
import SongClubRSVPForm from "@/components/SongClubRSVPForm";

export const dynamic = "force-dynamic";

// "2026-08-15" -> "Saturday, August 15, 2026"
function formatDate(isoDate: string): string {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const event = await getEventBySlug((await params).slug);
  if (!event || !event.published) return { title: "Song Club — Twin Scene" };
  return pageMetadata({
    title: `${event.title} — Song Club — Twin Scene`,
    description: event.description?.slice(0, 200) ?? "A Twin Scene songwriter meetup. RSVP to join.",
    image: event.flyer_url,
  });
}

export default async function SongClubEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const event = await getEventBySlug((await params).slug);
  // Drafts 404 to the public — same as any unpublished content.
  if (!event || !event.published) notFound();

  const timeLine =
    event.start_time && event.end_time
      ? `${event.start_time}–${event.end_time}`
      : event.start_time || event.end_time || null;
  const isUpcoming = event.event_date >= getTodayCentral();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-6 text-[#E8E0D0] sm:px-8 sm:py-8">
      <Link href="/song-club" className="text-sm text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]">
        ← Song Club
      </Link>

      <header className="mt-4">
        <div className="text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/50">
          {formatDate(event.event_date)}
          {timeLine ? ` · ${timeLine}` : ""}
        </div>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{event.title}</h1>
      </header>

      {event.flyer_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.flyer_url}
          alt={event.title}
          className="mt-5 w-full max-w-md rounded-lg border border-[#E8E0D0]/15"
        />
      )}

      {event.venue_name && (
        <p className="mt-5 text-[15px] text-[#E8E0D0]/80">{event.venue_name}</p>
      )}

      {event.description && (
        <div className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-[#E8E0D0]/80">
          {event.description}
        </div>
      )}

      {isUpcoming ? (
        <section className="mt-8 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-5">
          <h2 className="text-lg font-medium">RSVP for this meetup</h2>
          <p className="mb-4 mt-1 text-sm text-[#E8E0D0]/60">
            RSVP below to get the address and full details emailed to you.
          </p>
          <SongClubRSVPForm eventId={event.id} />
        </section>
      ) : (
        <p className="mt-8 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 text-sm text-[#E8E0D0]/50">
          This meetup has already happened.
        </p>
      )}
    </main>
  );
}
