import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchVenues, matchVenue } from "@/lib/fetchVenues";
import { fetchShows, todayInChicago } from "@/lib/fetchShows";
import { fetchPress } from "@/lib/fetchPress";
import { getCurrentUser } from "@/lib/auth";
import { listShowStatuses } from "@/lib/showSaves";
import VenueProfile from "@/components/VenueProfile";
import { venueEditHref, venueLocationLabel } from "@/components/venue-shared";
import { iconProps } from "@/components/band-shared";
import BackLink from "@/components/BackLink";

type Props = {
  params: Promise<{ slug: string }>;
};

// fetchVenues() reads the DB directly (no fetch()), which gives Next no
// signal to render dynamically — without this a slug page (no
// generateStaticParams) gets cached after its first post-deploy render and
// goes stale on any later edit to that venue.
export const dynamic = "force-dynamic";

async function getVenue(slug: string) {
  const venues = await fetchVenues();
  return { venues, venue: venues.find((v) => v.slug === slug) ?? null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { venue } = await getVenue(slug);
  if (!venue) return {};

  const place = venueLocationLabel(venue);
  const description =
    venue.notes ||
    `${venue.name}${place ? ` — ${place}` : ""} on Twin Scene, the Twin Cities music directory.`;

  return {
    title: venue.name,
    description,
  };
}

export default async function VenueProfilePage({ params }: Props) {
  const { slug } = await params;
  const { venues, venue } = await getVenue(slug);
  if (!venue) notFound();

  const shows = await fetchShows();
  const press = await fetchPress();
  const venueShows = shows.filter(
    (s) => matchVenue(venues, s.venue)?.slug === venue.slug,
  );
  const user = await getCurrentUser();
  const showStatuses = user ? await listShowStatuses(user.id, venueShows.map((s) => s.id)) : {};

  const actions = (
    <Link
      href={venueEditHref(venue)}
      className="inline-flex items-center gap-2 text-sm font-medium text-[#E8E0D0] transition hover:text-[#E8E0D0]/80"
    >
      {/* ti-edit (Tabler) */}
      <svg {...iconProps} width={15} height={15}>
        <path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" />
        <path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z" />
        <path d="M16 5l3 3" />
      </svg>
      <span className="md:hidden">Edit</span>
      <span className="hidden md:inline">Edit this venue</span>
    </Link>
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8">
      <BackLink href="/venues" label="Venues" className="mb-6" />
      <VenueProfile
        venue={venue}
        shows={venueShows}
        press={press}
        today={todayInChicago()}
        showStatuses={showStatuses}
        loggedIn={!!user}
        actions={actions}
      />
    </main>
  );
}
